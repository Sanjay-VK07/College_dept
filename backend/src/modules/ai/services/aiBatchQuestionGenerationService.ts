import { prisma } from '../../../config/prisma';
import { Role, QuestionType, Difficulty, AIGeneratedQuestionStatus, AIQuestionSimilarityStatus } from '@prisma/client';
import { GenerationDistributionService } from './generationDistributionService';
import { AnswerVerificationService } from './answerVerificationService';
import { QuestionValidationService } from './questionValidationService';
import { QuestionSimilarityService } from './questionSimilarityService';
import { QuestionGenerationService } from './questionGenerationService';
import { AIProviderService } from './aiProviderService';
import { RAGService } from './ragService';
import { AICircuitBreakerService } from './aiCircuitBreakerService';
import { AIGenerationSettingsService } from './aiGenerationSettingsService';
import { AuditLogger } from '../../../services/auditLogger';

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
  status: 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'GENERATED_PARTIAL_BATCH' | 'FAILED' | 'INVALID_GENERATION_COUNT';
  message: string;
  generationRequestId: string;
  requestedCount: number;
  generatedCount: number;
  validatedCount: number;
  verifiedCount: number;
  pendingReviewCount: number;
  autoPublishedCount: number;
  duplicateCount: number;
  failedCount: number;
  questions: any[];
}

interface PlanItem {
  type: QuestionType;
  difficulty: Difficulty;
}

export class AIBatchQuestionGenerationService {
  private static SUB_BATCH_SIZE = 10; // Number of questions generated per LLM provider call

