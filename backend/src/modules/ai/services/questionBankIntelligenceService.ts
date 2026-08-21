import { prisma } from '../../../config/prisma';

export interface QuestionBankHealthMetrics {
  totalApprovedQuestions: number;
  pendingAiQuestions: number;
  rejectedQuestions: number;
  duplicateOrSimilarCount: number;
  unattemptedQuestionsCount: number;
  byDifficulty: Record<string, number>;
  byType: Record<string, number>;
  subjectCoverage: Array<{ subjectId: string; subjectName: string; questionCount: number }>;
  healthStatus: 'EXCELLENT' | 'GOOD' | 'NEEDS_ATTENTION';
}

export class QuestionBankIntelligenceService {
  /**
   * Computes comprehensive evidence-based Question Bank health metrics.
   */
  public static async getQuestionBankHealth(): Promise<QuestionBankHealthMetrics> {
    const totalApprovedQuestions = await prisma.question.count();
    const pendingAiQuestions = await prisma.aIGeneratedQuestion.count({ where: { status: 'PENDING_REVIEW' } });
    const rejectedQuestions = await prisma.aIGeneratedQuestion.count({ where: { status: 'REJECTED' } });
    const duplicateOrSimilarCount = await prisma.aIGeneratedQuestion.count({
      where: { similarityStatus: { in: ['DUPLICATE', 'SIMILAR'] } },
    });
    const difficultyGroups = await prisma.question.groupBy({
      by: ['difficulty'],
      _count: { _all: true },
    });
    const typeGroups = await prisma.question.groupBy({
      by: ['type'],
      _count: { _all: true },
    });
    const subjects = await prisma.subject.findMany({
      select: {
        id: true,
        name: true,
        modules: {
          select: {
            topics: {
              select: {
                subtopics: {
                  select: {
                    _count: { select: { questions: true } },
                  },
                },
              },
            },
          },
        },
      },
    });
    const questionsWithResponses = await prisma.question.count({
      where: { responses: { some: {} } },
    });

    const unattemptedQuestionsCount = Math.max(0, totalApprovedQuestions - questionsWithResponses);

    const byDifficulty: Record<string, number> = { EASY: 0, MEDIUM: 0, HARD: 0 };
    difficultyGroups.forEach((g) => {
      byDifficulty[g.difficulty] = g._count._all;
    });

    const byType: Record<string, number> = { MCQ: 0, MSQ: 0, NAT: 0 };
    typeGroups.forEach((g) => {
      byType[g.type] = g._count._all;
    });

    const subjectCoverage = subjects.map((subj) => {
      let count = 0;
      subj.modules.forEach((mod) => {
        mod.topics.forEach((top) => {
          top.subtopics.forEach((subtop) => {
            count += subtop._count.questions;
          });
        });
      });
      return {
        subjectId: subj.id,
        subjectName: subj.name,
        questionCount: count,
      };
    });

    let healthStatus: 'EXCELLENT' | 'GOOD' | 'NEEDS_ATTENTION' = 'GOOD';
    if (totalApprovedQuestions > 50 && pendingAiQuestions === 0 && unattemptedQuestionsCount < totalApprovedQuestions * 0.5) {
      healthStatus = 'EXCELLENT';
    } else if (totalApprovedQuestions < 10 || pendingAiQuestions > 10) {
      healthStatus = 'NEEDS_ATTENTION';
    }

    return {
      totalApprovedQuestions,
      pendingAiQuestions,
      rejectedQuestions,
      duplicateOrSimilarCount,
      unattemptedQuestionsCount,
      byDifficulty,
      byType,
      subjectCoverage,
      healthStatus,
    };
  }
}
