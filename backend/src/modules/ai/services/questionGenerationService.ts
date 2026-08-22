import { prisma } from '../../../config/prisma';
import { Role, QuestionType, Difficulty, AIGeneratedQuestionStatus, AIQuestionQualityStatus, AIQuestionSimilarityStatus, AIQuestionReviewStatus } from '@prisma/client';
import { RAGService } from './ragService';
import { AIProviderService } from './aiProviderService';
import { QuestionValidationService } from './questionValidationService';
import { QuestionSimilarityService } from './questionSimilarityService';
import { AnswerVerificationService } from './answerVerificationService';
import { EmbeddingProvider } from './embeddingProvider';
import { AIGenerationSettingsService } from './aiGenerationSettingsService';
import { QuestionGenerationPrompt } from '../prompts/questionGenerationPrompt';
import { GenerateQuestionsDTO, QuestionGenerationResult, RawGeneratedQuestion } from '../types/questionGenerationTypes';
import { ENV } from '../../../config/env';
import { LLMFactory } from './llmProvider';
import { AuditLogger } from '../../../services/auditLogger';

export interface GenerateQuestionsParams {
  subject: string;
  topic: string;
  difficulty: Difficulty;
  questionType: QuestionType;
  count: number;
  marks: number;
  negativeMarking: number;
  documentIds?: string[];
  userId?: string;
  role?: Role;
}

export class QuestionGenerationService {
  private static MAX_GENERATION_BATCH_SIZE = 10;

  public static async generateQuestions(
    userIdOrParams: string | GenerateQuestionsParams,
    role?: Role,
    dto?: GenerateQuestionsDTO
  ): Promise<any> {
    if (typeof userIdOrParams === 'object') {
      return this.generateQuestionsDirect(userIdOrParams);
    }
    return this.generateQuestionsPipeline(userIdOrParams, role!, dto!);
  }

  /**
   * Main production pipeline for AI GATE Question Generation using RAG knowledge base.
   */
  public static async generateQuestionsPipeline(
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

    // Check for any extracted diagrams associated with this documentId
    const imageUrls: string[] = [];
    if (documentId) {
      try {
        const fs = require('fs');
        const path = require('path');
        const uploadDir = path.join(__dirname, '../../../../public/uploads/diagrams');
        if (fs.existsSync(uploadDir)) {
          const files = fs.readdirSync(uploadDir);
          for (const file of files) {
            if (file.startsWith(`doc_${documentId}_`)) {
              imageUrls.push(`/uploads/diagrams/${file}`);
            }
          }
        }
      } catch (err) {
        console.error('[QuestionGenerationService] Failed to scan document diagrams:', err);
      }
    }

    const userPrompt = QuestionGenerationPrompt.buildUserPrompt({
      contextText,
      questionType,
      difficulty,
      count: requestedCount,
      subjectName: targetSubjectName,
      topicName: targetTopicName,
      imageUrls,
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
      // If rawQ contains imageUrl, append it to rawQ.stem as markdown image
      const imgUrl = (rawQ as any).imageUrl || (rawQ as any).image_url || (rawQ as any).image;
      if (imgUrl && rawQ.stem && !rawQ.stem.includes('![diagram]')) {
        rawQ.stem = `${rawQ.stem}\n\n![diagram](${imgUrl})`;
      }

      // Validate Structure & Quality
      const valResult = QuestionValidationService.validateQuestion(rawQ);

      // Check Duplicate / Similarity in Question Bank
      const simResult = await QuestionSimilarityService.checkSimilarity(valResult.sanitizedStem, validatedSubtopicId);

      // Independent Answer Verification — a second, independent pass that re-derives the
      // answer against the same source context rather than trusting the generator's own answer.
      const verResult = valResult.isValid
        ? await AnswerVerificationService.verifyAnswer({
            stem: valResult.sanitizedStem,
            type: (rawQ.type || questionType) as QuestionType,
            options: valResult.normalizedOptions,
            proposedAnswer: valResult.normalizedCorrectAnswer,
            explanation: valResult.sanitizedExplanation || '',
            sourceContext: contextText,
          })
        : null;

      const finalStatus =
        !valResult.isValid || verResult?.verificationStatus === 'FAIL'
          ? AIGeneratedQuestionStatus.REJECTED
          : AIGeneratedQuestionStatus.PENDING_REVIEW;

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
          generatedAnswer: valResult.normalizedCorrectAnswer,
          verifiedAnswer: verResult?.verifiedAnswer ?? null,
          verificationStatus: verResult?.verificationStatus ?? 'UNVERIFIED',
          ambiguityDetected: verResult?.ambiguityDetected ?? false,
          provenanceValid: verResult?.sourceSupported ?? false,
          subjectId,
          moduleId,
          topicId,
          subtopicId: validatedSubtopicId,
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

    // Computed outside the transaction — an embedding-provider network call inside a Prisma
    // transaction risks the transaction's own timeout.
    const embedding = await EmbeddingProvider.getEmbeddingOrEmpty(genQuestion.stem);

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
          generatedByAI: true,
          embedding,
        },
      });

