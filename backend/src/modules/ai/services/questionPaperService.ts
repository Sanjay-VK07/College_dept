import { prisma } from '../../../config/prisma';
import { Role, QuestionType, Difficulty, VerificationStatus, QuestionOrigin, ExamStatus } from '@prisma/client';
import { QuestionVersionService } from '../../../services/questionVersionService';
import { RAGService } from './ragService';
import { AIProviderService } from './aiProviderService';
import { QuestionValidationService } from './questionValidationService';
import { QuestionSimilarityService } from './questionSimilarityService';
import { AnswerVerificationService } from './answerVerificationService';
import { EmbeddingProvider } from './embeddingProvider';
import { QuestionGenerationPrompt } from '../prompts/questionGenerationPrompt';

export interface PreviewPaperPayload {
  subjectId: string;
  selectedTopicIds: string[];
  paperMode: 'TOTAL_COUNT' | 'TOPIC_BLUEPRINT';
  totalQuestions?: number;
  topicBlueprint?: Record<string, number>;
  difficultyDistribution: { EASY: number; MEDIUM: number; HARD: number };
  typeDistribution: { MCQ: number; MSQ: number; NAT: number };
  randomSeed?: number | string;
}

export interface FinalizePaperPayload {
  title: string;
  description?: string;
  subjectId: string;
  selectedQuestionIds: string[];
  examSettings: {
    targetDepartment?: string;
    durationMinutes?: number;
    totalMarks?: number;
    negativeMarking?: boolean;
    solutionVisibility?: string;
    instructions?: string;
    startTime?: string | Date;
    endTime?: string | Date;
  };
}

function apportion(total: number, parts: Record<string, number>): Record<string, number> {
  const keys = Object.keys(parts);
  const exact: Record<string, number> = {};
  const floored: Record<string, number> = {};
  let assigned = 0;

  for (const k of keys) {
    exact[k] = (total * (parts[k] || 0)) / 100;
    floored[k] = Math.floor(exact[k]);
    assigned += floored[k];
  }

  const remainders = keys
    .map((k) => ({ k, r: exact[k] - floored[k] }))
    .sort((a, b) => b.r - a.r);

  let leftover = total - assigned;
  let i = 0;
  while (leftover > 0 && i < remainders.length) {
    floored[remainders[i].k] += 1;
    leftover--;
    i++;
  }
  return floored;
}

