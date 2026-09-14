import { prisma } from '../../../config/prisma';
import { Role, QuestionType, Difficulty, AIExamDraftStatus, VerificationStatus } from '@prisma/client';
import { AssembleExamDTO, ExamAssemblyResult } from '../types/solutionAndExamTypes';
import { ExamValidationService } from './examValidationService';
import { QuestionVersionService } from '../../../services/questionVersionService';

export class ExamAssemblyService {
  /**
   * Intelligently assembles a GATE MockTest using ONLY approved Question Bank questions
   * according to target difficulty distribution, question types, and topic coverage.
   */
  public static async assembleExam(
    userId: string,
    role: Role,
    dto: AssembleExamDTO
  ): Promise<ExamAssemblyResult> {
    const startTime = performance.now();

    if (role !== Role.FACULTY && role !== Role.ADMIN) {
      throw new Error('Forbidden: Only Faculty and Admin users can assemble exams.');
    }

    const {
      examGenerationRequestId,
      title,
      description,
      subjectId,
      moduleIds,
      topicIds,
      questionTypes,
      difficultyDistribution = { EASY: 30, MEDIUM: 50, HARD: 20 },
      questionCount = 10,
      targetDepartment = 'Computer Science and Engineering',
      durationMinutes = 180,
    } = dto;

    if (!examGenerationRequestId) {
      throw new Error('Exam Generation Request ID is required for idempotency.');
    }

    // 1. Idempotency Check
    const existingTrace = await prisma.aIExamAssemblyTrace.findUnique({
      where: { examGenerationRequestId },
      include: {
        mockTest: {
          include: {
            testQuestions: {
              include: {
                question: {
                  include: { subtopic: { include: { topic: true } } },
                },
              },
            },
          },
        },
      },
    });

    if (existingTrace && existingTrace.mockTest) {
      const selectedQs = existingTrace.mockTest.testQuestions.map((tq) => tq.question);
      const validation = ExamValidationService.validateExamAssembly({
        selectedQuestions: selectedQs,
        requestedCount: questionCount,
        targetDifficulty: difficultyDistribution,
      });

      return {
        success: true,
        message: 'Returned previously assembled exam draft (idempotent replay).',
        examGenerationRequestId,
        mockTestId: existingTrace.mockTest.id,
        status: existingTrace.status,
        requestedQuestionCount: existingTrace.requestedQuestionCount,
        selectedQuestionCount: selectedQs.length,
        actualDifficultyDistribution: validation.actualDifficultyBreakdown,
        topicCoverage: validation.topicCoverage,
        questions: selectedQs,
        validationStatus: existingTrace.validationStatus || 'PASS',
        warnings: validation.warnings,
      };
    }

    // 2. Query Approved Question Bank Questions matching filters
    // "Approved" per the comment above must actually mean VERIFIED — found live via UI testing
    // that this filter never included a verificationStatus clause, so a NEEDS_REVIEW or REJECTED
    // question could be assembled straight into a real exam draft with no gate at all.
    const whereFilter: any = { verificationStatus: VerificationStatus.VERIFIED };

    if (questionTypes && questionTypes.length > 0) {
      whereFilter.type = { in: questionTypes };
    }

    if (subtopicFilterRequired(subjectId, moduleIds, topicIds)) {
      whereFilter.subtopic = buildSubtopicFilter(subjectId, moduleIds, topicIds);
    }

    const availableQuestions = await prisma.question.findMany({
      where: whereFilter,
      include: {
        subtopic: {
          include: {
            topic: {
              include: { module: { include: { subject: true } } },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });

    if (availableQuestions.length === 0) {
      throw new Error('No approved questions available matching the specified subject/topic filters.');
    }

    // 3. Selection Engine satisfying target difficulty percentages
    const easyTarget = Math.round((questionCount * (difficultyDistribution.EASY || 30)) / 100);
    const hardTarget = Math.round((questionCount * (difficultyDistribution.HARD || 20)) / 100);
    const mediumTarget = Math.max(1, questionCount - easyTarget - hardTarget);

    const easyPool = availableQuestions.filter((q) => q.difficulty === Difficulty.EASY || q.difficulty === Difficulty.VERY_EASY);
    const hardPool = availableQuestions.filter((q) => q.difficulty === Difficulty.HARD || q.difficulty === Difficulty.VERY_HARD);
    const mediumPool = availableQuestions.filter((q) => q.difficulty === Difficulty.MEDIUM || !['EASY', 'VERY_EASY', 'HARD', 'VERY_HARD'].includes(q.difficulty));

    const selectedQuestions: any[] = [];
    const usedIds = new Set<string>();

    const selectFromPool = (pool: any[], target: number) => {
      for (const q of pool) {
        if (selectedQuestions.length >= questionCount) break;
        if (!usedIds.has(q.id)) {
          usedIds.add(q.id);
          selectedQuestions.push(q);
          if (selectedQuestions.filter((x) => pool.includes(x)).length >= target) break;
        }
      }
    };

    selectFromPool(easyPool, easyTarget);
    selectFromPool(mediumPool, mediumTarget);
    selectFromPool(hardPool, hardTarget);

    // Fallback fill up if difficulty buckets were insufficient
    if (selectedQuestions.length < questionCount) {
      for (const q of availableQuestions) {
        if (selectedQuestions.length >= questionCount) break;
        if (!usedIds.has(q.id)) {
          usedIds.add(q.id);
          selectedQuestions.push(q);
        }
      }
    }

    // 4. Validate Assembled Exam
    const valResult = ExamValidationService.validateExamAssembly({
      selectedQuestions,
      requestedCount: questionCount,
      targetDifficulty: difficultyDistribution,
    });

    const assemblyDurationMs = Math.round(performance.now() - startTime);

    // Pin each question's current version at attach time so later edits/AI-solution approvals
    // never retroactively change what this exam scores against.
    const versionIds = await Promise.all(
      selectedQuestions.map((q) => QuestionVersionService.getCurrentVersionId(q.id))
    );

    // 5. Transactionally create draft MockTest and link MockTestQuestion records
    const now = new Date();
    const startTimeDate = new Date(now.getTime() + 86400000); // Default start tomorrow
    const endTimeDate = new Date(startTimeDate.getTime() + durationMinutes * 60000);

    const [mockTest, trace] = await prisma.$transaction(async (tx) => {
      const createdMockTest = await tx.mockTest.create({
        data: {
          title: title || `AI Assembled GATE Exam - ${targetDepartment}`,
          description: description || 'Intelligent AI-assembled exam draft using approved Question Bank questions.',
          examType: 'SCHEDULED',
          durationMinutes,
          totalMarks: valResult.totalMarks || 100.0,
          startTime: startTimeDate,
          endTime: endTimeDate,
          targetDepartment,
          isPublished: false, // Strictly DRAFT / Unpublished
          createdById: userId,
          testQuestions: {
            create: selectedQuestions.map((q, idx) => ({
              questionId: q.id,
              questionVersionId: versionIds[idx],
              order: idx + 1,
            })),
          },
        },
      });

      const createdTrace = await tx.aIExamAssemblyTrace.create({
        data: {
          examGenerationRequestId,
          mockTestId: createdMockTest.id,
          generatedById: userId,
          subjectId,
          requestedQuestionCount: questionCount,
          selectedQuestionCount: selectedQuestions.length,
          requestedDifficulty: difficultyDistribution as any,
          actualDifficultyDistribution: valResult.actualDifficultyBreakdown as any,
          topicCoverage: valResult.topicCoverage as any,
          status: AIExamDraftStatus.DRAFT,
          validationStatus: valResult.isValid ? 'PASS' : 'WARNING',
          assemblyDurationMs,
        },
      });

      return [createdMockTest, createdTrace];
    }, { timeout: 20000 });

    return {
      success: true,
      message: `Successfully assembled exam draft with ${selectedQuestions.length} questions.`,
      examGenerationRequestId,
      mockTestId: mockTest.id,
      status: AIExamDraftStatus.DRAFT,
      requestedQuestionCount: questionCount,
      selectedQuestionCount: selectedQuestions.length,
      actualDifficultyDistribution: valResult.actualDifficultyBreakdown,
      topicCoverage: valResult.topicCoverage,
      questions: selectedQuestions,
      validationStatus: valResult.isValid ? 'PASS' : 'WARNING',
      warnings: valResult.warnings,
    };
  }

  /**
   * Approves an exam draft for publication.
   */
  public static async approveExamDraft(mockTestId: string, userId: string, role: Role) {
    if (role !== Role.FACULTY && role !== Role.ADMIN) {
      throw new Error('Forbidden: Only Faculty and Admin can approve exam drafts.');
    }

    const mockTest = await prisma.mockTest.findUnique({
      where: { id: mockTestId },
      include: { aiExamTrace: true },
    });

    if (!mockTest) {
      throw new Error(`MockTest '${mockTestId}' not found.`);
    }

    const updatedMockTest = await prisma.mockTest.update({
      where: { id: mockTestId },
      data: { isPublished: true },
    });

    if (mockTest.aiExamTrace) {
      await prisma.aIExamAssemblyTrace.update({
        where: { id: mockTest.aiExamTrace.id },
        data: { status: AIExamDraftStatus.PUBLISHED },
      });
    }

    return {
      success: true,
      message: 'Exam draft approved and published for students!',
      mockTest: updatedMockTest,
    };
  }
}

function subtopicFilterRequired(subjectId?: string, moduleIds?: string[], topicIds?: string[]): boolean {
  return Boolean(subjectId || (moduleIds && moduleIds.length > 0) || (topicIds && topicIds.length > 0));
}

function buildSubtopicFilter(subjectId?: string, moduleIds?: string[], topicIds?: string[]): any {
  const filter: any = {};
  if (topicIds && topicIds.length > 0) {
    filter.topicId = { in: topicIds };
  } else if (moduleIds && moduleIds.length > 0) {
    filter.topic = { moduleId: { in: moduleIds } };
  } else if (subjectId) {
    filter.topic = { module: { subjectId } };
  }
  return filter;
}