      await tx.aIGeneratedQuestion.update({
        where: { id: questionId },
        data: {
          status: AIGeneratedQuestionStatus.APPROVED,
          createdQuestionId: newLiveQuestion.id,
        },
      });

      // Link the live question back to whatever document(s) grounded its generation/extraction,
      // so the Question Bank UI can group by source PDF and exam assembly can pull a random
      // subset scoped to one specific uploaded document (see adminController.createExam).
      if (genQuestion.sourceDocumentIds && genQuestion.sourceDocumentIds.length > 0) {
        await tx.questionAISource.createMany({
          data: genQuestion.sourceDocumentIds.map((docId) => ({ questionId: newLiveQuestion.id, documentId: docId })),
        });
      }

      return [newLiveQuestion];
    }, { timeout: 20000 }); // this DB connection has consistently taken 1s+ per query this session — Prisma's 5s default is too tight for 3 sequential writes

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

  /**
   * Normalizes question text to facilitate duplicate detection.
   */
  public static normalizeText(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, '') // remove symbols
      .replace(/\s+/g, ' ') // collapse whitespaces
      .trim();
  }

  /**
   * Checks if a similar question already exists in the database.
   */
  public static async isDuplicate(text: string): Promise<boolean> {
    const normalizedTarget = this.normalizeText(text);
    if (!normalizedTarget) return false;

    // Load existing questions (e.g. limit to last 200 for performance check)
    const questions = await prisma.question.findMany({
      select: { text: true },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    for (const q of questions) {
      if (this.normalizeText(q.text) === normalizedTarget) {
        return true;
      }
    }
    return false;
  }

  /**
   * Resolves or creates Subject -> Module -> Topic -> Subtopic taxonomy safely.
   */
  public static async getOrCreateSubtopicId(subjectName: string, topicName: string): Promise<string> {
    let subject = await prisma.subject.findFirst({
      where: {
        OR: [
          { name: { equals: subjectName, mode: 'insensitive' } },
          { code: { equals: subjectName, mode: 'insensitive' } },
        ],
      },
    });

    if (!subject) {
      const code = 'GEN-' + subjectName.toUpperCase().replace(/[^A-Z0-9]/g, '').substring(0, 8) + '-' + Math.floor(100 + Math.random() * 900);
      subject = await prisma.subject.create({
        data: {
          name: subjectName,
          code,
          department: 'CSE',
        },
      });
    }

    let module = await prisma.module.findFirst({
      where: { subjectId: subject.id },
    });
    if (!module) {
      module = await prisma.module.create({
        data: {
          name: 'General Module',
          subjectId: subject.id,
        },
      });
    }

    let topic = await prisma.topic.findFirst({
      where: {
        name: { equals: topicName, mode: 'insensitive' },
        moduleId: module.id,
      },
    });
    if (!topic) {
      topic = await prisma.topic.create({
        data: {
          name: topicName,
          moduleId: module.id,
        },
      });
    }

    let subtopic = await prisma.subtopic.findFirst({
      where: { topicId: topic.id },
    });
    if (!subtopic) {
      subtopic = await prisma.subtopic.create({
        data: {
          name: 'General Subtopic',
          topicId: topic.id,
        },
      });
    }

    return subtopic.id;
  }

  /**
   * Validates a raw question structure generated by the LLM.
   */
  public static validateQuestion(q: any, expectedType: QuestionType): string | null {
    if (!q.question || typeof q.question !== 'string' || q.question.trim().length === 0) {
      return 'Question text is empty.';
    }
    if (!q.explanation || typeof q.explanation !== 'string' || q.explanation.trim().length === 0) {
      return 'Explanation is missing.';
    }

    if (expectedType === QuestionType.MCQ) {
      if (!Array.isArray(q.options) || q.options.length !== 4) {
        return 'MCQ must contain exactly 4 options.';
      }
      if (q.correctAnswer === undefined || q.correctAnswer === null) {
        return 'MCQ correct answer index is missing.';
      }
      const answerIndex = parseInt(q.correctAnswer, 10);
      if (isNaN(answerIndex) || answerIndex < 0 || answerIndex >= 4) {
        return 'MCQ correctAnswer index must be a number between 0 and 3.';
      }
    } else if (expectedType === QuestionType.MSQ) {
      if (!Array.isArray(q.options) || q.options.length < 2) {
        return 'MSQ must contain at least 2 options.';
      }
      if (!Array.isArray(q.correctAnswers) || q.correctAnswers.length === 0) {
        return 'MSQ must have at least one correct answer.';
      }
      for (const ans of q.correctAnswers) {
        const answerIndex = parseInt(ans, 10);
        if (isNaN(answerIndex) || answerIndex < 0 || answerIndex >= q.options.length) {
          return `MSQ correct answer index ${ans} is invalid or out of bounds.`;
        }
      }
    } else if (expectedType === QuestionType.NAT) {
      if (q.numericAnswer === undefined || q.numericAnswer === null || isNaN(parseFloat(q.numericAnswer))) {
        return 'NAT question numericAnswer is missing or is not a valid number.';
      }
      if (q.tolerance === undefined || q.tolerance === null || isNaN(parseFloat(q.tolerance))) {
        return 'NAT question tolerance must be a valid number.';
      }
    } else {
      return 'Invalid question type specified.';
    }

    return null;
  }

  /**
   * Main Question Generation pipeline utilizing retrieved document contexts.
   */
  public static async generateQuestionsDirect(params: GenerateQuestionsParams): Promise<any[]> {
    const { subject, topic, difficulty, questionType, count, marks, negativeMarking, documentIds } = params;
    const userId = params.userId || '';
    const role = params.role || Role.FACULTY;

    // 1. Role Authorization Check
    if (role !== Role.ADMIN && role !== Role.FACULTY) {
      throw new Error('Forbidden: Only ADMIN and FACULTY are authorized to generate questions.');
    }

    if (count <= 0 || count > 15) {
      throw new Error('Invalid count: You can generate between 1 and 15 questions per request.');
    }

    // 2. Fetch context chunks if documentIds are provided
    let contextText = '';
    let fetchedChunks: any[] = [];
    if (documentIds && documentIds.length > 0) {
      // Find chunks matching context
      const searchResults = await RAGService.searchChunks({
        query: `${subject} ${topic}`,
        userId,
        role,
        limit: 8,
      });
      // Filter strictly to the requested documentIds
      fetchedChunks = searchResults.filter((chunk) => documentIds.includes(chunk.documentId));
      contextText = fetchedChunks.map((c) => `[CONTENT]:\n${c.content}`).join('\n\n');
    }

    // 3. Formulate Prompt
    const systemPrompt = `
SYSTEM INSTRUCTIONS:
You are the GSMAS AI Question Generator.
Generate exactly ${count} ${questionType} questions about the subject "${subject}" and topic "${topic}".
The target difficulty is ${difficulty}. Marks per question: ${marks}.

${contextText ? 'Use the following university document contexts to generate the questions:\n' + contextText : 'Use general GATE examination syllabus knowledge.'}

Return ONLY a valid JSON array of objects conforming strictly to the requested type schemas. Do not write any markdown code fences, headers, or conversational text. Return ONLY the parsed array.

SCHEMAS:

MCQ (Multiple Choice Question):
[{
  "question": "Question text here...",
  "options": ["Option A", "Option B", "Option C", "Option D"],
  "correctAnswer": 0, // Integer index (0 to 3) representing the correct option
  "explanation": "Detailed explanation of why this answer is correct..."
}]

MSQ (Multiple Select Question - multiple options can be correct):
[{
  "question": "Question text here...",
  "options": ["Option A", "Option B", "Option C", "Option D"],
  "correctAnswers": [0, 2], // Array of integer indices of all correct options
  "explanation": "Detailed explanation of correct answers..."
}]

NAT (Numerical Answer Type):
[{
  "question": "Question text here...",
  "numericAnswer": 15.5, // The exact correct numerical value
  "tolerance": 0.05, // Acceptable range tolerance (answer accepted if within numericAnswer +/- tolerance)
  "explanation": "Detailed step-by-step formula explanation..."
}]
`;

    // 4. Invoke LLM
    const llm = LLMFactory.getProvider();
    const resultText = await llm.generate(systemPrompt, [], `Generate ${count} questions.`);

    // Clean JSON content if prompt returned code blocks
    let cleanJson = resultText.trim();
    if (cleanJson.startsWith('```')) {
      cleanJson = cleanJson.replace(/^```(json)?/, '').replace(/```$/, '').trim();
    }

    let rawList: any[];
    try {
      rawList = JSON.parse(cleanJson);
      if (!Array.isArray(rawList)) {
        throw new Error('LLM did not return a valid array of questions.');
      }
    } catch (parseErr) {
      console.error('[QuestionGenerationService Parse Error]:', resultText);
      throw new Error('AI generated content was malformed. Please try again.');
    }

    // 5. Parse, Validate, and Detect duplicates
    const validatedQuestions: any[] = [];
    const subtopicId = await this.getOrCreateSubtopicId(subject, topic);

    for (const q of rawList) {
      const valError = this.validateQuestion(q, questionType);
      if (valError) {
        console.warn(`[QuestionGenerationService Validation Warning]: ${valError}`, q);
        continue; // Skip malformed questions
      }

      const isDupe = await this.isDuplicate(q.question);

      // Structure correctly for frontend review card
      let formattedCorrectAnswer: any;
      if (questionType === QuestionType.MCQ) {
        formattedCorrectAnswer = [parseInt(q.correctAnswer, 10)];
      } else if (questionType === QuestionType.MSQ) {
        formattedCorrectAnswer = q.correctAnswers.map((x: any) => parseInt(x, 10));
      } else {
        const val = parseFloat(q.numericAnswer);
        const tol = parseFloat(q.tolerance || 0);
        formattedCorrectAnswer = {
          value: val,
          min: val - tol,
          max: val + tol,
        };
      }

      // Independent Answer Verification — same second-opinion check used by the main RAG
      // pipeline, so this legacy draft flow doesn't hand faculty an unverified answer to review.
      const verResult = contextText
        ? await AnswerVerificationService.verifyAnswer({
            stem: q.question,
            type: questionType,
            options: q.options,
            proposedAnswer: formattedCorrectAnswer,
            explanation: q.explanation || '',
            sourceContext: contextText,
          })
        : null;

      validatedQuestions.push({
        text: q.question,
        type: questionType,
        difficulty,
        marks,
        negativeMarks: negativeMarking,
        options: q.options || [],
        correctAnswer: formattedCorrectAnswer,
        explanation: q.explanation,
        subtopicId,
        isDuplicate: isDupe,
        verificationStatus: verResult?.verificationStatus ?? 'UNVERIFIED',
        verifiedAnswer: verResult?.verifiedAnswer ?? null,
        ambiguityDetected: verResult?.ambiguityDetected ?? false,
        sourceSupported: verResult?.sourceSupported ?? false,
        verificationNotes: verResult?.verificationNotes ?? 'No source document context supplied — independent verification not run.',
        sources: fetchedChunks.map((c) => ({
          documentId: c.documentId,
          documentTitle: c.title,
          chunkId: c.chunkId,
        })),
      });
    }

    if (validatedQuestions.length === 0) {
      throw new Error('AI failed to generate any valid structured questions.');
    }

    // 6. Audit Log generation event
    await AuditLogger.log({
      userId,
      action: 'AI_QUESTION_GENERATED',
      resource: 'Question',
      details: `Generated ${validatedQuestions.length} draft questions (Type: ${questionType}, Subtopic: ${subtopicId}).`,
    });

    return validatedQuestions;
  }

  /**
   * Shared safety pipeline for a single extracted (not generated) question: structural
   * validation -> semantic duplicate check -> independent answer verification -> conditional
   * auto-publish. Used by pdfQuestionImportService.ts so PDF extraction is held to the same bar
   * as AI-generated content, and reusable anywhere else that imports verbatim source content.
   *
   * Extracted content differs from AI-generated content in one important way: the correct answer
   * here comes from the source document's own official answer key, not from the AI, so a FAILed
   * independent re-derivation is treated as "needs human review", never as grounds to discard
   * real exam content the AI itself may have gotten wrong.
   */
  public static async importExtractedQuestion(params: {
    rawQ: { type: QuestionType; stem?: string; text?: string; options?: any; correctAnswer?: any; explanation?: string; difficulty?: Difficulty; imageUrl?: string | null };
    subtopicId: string;
    userId: string;
    generationRequestId: string;
    sourceDocumentIds: string[];
  }): Promise<{ outcome: 'IMPORTED' | 'SKIPPED'; skipReason?: string; record?: any; autoPublished?: boolean }> {
    const { rawQ, subtopicId, userId, generationRequestId, sourceDocumentIds } = params;

    const normalizedRawQ = { ...rawQ, stem: rawQ.stem ?? rawQ.text ?? '' };
    const valResult = QuestionValidationService.validateQuestion(normalizedRawQ as any);
    if (!valResult.isValid) {
      return { outcome: 'SKIPPED', skipReason: valResult.errors.join('; ') };
    }

    let finalStem = valResult.sanitizedStem;
    if (rawQ.imageUrl && !finalStem.includes('![diagram]')) {
      finalStem = `${finalStem}\n\n![diagram](${rawQ.imageUrl})`;
    }

    const simResult = await QuestionSimilarityService.checkSimilarity(finalStem, subtopicId);
    if (simResult.status === AIQuestionSimilarityStatus.DUPLICATE) {
      return { outcome: 'SKIPPED', skipReason: `Duplicate of an existing Question Bank entry (${simResult.similarQuestionId}).` };
    }

    const verResult = await AnswerVerificationService.verifyAnswer({
      stem: finalStem,
      type: rawQ.type,
      options: valResult.normalizedOptions,
      proposedAnswer: valResult.normalizedCorrectAnswer,
      explanation: valResult.sanitizedExplanation || '',
      sourceContext:
        'This question and its stated correct answer were extracted verbatim from the uploaded source document\'s own official answer key — they are not AI-generated. No additional external reference text is available. Independently verify, using your own subject-matter expertise, whether the stated correct answer is actually correct for the given question and options.',
    });

    const settings = await AIGenerationSettingsService.getSettings();

    const createdGenQ = await prisma.aIGeneratedQuestion.create({
      data: {
        generationRequestId,
        stem: finalStem,
        type: rawQ.type,
        difficulty: rawQ.difficulty || Difficulty.MEDIUM,
        marks: rawQ.type === QuestionType.NAT ? 2.0 : 1.0,
        negativeMarks: rawQ.type === QuestionType.MCQ ? 0.33 : 0.0,
        options: valResult.normalizedOptions ? valResult.normalizedOptions : undefined,
        correctAnswer: valResult.normalizedCorrectAnswer,
        explanation: valResult.sanitizedExplanation,
        generatedAnswer: valResult.normalizedCorrectAnswer,
        verifiedAnswer: verResult.verifiedAnswer,
        verificationStatus: verResult.verificationStatus,
        ambiguityDetected: verResult.ambiguityDetected,
        provenanceValid: true, // extracted verbatim from the real uploaded document
        subtopicId,
        status: AIGeneratedQuestionStatus.PENDING_REVIEW,
        qualityStatus: valResult.qualityStatus,
        qualityScore: valResult.qualityScore,
        similarityStatus: simResult.status,
        similarQuestionId: simResult.similarQuestionId || null,
        sourceDocumentIds,
        sourceChunkIds: [],
        createdById: userId,
      },
    });

    let finalRecord: any = createdGenQ;
    let autoPublished = false;

    if (settings.autoPublishVerified && verResult.verificationStatus === 'PASS') {
      try {
        const approval = await QuestionGenerationService.approveQuestion(createdGenQ.id, userId, Role.ADMIN);
        if (approval.success) {
          autoPublished = true;
          finalRecord = { ...createdGenQ, status: AIGeneratedQuestionStatus.APPROVED, createdQuestionId: (approval.question as any)?.id };
        }
      } catch (err: any) {
        console.error('[importExtractedQuestion] Auto-publish failed for', createdGenQ.id, err.message);
      }
    }

    return { outcome: 'IMPORTED', record: finalRecord, autoPublished };
  }
}