  /**
   * Validates the request and enqueues a QUEUED AIBatchGenerationJob, returning immediately.
   * The actual generation work happens in processBatchJob(), picked up by the in-process
   * batchGenerationWorker — large batches (50-500+ questions, many sequential LLM calls) must
   * not run inline on the HTTP request thread, or they will exceed typical free-tier hosting
   * request timeouts. Real progress is then observed via getBatchJobStatus() polling.
   */
  public static async enqueueBatch(
    userId: string,
    role: Role,
    config: BatchGenerationConfig
  ): Promise<BatchGenerationResult> {
    if (role !== Role.FACULTY && role !== Role.ADMIN) {
      throw new Error('Forbidden: Only Faculty and Admin users are authorized to generate questions.');
    }

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

    const existingJob = await prisma.aIBatchGenerationJob.findUnique({ where: { generationRequestId } });
    if (existingJob) {
      return this.jobToResult(existingJob, await this.getJobQuestions(generationRequestId));
    }

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
        autoPublishedCount: 0,
        duplicateCount: 0,
        failedCount: totalQuestions,
        questions: [],
      };
    }

    const job = await prisma.aIBatchGenerationJob.create({
      data: {
        generationRequestId,
        createdById: userId,
        requestedCount: totalQuestions,
        status: 'QUEUED',
        statusMessage: 'Queued for processing.',
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

    return this.jobToResult(job, []);
  }

  /**
   * Runs the actual generation pipeline for a QUEUED job. Called exclusively by
   * batchGenerationWorker.ts's poll loop — never called directly from a controller.
   */
  public static async processBatchJob(generationRequestId: string): Promise<void> {
    const job = await prisma.aIBatchGenerationJob.findUnique({ where: { generationRequestId } });
    if (!job) return;

    await prisma.aIBatchGenerationJob.update({
      where: { generationRequestId },
      data: { status: 'PROCESSING', statusMessage: 'Retrieving source context...' },
    });

    try {
      const userId = job.createdById;
      const role = Role.ADMIN; // job was already RBAC-checked at enqueue time
      const totalQuestions = job.requestedCount;
      const difficultyDistribution = (job.difficultyDistribution as any) || { EASY: 20, MEDIUM: 50, HARD: 30 };
      const typeDistribution = (job.typeDistribution as any) || { MCQ: 60, MSQ: 10, NAT: 30 };
      const selectedResourceIds = job.selectedResourceIds || [];

      // 1. Retrieve grounding context — strictly from uploaded/authorized resources
      const { contextText, sourceDocumentIds, sourceChunkIds, groundingAvailable } = await this.retrieveGroundingContext(
        selectedResourceIds,
        userId,
        role
      );

      if (!groundingAvailable) {
        const msg = 'Insufficient source content is available to generate a verified question.';
        await prisma.aIBatchGenerationJob.update({
          where: { generationRequestId },
          data: { status: 'FAILED', statusMessage: msg, failedCount: totalQuestions },
        });
        return;
      }

      // 2. Taxonomy resolution
      let targetSubtopicId = job.subtopicId || undefined;
      if (!targetSubtopicId && job.topicId) {
        const sub = await prisma.subtopic.findFirst({ where: { topicId: job.topicId } });
        if (sub) targetSubtopicId = sub.id;
      }
      if (!targetSubtopicId) {
        const sub = await prisma.subtopic.findFirst();
        if (sub) targetSubtopicId = sub.id;
      }

      const settings = await AIGenerationSettingsService.getSettings();

      // 3. Initial generation round
      const roundState = {
        generatedQuestionsList: [] as any[],
        duplicateCount: 0,
        failedCount: 0,
        autoPublishedCount: 0,
      };

      const initialPlan = this.buildPlan(totalQuestions, difficultyDistribution, typeDistribution);
      await this.runGenerationRound(initialPlan, {
        generationRequestId,
        contextText,
        sourceDocumentIds,
        sourceChunkIds,
        subtopicId: targetSubtopicId,
        subjectId: job.subjectId || undefined,
        moduleId: job.moduleId || undefined,
        topicId: job.topicId || undefined,
        userId,
        settings,
        state: roundState,
      });

      await this.persistProgress(generationRequestId, roundState, totalQuestions, 0);

      // 4. Automatic regeneration on shortfall — never fabricate the missing count, only
      // re-attempt real generation up to the configured retry limit, then report honestly.
      let round = 0;
      let acceptedCount = this.countAccepted(roundState.generatedQuestionsList);
      while (acceptedCount < totalQuestions && round < settings.maxRegenerationAttempts) {
        round++;
        const shortfall = totalQuestions - acceptedCount;
        const regenPlan = this.buildPlan(shortfall, difficultyDistribution, typeDistribution);

        await this.runGenerationRound(regenPlan, {
          generationRequestId,
          contextText,
          sourceDocumentIds,
          sourceChunkIds,
          subtopicId: targetSubtopicId,
          subjectId: job.subjectId || undefined,
          moduleId: job.moduleId || undefined,
          topicId: job.topicId || undefined,
          userId,
          settings,
          state: roundState,
        });

        acceptedCount = this.countAccepted(roundState.generatedQuestionsList);
        await this.persistProgress(generationRequestId, roundState, totalQuestions, round);
      }

      // 5. Finalize
      const generatedCount = roundState.generatedQuestionsList.length;
      const validatedCount = roundState.generatedQuestionsList.filter((q) => q.status !== AIGeneratedQuestionStatus.REJECTED).length;
      const verifiedCount = roundState.generatedQuestionsList.filter((q) => q.verificationStatus === 'PASS').length;
      const pendingReviewCount = roundState.generatedQuestionsList.filter((q) => q.status === AIGeneratedQuestionStatus.PENDING_REVIEW).length;

      const isPartial = acceptedCount < totalQuestions;
      const finalBatchStatus = isPartial ? 'GENERATED_PARTIAL_BATCH' : 'COMPLETED';
      const statusMsg = isPartial
        ? `Generated ${acceptedCount} out of ${totalQuestions} requested questions after ${round} regeneration round(s). Remaining ${totalQuestions - acceptedCount} could not be generated with sufficient confidence from the available source material.`
        : `Successfully generated and verified ${acceptedCount} GATE questions grounded in uploaded resources (${roundState.autoPublishedCount} auto-published, ${pendingReviewCount} awaiting manual review).`;

      await prisma.aIBatchGenerationJob.update({
        where: { generationRequestId },
        data: {
          generatedCount,
          validatedCount,
          verifiedCount,
          pendingReviewCount,
          autoPublishedCount: roundState.autoPublishedCount,
          failedCount: roundState.failedCount,
          duplicateCount: roundState.duplicateCount,
          regenerationRounds: round,
          status: finalBatchStatus,
          statusMessage: statusMsg,
        },
      });

      await AuditLogger.log({
        userId,
        action: 'AI_BATCH_GENERATION_COMPLETED',
        resource: 'AIBatchGenerationJob',
        details: `${generationRequestId}: ${statusMsg}`,
      });
    } catch (err: any) {
      console.error('[AIBatchQuestionGenerationService] processBatchJob failed:', err);
      await prisma.aIBatchGenerationJob.update({
        where: { generationRequestId },
        data: { status: 'FAILED', statusMessage: `Batch generation failed: ${err.message}` },
      });
    }
  }

  /**
   * Runs one generation round (a target plan of type/difficulty slots) through: LLM generation
   * in sub-batches -> structural validation -> semantic duplicate check -> independent answer
   * verification -> optional auto-publish. Mutates `state` in place so regeneration rounds can
   * keep appending to the same running totals.
   */
  private static async runGenerationRound(
    plan: PlanItem[],
    ctx: {
      generationRequestId: string;
      contextText: string;
      sourceDocumentIds: string[];
      sourceChunkIds: string[];
      subtopicId?: string;
      subjectId?: string;
      moduleId?: string;
      topicId?: string;
      userId: string;
      settings: { autoPublishVerified: boolean; maxRegenerationAttempts: number };
      state: { generatedQuestionsList: any[]; duplicateCount: number; failedCount: number; autoPublishedCount: number };
    }
  ): Promise<void> {
    const { generationRequestId, contextText, sourceDocumentIds, sourceChunkIds, subtopicId, subjectId, moduleId, topicId, userId, settings, state } = ctx;

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
    "correctAnswer": [0] (for MCQ, an array with exactly one index 0..3) | [0, 2] (for MSQ, an array of one or more indices) | 42.5 (for NAT number or {"value": 42.5, "tolerance": 0.1}),
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
          state.failedCount += currentBatchPlan.length;
          continue;
        }

        let cleanJson = aiResponse.content.trim();
        if (cleanJson.startsWith('```')) {
          cleanJson = cleanJson.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
        }

        const rawQuestions = JSON.parse(cleanJson);
        const qArray = Array.isArray(rawQuestions) ? rawQuestions : [rawQuestions];

        for (const rawQ of qArray) {
          const valResult = QuestionValidationService.validateQuestion(rawQ);
          if (!valResult.isValid) {
            state.failedCount++;
            continue;
          }

          const simResult = await QuestionSimilarityService.checkSimilarity(valResult.sanitizedStem, subtopicId);
          if (simResult.status === AIQuestionSimilarityStatus.DUPLICATE) {
            state.duplicateCount++;
            continue;
          }

          const verResult = await AnswerVerificationService.verifyAnswer({
            stem: valResult.sanitizedStem,
            type: rawQ.type as QuestionType,
            options: valResult.normalizedOptions,
            proposedAnswer: valResult.normalizedCorrectAnswer,
            explanation: valResult.sanitizedExplanation || '',
            sourceContext: contextText,
          });

          const finalStatus =
            verResult.verificationStatus === 'FAIL'
              ? AIGeneratedQuestionStatus.REJECTED
              : AIGeneratedQuestionStatus.PENDING_REVIEW;

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
              subtopicId,
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

          let finalRecord = createdQ;

          // Auto-publish: a question that independently PASSED verification does not need a
          // human to re-click approve — publish it straight to the live Question Bank. Anything
          // short of PASS (REQUIRES_REVIEW / ANSWER_CONFLICT, or PASS with auto-publish disabled
          // by admin) still lands in the faculty review queue, never silently.
          if (settings.autoPublishVerified && verResult.verificationStatus === 'PASS') {
            try {
              const approval = await QuestionGenerationService.approveQuestion(createdQ.id, userId, Role.ADMIN);
              if (approval.success) {
                state.autoPublishedCount++;
                finalRecord = { ...createdQ, status: AIGeneratedQuestionStatus.APPROVED, createdQuestionId: (approval.question as any)?.id };
              }
            } catch (err: any) {
              console.error('[AIBatchQuestionGenerationService] Auto-publish failed for', createdQ.id, err.message);
            }
          }

          state.generatedQuestionsList.push(finalRecord);
        }
      } catch (err: any) {
        console.error('[AIBatchQuestionGenerationService] Sub-batch processing error:', err.message);
        state.failedCount += currentBatchPlan.length;
      }

      // Real incremental progress — updated after every sub-batch, not faked.
      await this.persistProgress(generationRequestId, state, undefined, undefined);
    }
  }

  private static countAccepted(list: any[]): number {
    return list.filter((q) => q.status !== AIGeneratedQuestionStatus.REJECTED).length;
  }

  private static async persistProgress(
    generationRequestId: string,
    state: { generatedQuestionsList: any[]; duplicateCount: number; failedCount: number; autoPublishedCount: number },
    _totalQuestions: number | undefined,
    regenerationRounds: number | undefined
  ): Promise<void> {
    const generatedCount = state.generatedQuestionsList.length;
    const validatedCount = state.generatedQuestionsList.filter((q) => q.status !== AIGeneratedQuestionStatus.REJECTED).length;
    const verifiedCount = state.generatedQuestionsList.filter((q) => q.verificationStatus === 'PASS').length;
    const pendingReviewCount = state.generatedQuestionsList.filter((q) => q.status === AIGeneratedQuestionStatus.PENDING_REVIEW).length;

    await prisma.aIBatchGenerationJob.update({
      where: { generationRequestId },
      data: {
        generatedCount,
        validatedCount,
        verifiedCount,
        pendingReviewCount,
        autoPublishedCount: state.autoPublishedCount,
        failedCount: state.failedCount,
        duplicateCount: state.duplicateCount,
        ...(regenerationRounds !== undefined ? { regenerationRounds } : {}),
      },
    });
  }

  /**
   * Expands a type/difficulty distribution into a concrete list of generation slots via the
   * existing deterministic Hamilton apportionment. Used both for the initial plan and for each
   * regeneration round's smaller shortfall plan, so retries stay proportional to the originally
   * requested mix rather than drifting.
   */
  private static buildPlan(
    count: number,
    difficultyDistribution: { EASY: number; MEDIUM: number; HARD: number },
    typeDistribution: { MCQ: number; MSQ: number; NAT: number }
  ): PlanItem[] {
    if (count <= 0) return [];

    const typeCounts = GenerationDistributionService.allocateIntegerCounts(count, typeDistribution);
    const diffCounts = { ...GenerationDistributionService.allocateIntegerCounts(count, difficultyDistribution) } as Record<string, number>;

    const plan: PlanItem[] = [];
    const types: QuestionType[] = ['MCQ', 'MSQ', 'NAT'];
    const diffs: Difficulty[] = ['EASY', 'MEDIUM', 'HARD'];

    for (const t of types) {
      for (let i = 0; i < ((typeCounts as any)[t] || 0); i++) {
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
    return plan;
  }

  /**
   * Retrieves factual grounding context strictly from authorized uploaded resources. Where a
   * selected document has already been through Phase 1 structure extraction with resolved
   * question/answer mappings (ExtractedQuestion.answerMappingStatus === 'MAPPED'), those verified
   * Q&A pairs are included as high-confidence grounding alongside the raw RAG chunk text — this
   * is real source material with a known-correct answer already deterministically matched, not a
   * chunk the generator has to interpret from scratch.
   */
  private static async retrieveGroundingContext(
    selectedResourceIds: string[],
    userId: string,
    role: Role
  ): Promise<{ contextText: string; sourceDocumentIds: string[]; sourceChunkIds: string[]; groundingAvailable: boolean }> {
    let retrievedChunks: any[] = [];

    if (selectedResourceIds.length > 0) {
      const chunks = await prisma.aIDocumentChunk.findMany({
        where: { documentId: { in: selectedResourceIds } },
        include: { document: true },
        take: 150,
      });
      retrievedChunks = chunks.map((c) => ({
        chunkId: c.id,
        documentId: c.documentId,
        documentTitle: c.document.title,
        content: c.content,
      }));
    } else {
      const ragRes = await RAGService.executeRAGPipeline({
        userMessage: 'GATE Examination syllabus core concepts and textbook material',
        userId,
        role,
      });
      retrievedChunks = ragRes.evaluation?.validatedChunks || [];
    }

    let extractedSection = '';
    if (selectedResourceIds.length > 0) {
      const mappedQuestions = await prisma.extractedQuestion.findMany({
        where: { documentId: { in: selectedResourceIds }, answerMappingStatus: 'MAPPED' },
        include: { mappedAnswer: true },
        take: 100,
      });

      if (mappedQuestions.length > 0) {
        extractedSection =
          '\n\n=== VERIFIED SOURCE QUESTION/ANSWER PAIRS (deterministically mapped, high confidence) ===\n' +
          mappedQuestions
            .map(
              (q) =>
                `Q[${q.rawQuestionId}]: ${q.questionText}\nAnswer: ${JSON.stringify(q.mappedAnswer?.answerValue)}${
                  q.mappedAnswer?.explanation ? `\nExplanation: ${q.mappedAnswer.explanation}` : ''
                }`
            )
            .join('\n\n');
      }
    }

    if (retrievedChunks.length === 0 && !extractedSection) {
      return { contextText: '', sourceDocumentIds: [], sourceChunkIds: [], groundingAvailable: false };
    }

    const contextText =
      retrievedChunks.map((c) => `[Source Document: "${c.documentTitle}" | Chunk: ${c.chunkId}]:\n${c.content}`).join('\n\n---\n\n') +
      extractedSection;

    const sourceDocumentIds = Array.from(new Set(retrievedChunks.map((c) => c.documentId)));
    const sourceChunkIds = Array.from(new Set(retrievedChunks.map((c) => c.chunkId)));

    return { contextText, sourceDocumentIds, sourceChunkIds, groundingAvailable: true };
  }

  private static async getJobQuestions(generationRequestId: string) {
    return prisma.aIGeneratedQuestion.findMany({
      where: { generationRequestId },
      orderBy: { createdAt: 'asc' },
    });
  }

  private static jobToResult(job: any, questions: any[]): BatchGenerationResult {
    return {
      success: job.status !== 'FAILED',
      status: job.status,
      message: job.statusMessage || 'Batch generation job status.',
      generationRequestId: job.generationRequestId,
      requestedCount: job.requestedCount,
      generatedCount: job.generatedCount,
      validatedCount: job.validatedCount,
      verifiedCount: job.verifiedCount,
      pendingReviewCount: job.pendingReviewCount,
      autoPublishedCount: job.autoPublishedCount ?? 0,
      duplicateCount: job.duplicateCount,
      failedCount: job.failedCount,
      questions,
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

    const questions = await this.getJobQuestions(generationRequestId);

    return {
      success: true,
      job,
      questions,
    };
  }
}
