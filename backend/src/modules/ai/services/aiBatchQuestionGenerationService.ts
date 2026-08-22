import { prisma } from '../../../config/prisma';
import { Role, QuestionType, Difficulty, AIGeneratedQuestionStatus, AIQuestionQualityStatus, AIQuestionSimilarityStatus } from '@prisma/client';
import { GenerationDistributionService } from './generationDistributionService';
import { AnswerVerificationService } from './answerVerificationService';
import { QuestionValidationService } from './questionValidationService';
import { QuestionSimilarityService } from './questionSimilarityService';
import { AIProviderService } from './aiProviderService';
import { RAGService } from './ragService';
import { AICircuitBreakerService } from './aiCircuitBreakerService';

export interface BatchGenerationConfig {
  totalQuestions: number;
  difficultyDistribution: { EASY: number; MEDIUM: number; HARD: number };
  typeDistribution: { MCQ: number; MSQ: number; NAT: number };
  negativeMarking?: boolean;
  solutionVisibility?: string;
  sourceReferences?: boolean;
  selectedResourceIds?: string[];
  subjectId?: string;
  moduleId?: string;
  topicId?: string;
  subtopicId?: string;
  generationRequestId?: string;
}

export interface BatchGenerationResult {
  success: boolean;
  status: 'COMPLETED' | 'GENERATED_PARTIAL_BATCH' | 'FAILED' | 'INVALID_GENERATION_COUNT';
  message: string;
  generationRequestId: string;
  requestedCount: number;
  generatedCount: number;
  validatedCount: number;
  verifiedCount: number;
  pendingReviewCount: number;
  duplicateCount: number;
  failedCount: number;
  questions: any[];
}

export class AIBatchQuestionGenerationService {
  private static SUB_BATCH_SIZE = 10; // Number of questions generated per LLM provider call

