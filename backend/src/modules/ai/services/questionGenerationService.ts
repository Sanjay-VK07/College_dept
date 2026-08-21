import { prisma } from '../../../config/prisma';
import { Role, QuestionType, Difficulty, AIGeneratedQuestionStatus, AIQuestionQualityStatus, AIQuestionSimilarityStatus } from '@prisma/client';
import { RAGService } from './ragService';
import { AIProviderService } from './aiProviderService';
import { QuestionValidationService } from './questionValidationService';
import { QuestionSimilarityService } from './questionSimilarityService';
import { QuestionGenerationPrompt } from '../prompts/questionGenerationPrompt';
import { GenerateQuestionsDTO, QuestionGenerationResult, RawGeneratedQuestion } from '../types/questionGenerationTypes';
import { ENV } from '../../../config/env';

export class QuestionGenerationService {
  private static MAX_GENERATION_BATCH_SIZE = 10;

  /**
   * Main production pipeline for AI GATE Question Generation using RAG knowledge base.
   */
  public static async generateQuestions(
    userId: string,
    role: Role,
    dto: GenerateQuestionsDTO
  ): Promise<QuestionGenerationResult> {
    const startTime = performance.now();

    // 1. Role-Based Access Control: Only FACULTY or ADMIN can trigger question generation
    if (role !== Role.FACULTY && role !== Role.ADMIN) {
      throw new Error('Forbidden: Only Faculty and Admin users are authorized to generate questions.');
    }

    const {
      subjectId,
      moduleId,
      topicId,
      subtopicId,
      questionType,
      difficulty,
      count = 1,
      documentId,
      generationRequestId,
    } = dto;

    // 2. Validate Batch Size Count
    const requestedCount = Math.min(Math.max(1, count), this.MAX_GENERATION_BATCH_SIZE);

    // 3. Idempotency Check via generationRequestId
    if (generationRequestId) {
      const existingTrace = await prisma.aIQuestionGenerationTrace.findUnique({
        where: { generationRequestId },
      });

      if (existingTrace) {
        const existingQuestions = await prisma.aIGeneratedQuestion.findMany({
          where: { generationRequestId },
          orderBy: { createdAt: 'asc' },
        });

        return {
          success: true,
          message: 'Returned previously generated questions for this request ID (idempotent replay).',
          generationRequestId,
          generatedCount: existingQuestions.length,
          questions: existingQuestions,
          traceId: existingTrace.id,
        };
      }
    }

    // 4. Validate Taxonomy Hierarchy Relationships
    let validatedSubtopicId = subtopicId;
    let targetSubjectName = '';
    let targetTopicName = '';

    if (subtopicId) {
      const subtopic = await prisma.subtopic.findUnique({
        where: { id: subtopicId },
        include: { topic: { include: { module: { include: { subject: true } } } } },
      });

      if (!subtopic) {
        throw new Error(`Invalid taxonomy: Subtopic '${subtopicId}' not found.`);
      }

      if (topicId && subtopic.topicId !== topicId) {
        throw new Error(`Taxonomy mismatch: Subtopic '${subtopicId}' does not belong to Topic '${topicId}'.`);
      }

      if (moduleId && subtopic.topic.moduleId !== moduleId) {
        throw new Error(`Taxonomy mismatch: Topic does not belong to Module '${moduleId}'.`);
      }

      if (subjectId && subtopic.topic.module.subjectId !== subjectId) {
        throw new Error(`Taxonomy mismatch: Module does not belong to Subject '${subjectId}'.`);
      }

      targetSubjectName = subtopic.topic.module.subject.name;
      targetTopicName = subtopic.topic.name;
    } else if (topicId) {
      const topic = await prisma.topic.findUnique({
        where: { id: topicId },
        include: { module: { include: { subject: true } }, subtopics: true },
      });

      if (!topic) {
        throw new Error(`Invalid taxonomy: Topic '${topicId}' not found.`);
      }

      targetSubjectName = topic.module.subject.name;
      targetTopicName = topic.name;

      if (topic.subtopics.length > 0) {
        validatedSubtopicId = topic.subtopics[0].id;
      }
    } else {
      // Fallback: Pick first taxonomy subtopic if unassigned
      const fallbackSubtopic = await prisma.subtopic.findFirst({
        include: { topic: { include: { module: { include: { subject: true } } } } },
      });
      if (fallbackSubtopic) {
        validatedSubtopicId = fallbackSubtopic.id;
        targetSubjectName = fallbackSubtopic.topic.module.subject.name;
        targetTopicName = fallbackSubtopic.topic.name;
      }
    }

    // 5. Retrieve Authorized Academic Context via RAG
    const ragQuery = targetTopicName
      ? `GATE exam question concepts for ${targetSubjectName} ${targetTopicName}`
      : `GATE examination syllabus core concepts and mathematical formulas`;

    const ragResult = await RAGService.executeRAGPipeline({
      userMessage: ragQuery,
      userId,
      role,
    });

    const chunks = ragResult.evaluation?.validatedChunks || [];

    // CRITICAL SAFETY RULE — NO HALLUCINATION / NO FAKE QUESTIONS
    if (!ragResult.ragUsed || chunks.length === 0) {
      return {
        success: false,
        message: 'Insufficient authorized academic context is available to generate a verified question.',
        generatedCount: 0,
        questions: [],
      };
    }

    // Assemble text context from authorized chunks
    const contextText = chunks
      .map((c: any, i: number) => `[Chunk ${i + 1} - ${c.documentTitle}]: ${c.content}`)
      .join('\n\n');

    const sourceDocumentIds: string[] = Array.from(new Set(chunks.map((c: any) => c.documentId)));
    const sourceChunkIds: string[] = Array.from(new Set(chunks.map((c: any) => c.chunkId)));

    // 6. Invoke AI Provider for Structured JSON Question Generation
    const systemPrompt = QuestionGenerationPrompt.buildSystemPrompt();
    const userPrompt = QuestionGenerationPrompt.buildUserPrompt({
      contextText,
      questionType,
      difficulty,
      count: requestedCount,
      subjectName: targetSubjectName,
      topicName: targetTopicName,
    });

    const genStartTime = performance.now();
    const aiResponse = await AIProviderService.generateResponse(
      systemPrompt,
      [],
      userPrompt
    );

    const genDurationMs = Math.round(performance.now() - genStartTime);

    if (!aiResponse.success || !aiResponse.content) {
      throw new Error(`AI Provider generation failed: ${aiResponse.message || 'Unknown error'}`);
    }

    // 7. Parse Structured JSON
    let parsedRawQuestions: RawGeneratedQuestion[] = [];
    try {
      let cleanJsonText = aiResponse.content.trim();

      if (cleanJsonText.startsWith('```')) {
        cleanJsonText = cleanJsonText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
      }

      const jsonObj = JSON.parse(cleanJsonText);
      parsedRawQuestions = Array.isArray(jsonObj) ? jsonObj : jsonObj.questions || [jsonObj];
    } catch (parseErr: any) {
      throw new Error(`Failed to parse AI provider structured JSON output: ${parseErr.message}`);
    }

    // 8. Deterministic Validation & Similarity Checking per Question
    const verStartTime = performance.now();
    const savedGeneratedQuestions: any[] = [];

    for (const rawQ of parsedRawQuestions) {
      // Validate Structure & Quality
      const valResult = QuestionValidationService.validateQuestion(rawQ);

      // Check Duplicate / Similarity in Question Bank
      const simResult = await QuestionSimilarityService.checkSimilarity(valResult.sanitizedStem, validatedSubtopicId);

      // Save AIGeneratedQuestion Record
      const createdRecord = await prisma.aIGeneratedQuestion.create({
        data: {
          generationRequestId: generationRequestId || null,
          stem: valResult.sanitizedStem,
          type: rawQ.type || questionType || QuestionType.MCQ,
          difficulty: rawQ.difficulty || difficulty || Difficulty.MEDIUM,
          marks: (rawQ.type || questionType) === QuestionType.NAT ? 2.0 : 1.0,
          negativeMarks: (rawQ.type || questionType) === QuestionType.MCQ ? 0.33 : 0.0,
          options: valResult.normalizedOptions ? valResult.normalizedOptions : undefined,
          correctAnswer: valResult.normalizedCorrectAnswer,
          explanation: valResult.sanitizedExplanation,
          subjectId,
          moduleId,
          topicId,
          subtopicId: validatedSubtopicId,
          status: valResult.isValid ? AIGeneratedQuestionStatus.PENDING_REVIEW : AIGeneratedQuestionStatus.REJECTED,
          qualityStatus: valResult.qualityStatus,
          qualityScore: valResult.qualityScore,
          similarityStatus: simResult.status,
          similarQuestionId: simResult.similarQuestionId || null,
          sourceDocumentIds,
          sourceChunkIds,
          createdById: userId,
        },
      });

      savedGeneratedQuestions.push(createdRecord);
    }

    const verDurationMs = Math.round(performance.now() - verStartTime);
    const totalDurationMs = Math.round(performance.now() - startTime);

    // 9. Record Operational Trace
    const trace = await prisma.aIQuestionGenerationTrace.create({
      data: {
        generationRequestId: generationRequestId || `gen_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        generatedById: userId,
        subjectId,
        moduleId,
        topicId,
        subtopicId: validatedSubtopicId,
        questionType: questionType || null,
        requestedDifficulty: difficulty || null,
        requestedCount,
        generatedCount: savedGeneratedQuestions.length,
        validationStatus: savedGeneratedQuestions.every((q) => q.status === AIGeneratedQuestionStatus.PENDING_REVIEW) ? 'PASS' : 'PARTIAL',
        qualityStatus: savedGeneratedQuestions.some((q) => q.qualityStatus === AIQuestionQualityStatus.PASS) ? 'PASS' : 'REVIEW',
        sourceDocumentCount: sourceDocumentIds.length,
        sourceChunkCount: sourceChunkIds.length,
        generationDurationMs: genDurationMs,
        verificationDurationMs: verDurationMs,
        totalDurationMs,
      },
    });

    return {
      success: true,
      message: `Successfully generated ${savedGeneratedQuestions.length} GATE-style questions.`,
      generationRequestId,
      generatedCount: savedGeneratedQuestions.length,
      questions: savedGeneratedQuestions,
      traceId: trace.id,
    };
  }

  /**
   * Retrieves pending AI-generated questions for Faculty/Admin review.
   */
  public static async getPendingQuestions(params: {
    userId: string;
    role: Role;
    status?: AIGeneratedQuestionStatus;
    page?: number;
    limit?: number;
  }) {
    const { userId, role, status = AIGeneratedQuestionStatus.PENDING_REVIEW, page = 1, limit = 10 } = params;

    if (role !== Role.FACULTY && role !== Role.ADMIN) {
      throw new Error('Forbidden: Only Faculty and Admin users can access review queue.');
    }

    const skip = (page - 1) * limit;

    const [total, data] = await Promise.all([
      prisma.aIGeneratedQuestion.count({ where: { status } }),
      prisma.aIGeneratedQuestion.findMany({
        where: { status },
        include: {
          subtopic: {
            include: {
              topic: {
                include: {
                  module: {
                    include: { subject: true },
                  },
                },
              },
            },
          },
          createdBy: { select: { name: true, email: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    return {
      success: true,
      total,
      page,
      limit,
      data,
    };
  }

  /**
   * Approves an AI-generated question and publishes it directly into the live Question Bank.
   */
  public static async approveQuestion(questionId: string, userId: string, role: Role) {
    if (role !== Role.FACULTY && role !== Role.ADMIN) {
      throw new Error('Forbidden: Only Faculty and Admin users can approve questions.');
    }

    const genQuestion = await prisma.aIGeneratedQuestion.findUnique({
      where: { id: questionId },
    });

    if (!genQuestion) {
      throw new Error(`Generated question '${questionId}' not found.`);
    }

    if (genQuestion.status === AIGeneratedQuestionStatus.APPROVED && genQuestion.createdQuestionId) {
      const existingLiveQuestion = await prisma.question.findUnique({
        where: { id: genQuestion.createdQuestionId },
      });
      return { success: true, message: 'Question already approved.', question: existingLiveQuestion };
    }

    let targetSubtopicId = genQuestion.subtopicId;
    if (!targetSubtopicId) {
      const fallbackSubtopic = await prisma.subtopic.findFirst();
      if (!fallbackSubtopic) {
        throw new Error('No subtopic taxonomy found in database.');
      }
      targetSubtopicId = fallbackSubtopic.id;
    }

    // Transactionally create live Question Bank record and update AIGeneratedQuestion status
    const [liveQuestion] = await prisma.$transaction(async (tx) => {
      const newLiveQuestion = await tx.question.create({
        data: {
          text: genQuestion.stem,
          type: genQuestion.type,
          difficulty: genQuestion.difficulty,
          marks: genQuestion.marks,
          negativeMarks: genQuestion.negativeMarks,
          options: genQuestion.options || [],
          correctAnswer: genQuestion.correctAnswer as any,
          explanation: genQuestion.explanation,
          subtopicId: targetSubtopicId!,
          createdById: userId,
        },
      });

      await tx.aIGeneratedQuestion.update({
        where: { id: questionId },
        data: {
          status: AIGeneratedQuestionStatus.APPROVED,
          createdQuestionId: newLiveQuestion.id,
        },
      });

      return [newLiveQuestion];
    });

    return {
      success: true,
      message: 'AI-generated question approved and published to Question Bank!',
      question: liveQuestion,
    };
  }

  /**
   * Rejects an AI-generated question, preventing publication to Question Bank.
   */
  public static async rejectQuestion(questionId: string, userId: string, role: Role) {
    if (role !== Role.FACULTY && role !== Role.ADMIN) {
      throw new Error('Forbidden: Only Faculty and Admin users can reject questions.');
    }

    const updated = await prisma.aIGeneratedQuestion.update({
      where: { id: questionId },
      data: { status: AIGeneratedQuestionStatus.REJECTED },
    });

    return {
      success: true,
      message: 'Generated question rejected.',
      question: updated,
    };
  }

  /**
   * Edits an AI-generated question prior to approval.
   */
  public static async editQuestion(
    questionId: string,
    userId: string,
    role: Role,
    data: {
      stem?: string;
      type?: QuestionType;
      difficulty?: Difficulty;
      options?: any;
      correctAnswer?: any;
      explanation?: string;
    }
  ) {
    if (role !== Role.FACULTY && role !== Role.ADMIN) {
      throw new Error('Forbidden: Only Faculty and Admin users can edit generated questions.');
    }

    const updated = await prisma.aIGeneratedQuestion.update({
      where: { id: questionId },
      data: {
        ...(data.stem ? { stem: data.stem } : {}),
        ...(data.type ? { type: data.type } : {}),
        ...(data.difficulty ? { difficulty: data.difficulty } : {}),
        ...(data.options !== undefined ? { options: data.options } : {}),
        ...(data.correctAnswer !== undefined ? { correctAnswer: data.correctAnswer } : {}),
        ...(data.explanation ? { explanation: data.explanation } : {}),
      },
    });

    return {
      success: true,
      message: 'Generated question updated successfully.',
      question: updated,
    };
  }
}