export class QuestionPaperService {
  /**
   * Generates a preview calculation without creating an exam.
   * Performs controlled random selection over existing VERIFIED questions and computes exact shortfalls.
   */
  public static async previewQuestionPaper(payload: PreviewPaperPayload) {
    const {
      subjectId,
      selectedTopicIds,
      paperMode,
      totalQuestions = 50,
      topicBlueprint = {},
      difficultyDistribution,
      typeDistribution,
    } = payload;

    if (!selectedTopicIds || selectedTopicIds.length === 0) {
      throw new Error('At least one topic must be selected.');
    }

    // 1. Fetch subtopics under selected topics
    const subtopics = await prisma.subtopic.findMany({
      where: { topicId: { in: selectedTopicIds } },
      include: { topic: true },
    });

    const subtopicIdToTopicIdMap = new Map<string, string>();
    for (const sub of subtopics) {
      subtopicIdToTopicIdMap.set(sub.id, sub.topicId);
    }
    const subtopicIds = Array.from(subtopicIdToTopicIdMap.keys());

    // 2. Fetch all VERIFIED questions in DB for these topics
    const availableVerifiedQuestions = await prisma.question.findMany({
      where: {
        subtopicId: { in: subtopicIds },
        verificationStatus: VerificationStatus.VERIFIED,
      },
      include: {
        subtopic: {
          include: {
            topic: {
              include: { module: { include: { subject: true } } },
            },
          },
        },
        sourceDocument: {
          select: { id: true, title: true, fileName: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // 3. Determine requested total and per-topic targets
    let requestedTotal = totalQuestions;
    const topicTargets: Record<string, number> = {};

    if (paperMode === 'TOPIC_BLUEPRINT') {
      requestedTotal = 0;
      for (const topicId of selectedTopicIds) {
        const req = topicBlueprint[topicId] || 0;
        topicTargets[topicId] = req;
        requestedTotal += req;
      }
    }

    // 4. Calculate target type & difficulty counts via largest-remainder algorithm
    const diffTargets = apportion(requestedTotal, difficultyDistribution);
    const typeTargets = apportion(requestedTotal, typeDistribution);

    // Group available questions by topic, difficulty, type
    const questionsByTopic = new Map<string, any[]>();
    for (const q of availableVerifiedQuestions) {
      const topicId = q.subtopic.topicId;
      if (!questionsByTopic.has(topicId)) questionsByTopic.set(topicId, []);
      questionsByTopic.get(topicId)!.push(q);
    }

    // Shuffle helper (deterministic or randomized)
    const shuffled = [...availableVerifiedQuestions].sort(() => Math.random() - 0.5);

    const selectedQuestions: any[] = [];
    const selectedIds = new Set<string>();

    const easyPool = shuffled.filter((q) => q.difficulty === Difficulty.EASY || q.difficulty === Difficulty.VERY_EASY);
    const medPool = shuffled.filter((q) => q.difficulty === Difficulty.MEDIUM);
    const hardPool = shuffled.filter((q) => q.difficulty === Difficulty.HARD || q.difficulty === Difficulty.VERY_HARD);

    const selectFromPool = (pool: any[], maxCount: number) => {
      let added = 0;
      for (const q of pool) {
        if (selectedQuestions.length >= requestedTotal) break;
        if (added >= maxCount) break;
        if (!selectedIds.has(q.id)) {
          // Check blueprint constraint if in BLUEPRINT mode
          if (paperMode === 'TOPIC_BLUEPRINT') {
            const topicId = q.subtopic.topicId;
            const currentSelectedInTopic = selectedQuestions.filter((x) => x.subtopic.topicId === topicId).length;
            if (currentSelectedInTopic >= (topicTargets[topicId] || 0)) continue;
          }

          selectedIds.add(q.id);
          selectedQuestions.push(q);
          added++;
        }
      }
    };

    selectFromPool(easyPool, diffTargets.EASY || 0);
    selectFromPool(medPool, diffTargets.MEDIUM || 0);
    selectFromPool(hardPool, diffTargets.HARD || 0);

    // Fill up remaining slots from general pool if specific difficulty buckets had shortages
    if (selectedQuestions.length < requestedTotal) {
      for (const q of shuffled) {
        if (selectedQuestions.length >= requestedTotal) break;
        if (!selectedIds.has(q.id)) {
          if (paperMode === 'TOPIC_BLUEPRINT') {
            const topicId = q.subtopic.topicId;
            const currentSelectedInTopic = selectedQuestions.filter((x) => x.subtopic.topicId === topicId).length;
            if (currentSelectedInTopic >= (topicTargets[topicId] || 0)) continue;
          }
          selectedIds.add(q.id);
          selectedQuestions.push(q);
        }
      }
    }

    // 5. Calculate Shortfalls
    const selectedCount = selectedQuestions.length;
    const aiRequiredCount = Math.max(0, requestedTotal - selectedCount);

    // Topic shortfalls
    const topicShortfalls: Array<{ topicId: string; topicName: string; required: number; available: number; shortfall: number }> = [];
    
    const topicsInfo = await prisma.topic.findMany({ where: { id: { in: selectedTopicIds } } });
    for (const top of topicsInfo) {
      const availCount = (questionsByTopic.get(top.id) || []).length;
      const selCount = selectedQuestions.filter((q) => q.subtopic.topicId === top.id).length;
      let reqCount = paperMode === 'TOPIC_BLUEPRINT' ? (topicTargets[top.id] || 0) : selCount;
      const sf = Math.max(0, reqCount - selCount);
      topicShortfalls.push({
        topicId: top.id,
        topicName: top.name,
        required: reqCount,
        available: availCount,
        shortfall: sf,
      });
    }

    // Difficulty shortfalls
    const selectedEasy = selectedQuestions.filter((q) => q.difficulty === Difficulty.EASY || q.difficulty === Difficulty.VERY_EASY).length;
    const selectedMed = selectedQuestions.filter((q) => q.difficulty === Difficulty.MEDIUM).length;
    const selectedHard = selectedQuestions.filter((q) => q.difficulty === Difficulty.HARD || q.difficulty === Difficulty.VERY_HARD).length;

    const difficultyShortfalls = {
      EASY: Math.max(0, (diffTargets.EASY || 0) - selectedEasy),
      MEDIUM: Math.max(0, (diffTargets.MEDIUM || 0) - selectedMed),
      HARD: Math.max(0, (diffTargets.HARD || 0) - selectedHard),
    };

    // Type shortfalls
    const selectedMCQ = selectedQuestions.filter((q) => q.type === QuestionType.MCQ).length;
    const selectedMSQ = selectedQuestions.filter((q) => q.type === QuestionType.MSQ).length;
    const selectedNAT = selectedQuestions.filter((q) => q.type === QuestionType.NAT).length;

    const typeShortfalls = {
      MCQ: Math.max(0, (typeTargets.MCQ || 0) - selectedMCQ),
      MSQ: Math.max(0, (typeTargets.MSQ || 0) - selectedMSQ),
      NAT: Math.max(0, (typeTargets.NAT || 0) - selectedNAT),
    };

    // Check source material availability
    const sourceChunksCount = await prisma.aIDocumentChunk.count({
      where: {
        document: {
          OR: [{ subjectId }, { topicId: { in: selectedTopicIds } }],
        },
      },
    });

    const hasSourceMaterial = sourceChunksCount > 0;
    let sourceMaterialWarning: string | null = null;
    if (aiRequiredCount > 0 && !hasSourceMaterial) {
      sourceMaterialWarning = 'No indexed source material is available for the selected topic(s). AI generation cannot proceed.';
    }

    return {
      requestedTotal,
      availableVerifiedCount: availableVerifiedQuestions.length,
      selectedExistingCount: selectedCount,
      aiRequiredCount,
      selectedQuestions,
      topicShortfalls,
      difficultyShortfalls,
      typeShortfalls,
      diffTargets,
      typeTargets,
      hasSourceMaterial,
      sourceMaterialWarning,
    };
  }

  /**
   * Starts an asynchronous background job to generate missing shortfall questions from RAG source material.
   */
  public static async startShortfallGeneration(userId: string, role: Role, payload: PreviewPaperPayload) {
    if (role !== Role.FACULTY && role !== Role.ADMIN) {
      throw new Error('Forbidden: Only Faculty and Admin can initiate question paper generation.');
    }

    const preview = await this.previewQuestionPaper(payload);

    if (preview.aiRequiredCount === 0) {
      throw new Error('No AI generation is required. Enough verified questions already exist to satisfy your paper requirements.');
    }

    if (!preview.hasSourceMaterial) {
      throw new Error('No indexed source material is available for the selected topic(s). AI generation cannot proceed.');
    }

    const reqId = `job_shortfall_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    // Create AIBatchGenerationJob record in DB
    const batchJob = await prisma.aIBatchGenerationJob.create({
      data: {
        generationRequestId: reqId,
        createdById: userId,
        jobType: 'PAPER_SHORTFALL',
        requestedCount: preview.aiRequiredCount,
        generatedCount: 0,
        verifiedCount: 0,
        status: 'QUEUED',
        statusMessage: `Queued shortfall generation for ${preview.aiRequiredCount} missing questions.`,
        subjectId: payload.subjectId,
        topicId: payload.selectedTopicIds[0] || null,
        typeDistribution: preview.typeShortfalls as any,
        difficultyDistribution: preview.difficultyShortfalls as any,
      },
    });

    // Asynchronously dispatch the background worker (do NOT await it so request returns immediately)
    this.executeShortfallWorker(batchJob.id, userId, payload, preview).catch((err) => {
      console.error('[ShortfallWorker Error]:', err);
    });

    return {
      jobId: batchJob.id,
      generationRequestId: reqId,
      status: 'QUEUED',
      aiRequiredCount: preview.aiRequiredCount,
      message: `Shortfall generation job queued for ${preview.aiRequiredCount} missing questions.`,
    };
  }

  /**
   * Asynchronous background worker for targeted shortfall AI generation.
   */
  private static async executeShortfallWorker(
    jobId: string,
    userId: string,
    payload: PreviewPaperPayload,
    preview: any
  ) {
    try {
      await prisma.aIBatchGenerationJob.update({
        where: { id: jobId },
        data: { status: 'PROCESSING', statusMessage: 'Retrieving source chunks and generating shortfall candidates...' },
      });

      const { subjectId, selectedTopicIds } = payload;
      const targetCount = preview.aiRequiredCount;

      // Find subtopics for taxonomy assignment
      const subtopics = await prisma.subtopic.findMany({
        where: { topicId: { in: selectedTopicIds } },
        include: { topic: { include: { module: { include: { subject: true } } } } },
      });

      if (subtopics.length === 0) {
        throw new Error('No valid subtopic taxonomy found for selected topics.');
      }
      const targetSubtopic = subtopics[0];

      // Retrieve authorized academic context via RAG
      const ragResult = await RAGService.executeRAGPipeline({
        userMessage: `GATE exam question concepts for ${targetSubtopic.topic.module.subject.name} ${targetSubtopic.topic.name}`,
        userId,
        role: Role.FACULTY,
      });

      const chunks = ragResult.evaluation?.validatedChunks || [];
      if (!ragResult.ragUsed || chunks.length === 0) {
        await prisma.aIBatchGenerationJob.update({
          where: { id: jobId },
          data: {
            status: 'FAILED',
            statusMessage: 'No indexed source material is available for the selected topic(s). AI generation cannot proceed.',
          },
        });
        return;
      }

      const contextText = chunks
        .map((c: any, i: number) => `[Chunk ${i + 1} - ${c.documentTitle}]: ${c.content}`)
        .join('\n\n');

      const sourceDocumentIds: string[] = Array.from(new Set(chunks.map((c: any) => c.documentId)));

      let verifiedGeneratedCount = 0;
      let rounds = 0;
      const MAX_ROUNDS = 3;

      while (verifiedGeneratedCount < targetCount && rounds < MAX_ROUNDS) {
        rounds++;
        const remainingNeeded = targetCount - verifiedGeneratedCount;
        // Generate a slightly larger candidate batch to account for verification filters
        const candidateBatchSize = Math.min(10, remainingNeeded + 2);

        const systemPrompt = QuestionGenerationPrompt.buildSystemPrompt();
        const userPrompt = QuestionGenerationPrompt.buildUserPrompt({
          contextText,
          questionType: QuestionType.MCQ,
          difficulty: Difficulty.MEDIUM,
          count: candidateBatchSize,
          subjectName: targetSubtopic.topic.module.subject.name,
          topicName: targetSubtopic.topic.name,
        });

        const aiResponse = await AIProviderService.generateResponse(systemPrompt, [], userPrompt);
        if (!aiResponse.success || !aiResponse.content) continue;

        let parsedCandidates: any[] = [];
        try {
          let cleanJson = aiResponse.content.trim();
          if (cleanJson.startsWith('```')) {
            cleanJson = cleanJson.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
          }
          const jsonObj = JSON.parse(cleanJson);
          parsedCandidates = Array.isArray(jsonObj) ? jsonObj : jsonObj.questions || [jsonObj];
        } catch {
          continue;
        }

        for (const rawQ of parsedCandidates) {
          if (verifiedGeneratedCount >= targetCount) break;

          const valResult = QuestionValidationService.validateQuestion(rawQ);
          if (!valResult.isValid) continue;

          const simResult = await QuestionSimilarityService.checkSimilarity(valResult.sanitizedStem, targetSubtopic.id);
          if (simResult.status === 'DUPLICATE') continue;

          // Run independent answer verification
          const verResult = await AnswerVerificationService.verifyAnswer({
            stem: valResult.sanitizedStem,
            type: (rawQ.type || QuestionType.MCQ) as QuestionType,
            options: valResult.normalizedOptions,
            proposedAnswer: valResult.normalizedCorrectAnswer,
            explanation: valResult.sanitizedExplanation || '',
            sourceContext: contextText,
          });

          const isVerified = valResult.isValid && verResult.verificationStatus === 'PASS';
          const finalVerStatus = isVerified ? VerificationStatus.VERIFIED : VerificationStatus.NEEDS_REVIEW;

          // Save live Question row with origin = AI_GENERATED
          const embeddingFields = await EmbeddingProvider.getEmbeddingFields(valResult.sanitizedStem);
          
          await prisma.question.create({
            data: {
              text: valResult.sanitizedStem,
              type: (rawQ.type || QuestionType.MCQ) as QuestionType,
              difficulty: (rawQ.difficulty || Difficulty.MEDIUM) as Difficulty,
              marks: (rawQ.type || QuestionType.MCQ) === QuestionType.NAT ? 2.0 : 1.0,
              negativeMarks: (rawQ.type || QuestionType.MCQ) === QuestionType.MCQ ? 0.33 : 0.0,
              options: valResult.normalizedOptions || [],
              correctAnswer: valResult.normalizedCorrectAnswer as any,
              explanation: valResult.sanitizedExplanation,
              subtopicId: targetSubtopic.id,
              createdById: userId,
              generatedByAI: true,
              origin: QuestionOrigin.AI_GENERATED,
              verificationStatus: finalVerStatus,
              sourceDocumentId: sourceDocumentIds[0] || null,
              sourceHeading: targetSubtopic.topic.name,
              ...embeddingFields,
            },
          });

          if (isVerified) {
            verifiedGeneratedCount++;
          }
        }

        await prisma.aIBatchGenerationJob.update({
          where: { id: jobId },
          data: {
            generatedCount: verifiedGeneratedCount,
            verifiedCount: verifiedGeneratedCount,
            regenerationRounds: rounds,
            statusMessage: `Generated and verified ${verifiedGeneratedCount} of ${targetCount} missing questions...`,
          },
        });
      }

      await prisma.aIBatchGenerationJob.update({
        where: { id: jobId },
        data: {
          status: 'COMPLETED',
          verifiedCount: verifiedGeneratedCount,
          statusMessage:
            verifiedGeneratedCount >= targetCount
              ? `Successfully generated ${verifiedGeneratedCount} verified shortfall questions.`
              : `Completed generation round. Obtained ${verifiedGeneratedCount} verified questions out of ${targetCount} requested.`,
        },
      });
    } catch (err: any) {
      console.error('[ShortfallWorker Failed]:', err);
      await prisma.aIBatchGenerationJob.update({
        where: { id: jobId },
        data: {
          status: 'FAILED',
          statusMessage: err.message || 'Shortfall AI generation failed.',
        },
      });
    }
  }

  /**
   * Finalizes paper selection into a MockTest DRAFT with frozen QuestionVersion snapshots.
   */
  public static async finalizeQuestionPaper(userId: string, role: Role, payload: FinalizePaperPayload) {
    if (role !== Role.FACULTY && role !== Role.ADMIN) {
      throw new Error('Forbidden: Only Faculty and Admin can finalize question papers.');
    }

    const { title, description, subjectId, selectedQuestionIds, examSettings } = payload;

    if (!selectedQuestionIds || selectedQuestionIds.length === 0) {
      throw new Error('Cannot finalize an empty question paper.');
    }

    // 1. Fetch selected questions
    const questions = await prisma.question.findMany({
      where: { id: { in: selectedQuestionIds } },
      include: {
        subtopic: {
          include: { topic: { include: { module: { include: { subject: true } } } } },
        },
      },
    });

    if (questions.length !== selectedQuestionIds.length) {
      throw new Error('One or more selected questions could not be found in the database.');
    }

    // 2. Validate all questions have verificationStatus = VERIFIED
    const unverifiedQuestions = questions.filter((q) => q.verificationStatus !== VerificationStatus.VERIFIED);
    if (unverifiedQuestions.length > 0) {
      throw new Error(
        `Finalization blocked: ${unverifiedQuestions.length} selected question(s) have verification status '${unverifiedQuestions[0].verificationStatus}' and are not VERIFIED.`
      );
    }

    // 3. Freeze QuestionVersion snapshot for each question
    const versionIds = await Promise.all(
      questions.map((q) => QuestionVersionService.getCurrentVersionId(q.id))
    );

    // 4. Resolve Subject default department if not provided
    let targetDepartment = examSettings.targetDepartment;
    if (!targetDepartment && subjectId) {
      const subj = await prisma.subject.findUnique({ where: { id: subjectId } });
      if (subj) targetDepartment = subj.department;
    }
    if (!targetDepartment) targetDepartment = 'Computer Science and Engineering';

    const now = new Date();
    const defaultStart = examSettings.startTime ? new Date(examSettings.startTime) : new Date(now.getTime() + 86400000);
    const durationMins = Number(examSettings.durationMinutes || 180);
    const defaultEnd = examSettings.endTime ? new Date(examSettings.endTime) : new Date(defaultStart.getTime() + durationMins * 60000);

    // 5. Transactionally create draft MockTest
    const [mockTest] = await prisma.$transaction(
      async (tx) => {
        const createdMockTest = await tx.mockTest.create({
          data: {
            title: title || `AI Assembled GATE Exam - ${targetDepartment}`,
            description: description || 'Assembled question paper using approved Question Bank questions.',
            examType: 'SCHEDULED',
            durationMinutes: durationMins,
            totalMarks: Number(examSettings.totalMarks || questions.reduce((sum, q) => sum + q.marks, 0)),
            startTime: defaultStart,
            endTime: defaultEnd,
            targetDepartment,
            isPublished: false, // STRICT DRAFT ONLY — NEVER AUTO-PUBLISHED
            status: ExamStatus.DRAFT,
            instructions: examSettings.instructions || 'Read all instructions carefully before starting the exam.',
            createdById: userId,
            testQuestions: {
              create: questions.map((q, idx) => ({
                questionId: q.id,
                questionVersionId: versionIds[idx],
                order: idx + 1,
              })),
            },
          },
        });

        return [createdMockTest];
      },
      { timeout: 20000 }
    );

    return {
      success: true,
      message: `Question paper finalized into DRAFT examination '${mockTest.title}'.`,
      mockTestId: mockTest.id,
      mockTest,
    };
  }

  /**
   * Explicit action to publish an examination DRAFT for students.
   */
  public static async publishExamination(mockTestId: string, userId: string, role: Role) {
    if (role !== Role.FACULTY && role !== Role.ADMIN) {
      throw new Error('Forbidden: Only Faculty and Admin can publish examinations.');
    }

    const mockTest = await prisma.mockTest.findUnique({
      where: { id: mockTestId },
      include: {
        testQuestions: {
          include: {
            question: true,
          },
        },
      },
    });

    if (!mockTest) {
      throw new Error(`Examination '${mockTestId}' not found.`);
    }

    if (mockTest.testQuestions.length === 0) {
      throw new Error('Cannot publish an examination without any questions attached.');
    }

    // Perform final pre-publication validation
    const unverified = mockTest.testQuestions.filter((tq) => tq.question.verificationStatus !== VerificationStatus.VERIFIED);
    if (unverified.length > 0) {
      throw new Error(`Cannot publish exam: ${unverified.length} question(s) are not VERIFIED.`);
    }

    const updatedMockTest = await prisma.mockTest.update({
      where: { id: mockTestId },
      data: {
        isPublished: true,
        status: ExamStatus.PUBLISHED,
      },
    });

    return {
      success: true,
      message: `Examination '${updatedMockTest.title}' has been successfully published for students!`,
      mockTest: updatedMockTest,
    };
  }
}