  /**
   * Main entry point for source-grounded batch GATE question generation.
   */
  public static async generateBatch(
    userId: string,
    role: Role,
    config: BatchGenerationConfig
  ): Promise<BatchGenerationResult> {
    const startTime = Date.now();

    // 1. Role-Based Access Control
    if (role !== Role.FACULTY && role !== Role.ADMIN) {
      throw new Error('Forbidden: Only Faculty and Admin users are authorized to generate questions.');
    }

    // 2. Circuit Breaker Protection Check
    if (!AICircuitBreakerService.checkCircuitBreaker().allowed) {
      throw new Error('Circuit Breaker is OPEN: AI Question Generation is temporarily paused by System Admin.');
    }

    const {
      totalQuestions = 50,
      difficultyDistribution = { EASY: 20, MEDIUM: 50, HARD: 30 },
      typeDistribution = { MCQ: 60, MSQ: 10, NAT: 30 },
      selectedResourceIds = [],
      subjectId,
      moduleId,
      topicId,
      subtopicId,
      generationRequestId = `gen_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    } = config;

    // 3. Idempotency Check
    const existingJob = await prisma.aIBatchGenerationJob.findUnique({
      where: { generationRequestId },
    });

    if (existingJob) {
      const existingQuestions = await prisma.aIGeneratedQuestion.findMany({
        where: { generationRequestId },
        orderBy: { createdAt: 'asc' },
      });

      return {
        success: existingJob.status !== 'FAILED',
        status: existingJob.status as any,
        message: existingJob.statusMessage || 'Returned previously generated batch for this request ID (idempotent replay).',
        generationRequestId,
        requestedCount: existingJob.requestedCount,
        generatedCount: existingJob.generatedCount,
        validatedCount: existingJob.validatedCount,
        verifiedCount: existingJob.verifiedCount,
        pendingReviewCount: existingJob.pendingReviewCount,
        duplicateCount: existingJob.duplicateCount,
        failedCount: existingJob.failedCount,
        questions: existingQuestions,
      };
    }

    // 4. Validate Distribution and Permissions Server-Side
    const distResult = await GenerationDistributionService.validateGenerationRequest({
      totalQuestions,
      difficultyDistribution,
      typeDistribution,
      selectedResourceIds,
      userId,
      role,
    });

    if (!distResult.isValid) {
      return {
        success: false,
        status: 'INVALID_GENERATION_COUNT',
        message: distResult.errorMessage || 'Invalid generation request parameters.',
        generationRequestId,
        requestedCount: totalQuestions,
        generatedCount: 0,
        validatedCount: 0,
        verifiedCount: 0,
        pendingReviewCount: 0,
        duplicateCount: 0,
        failedCount: totalQuestions,
        questions: [],
      };
    }

    // Create Initial Batch Job Record
    await prisma.aIBatchGenerationJob.create({
      data: {
        generationRequestId,
        createdById: userId,
        requestedCount: totalQuestions,
        status: 'PROCESSING',
        difficultyDistribution,
        typeDistribution,
        selectedResourceIds: distResult.authorizedResourceIds,
        subjectId,
        moduleId,
        topicId,
        subtopicId,
        negativeMarking: config.negativeMarking ?? true,
        solutionVisibility: config.solutionVisibility || 'SHOW_AFTER_RESULT',
        sourceReferences: config.sourceReferences ?? true,
      },
    });

    // 5. Retrieve Factual Grounding Context strictly from Uploaded Resources
    let retrievedChunks: any[] = [];

    if (distResult.authorizedResourceIds.length > 0) {
      const chunks = await prisma.aIDocumentChunk.findMany({
        where: {
          documentId: { in: distResult.authorizedResourceIds },
        },
        include: { document: true },
        take: 150,
      });
      retrievedChunks = chunks.map((c) => ({
        chunkId: c.id,
        documentId: c.documentId,
        documentTitle: c.document.title,
        content: c.content,
        metadata: c.metadata,
      }));
    } else {
      // General RAG context fallback across user's accessible documents
      const ragRes = await RAGService.executeRAGPipeline({
        userMessage: 'GATE Examination syllabus core concepts and textbook material',
        userId,
        role,
      });
      retrievedChunks = ragRes.evaluation?.validatedChunks || [];
    }

    // MANDATORY GROUNDING RULE: STOP generation if insufficient source content is available
    if (retrievedChunks.length === 0) {
      const msg = 'Insufficient source content is available to generate a verified question.';
      await prisma.aIBatchGenerationJob.update({
        where: { generationRequestId },
        data: { status: 'FAILED', statusMessage: msg },
      });

      return {
        success: false,
        status: 'FAILED',
        message: msg,
        generationRequestId,
        requestedCount: totalQuestions,
        generatedCount: 0,
        validatedCount: 0,
        verifiedCount: 0,
        pendingReviewCount: 0,
        duplicateCount: 0,
        failedCount: totalQuestions,
        questions: [],
      };
    }

    const contextText = retrievedChunks
      .map((c, i) => `[Source Document: "${c.documentTitle}" | Chunk: ${c.chunkId}]:\n${c.content}`)
      .join('\n\n---\n\n');

    const sourceDocumentIds = Array.from(new Set(retrievedChunks.map((c) => c.documentId)));
    const sourceChunkIds = Array.from(new Set(retrievedChunks.map((c) => c.chunkId)));

    // Taxonomy lookup
    let targetSubtopicId = subtopicId;
    if (!targetSubtopicId && topicId) {
      const sub = await prisma.subtopic.findFirst({ where: { topicId } });
      if (sub) targetSubtopicId = sub.id;
    }
    if (!targetSubtopicId) {
      const sub = await prisma.subtopic.findFirst();
      if (sub) targetSubtopicId = sub.id;
    }

    // 6. Sub-Batch Generation Loop
    const generatedQuestionsList: any[] = [];
    let duplicateCount = 0;
    let failedCount = 0;

    // Expand target generation plan (e.g. 30 MCQ, 10 MSQ, 10 NAT | 10 Easy, 25 Med, 15 Hard)
    const plan: Array<{ type: QuestionType; difficulty: Difficulty }> = [];
    const typeCounts: Record<string, number> = { ...distResult.allocatedTypeCounts };
    const diffCounts: Record<string, number> = { ...distResult.allocatedDifficultyCounts };

    const types: QuestionType[] = ['MCQ', 'MSQ', 'NAT'];
    const diffs: Difficulty[] = ['EASY', 'MEDIUM', 'HARD'];

    for (const t of types) {
      for (let i = 0; i < (typeCounts[t] || 0); i++) {
        // Assign difficulty sequentially based on diffCounts remaining
        let chosenDiff: Difficulty = 'MEDIUM';
        for (const d of diffs) {
          if ((diffCounts[d] || 0) > 0) {
            chosenDiff = d;
            diffCounts[d] -= 1;
            break;
          }
        }
        plan.push({ type: t, difficulty: chosenDiff });
      }
    }

    // Process plan in chunks of SUB_BATCH_SIZE (e.g. 10 at a time)
    for (let batchStart = 0; batchStart < plan.length; batchStart += this.SUB_BATCH_SIZE) {
      const currentBatchPlan = plan.slice(batchStart, batchStart + this.SUB_BATCH_SIZE);

      const prompt = `
You are an expert GATE Exam Item Writer.
Generate exactly ${currentBatchPlan.length} GATE-style questions strictly grounded in the provided source context.

GROUNDING RULE:
Use ONLY facts, formulas, and definitions from the provided Source Context.
Do NOT use outside knowledge or hallucinate concepts not mentioned in the source context.

Target Plan for this batch:
${currentBatchPlan.map((p, idx) => `${idx + 1}. Type: ${p.type}, Difficulty: ${p.difficulty}`).join('\n')}

Source Context:
"""
${contextText.slice(0, 12000)}
"""

JSON Format Requirement:
Return a JSON array of ${currentBatchPlan.length} question objects:
[
  {
    "stem": "Detailed GATE question stem text",
    "type": "MCQ" | "MSQ" | "NAT",
    "difficulty": "EASY" | "MEDIUM" | "HARD",
    "options": ["Option A", "Option B", "Option C", "Option D"], // Required for MCQ & MSQ (exactly 4 options). Omit or null for NAT.
    "correctAnswer": 0 (for MCQ index 0..3) | [0, 2] (for MSQ indices) | 42.5 (for NAT number or {"value": 42.5, "tolerance": 0.1}),
    "explanation": "Step-by-step derivation and source justification",
    "sourceQuote": "Exact quote from context supporting this question"
  }
]
`;

      try {
        const aiResponse = await AIProviderService.generateResponse(
          'You generate strict source-grounded GATE questions. Return valid JSON array only.',
          [],
          prompt
        );

        if (!aiResponse.success || !aiResponse.content) {
          failedCount += currentBatchPlan.length;
          continue;
        }

        let cleanJson = aiResponse.content.trim();
        if (cleanJson.startsWith('```')) {
          cleanJson = cleanJson.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
        }

        const rawQuestions = JSON.parse(cleanJson);
        const qArray = Array.isArray(rawQuestions) ? rawQuestions : [rawQuestions];

        for (const rawQ of qArray) {
          // Structural Validation
          const valResult = QuestionValidationService.validateQuestion(rawQ);
          if (!valResult.isValid) {
            failedCount++;
            continue;
          }

          // Deduplication Check
          const simResult = await QuestionSimilarityService.checkSimilarity(
            valResult.sanitizedStem,
            targetSubtopicId
          );

          if (simResult.status === AIQuestionSimilarityStatus.DUPLICATE) {
            duplicateCount++;
            continue;
          }

          // Independent Answer Verification
          const verResult = await AnswerVerificationService.verifyAnswer({
            stem: valResult.sanitizedStem,
            type: rawQ.type as QuestionType,
            options: valResult.normalizedOptions,
            proposedAnswer: valResult.normalizedCorrectAnswer,
            explanation: valResult.sanitizedExplanation || '',
            sourceContext: contextText,
          });

          // Determine final review status
          const finalStatus =
            verResult.verificationStatus === 'FAIL'
              ? AIGeneratedQuestionStatus.REJECTED
              : AIGeneratedQuestionStatus.PENDING_REVIEW;

          // Save AIGeneratedQuestion record
          const createdQ = await prisma.aIGeneratedQuestion.create({
            data: {
              generationRequestId,
              stem: valResult.sanitizedStem,
              type: rawQ.type || QuestionType.MCQ,
              difficulty: rawQ.difficulty || Difficulty.MEDIUM,
              marks: rawQ.type === QuestionType.NAT ? 2.0 : 1.0,
              negativeMarks: rawQ.type === QuestionType.MCQ ? 0.33 : 0.0,
              options: valResult.normalizedOptions ? valResult.normalizedOptions : undefined,
              correctAnswer: valResult.normalizedCorrectAnswer,
              explanation: valResult.sanitizedExplanation,
              generatedAnswer: valResult.normalizedCorrectAnswer,
              verifiedAnswer: verResult.verifiedAnswer,
              verificationStatus: verResult.verificationStatus,
              sourcePageNumbers: { page: 1, section: 'Uploaded Resource' },
              ambiguityDetected: verResult.ambiguityDetected,
              provenanceValid: verResult.sourceSupported,
              subjectId,
              moduleId,
              topicId,
              subtopicId: targetSubtopicId,
              status: finalStatus,
              qualityStatus: valResult.qualityStatus,
              qualityScore: valResult.qualityScore,
              similarityStatus: simResult.status,
              similarQuestionId: simResult.similarQuestionId || null,
              sourceDocumentIds,
              sourceChunkIds,
              createdById: userId,
            },
          });

          generatedQuestionsList.push(createdQ);
        }
      } catch (err: any) {
        console.error('[AIBatchQuestionGenerationService] Sub-batch processing error:', err.message);
        failedCount += currentBatchPlan.length;
      }
    }

    // 7. Calculate Final Batch Status
    const generatedCount = generatedQuestionsList.length;
    const validatedCount = generatedQuestionsList.filter((q) => q.status !== AIGeneratedQuestionStatus.REJECTED).length;
    const verifiedCount = generatedQuestionsList.filter((q) => q.verificationStatus === 'PASS').length;
    const pendingReviewCount = generatedQuestionsList.filter((q) => q.status === AIGeneratedQuestionStatus.PENDING_REVIEW).length;

    const isPartial = generatedCount < totalQuestions;
    const finalBatchStatus = isPartial ? 'GENERATED_PARTIAL_BATCH' : 'COMPLETED';
    const statusMsg = isPartial
      ? `Generated ${generatedCount} out of ${totalQuestions} requested questions. Insufficient source context for remaining ${totalQuestions - generatedCount} questions.`
      : `Successfully generated and verified ${generatedCount} GATE questions grounded in uploaded resources.`;

    // Update Batch Job Record
    await prisma.aIBatchGenerationJob.update({
      where: { generationRequestId },
      data: {
        generatedCount,
        validatedCount,
        verifiedCount,
        pendingReviewCount,
        failedCount,
        duplicateCount,
        status: finalBatchStatus,
        statusMessage: statusMsg,
      },
    });

    return {
      success: true,
      status: finalBatchStatus,
      message: statusMsg,
      generationRequestId,
      requestedCount: totalQuestions,
      generatedCount,
      validatedCount,
      verifiedCount,
      pendingReviewCount,
      duplicateCount,
      failedCount,
      questions: generatedQuestionsList,
    };
  }

  /**
   * Retrieves active batch generation job status for polling.
   */
  public static async getBatchJobStatus(generationRequestId: string) {
    const job = await prisma.aIBatchGenerationJob.findUnique({
      where: { generationRequestId },
      include: {
        createdBy: { select: { name: true, email: true } },
      },
    });

    if (!job) {
      throw new Error(`Batch generation job '${generationRequestId}' not found.`);
    }

    const questions = await prisma.aIGeneratedQuestion.findMany({
      where: { generationRequestId },
      orderBy: { createdAt: 'asc' },
    });

    return {
      success: true,
      job,
      questions,
    };
  }
}
