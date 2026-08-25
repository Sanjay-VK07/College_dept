import { prisma } from '../../../config/prisma';
import { VerificationStatus, QuestionOrigin, QuestionType, Difficulty } from '@prisma/client';

export interface TopicAvailability {
  topicId: string;
  topicName: string;
  moduleId: string;
  moduleName: string;
  total: number;
  verified: number;
  needsReview: number;
  rejected: number;
  sourceQuestions: number;
  aiGenerated: number;
  types: {
    MCQ: number;
    MSQ: number;
    NAT: number;
  };
  difficulty: {
    EASY: number;
    MEDIUM: number;
    HARD: number;
  };
  hasSourceMaterial: boolean;
}

export class QuestionBankService {
  /**
   * Retrieves all subjects with real PostgreSQL count metrics.
   */
  public static async getSubjects() {
    const subjects = await prisma.subject.findMany({
      include: {
        modules: {
          include: {
            topics: {
              include: {
                subtopics: {
                  include: {
                    _count: {
                      select: { questions: true },
                    },
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    return subjects.map((subj) => {
      let totalTopics = 0;
      let totalQuestions = 0;

      for (const mod of subj.modules) {
        for (const top of mod.topics) {
          totalTopics++;
          for (const sub of top.subtopics) {
            totalQuestions += sub._count.questions;
          }
        }
      }

      return {
        id: subj.id,
        name: subj.name,
        code: subj.code,
        department: subj.department,
        totalTopics,
        totalQuestions,
      };
    });
  }

  /**
   * Retrieves database-driven availability metrics per topic for a given subject.
   */
  public static async getTopicAvailability(subjectId: string): Promise<TopicAvailability[]> {
    const modules = await prisma.module.findMany({
      where: { subjectId },
      include: {
        topics: {
          include: {
            subtopics: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    const topicResults: TopicAvailability[] = [];

    for (const mod of modules) {
      for (const topic of mod.topics) {
        const subtopicIds = topic.subtopics.map((s) => s.id);

        if (subtopicIds.length === 0) {
          topicResults.push({
            topicId: topic.id,
            topicName: topic.name,
            moduleId: mod.id,
            moduleName: mod.name,
            total: 0,
            verified: 0,
            needsReview: 0,
            rejected: 0,
            sourceQuestions: 0,
            aiGenerated: 0,
            types: { MCQ: 0, MSQ: 0, NAT: 0 },
            difficulty: { EASY: 0, MEDIUM: 0, HARD: 0 },
            hasSourceMaterial: false,
          });
          continue;
        }

        // Fetch real question counts from PostgreSQL for these subtopics
        const [
          totalCount,
          verifiedCount,
          needsReviewCount,
          rejectedCount,
          sourceCount,
          aiCount,
          mcqCount,
          msqCount,
          natCount,
          easyCount,
          mediumCount,
          hardCount,
          sourceChunksCount,
        ] = await Promise.all([
          prisma.question.count({ where: { subtopicId: { in: subtopicIds } } }),
          prisma.question.count({
            where: { subtopicId: { in: subtopicIds }, verificationStatus: VerificationStatus.VERIFIED },
          }),
          prisma.question.count({
            where: { subtopicId: { in: subtopicIds }, verificationStatus: VerificationStatus.NEEDS_REVIEW },
          }),
          prisma.question.count({
            where: { subtopicId: { in: subtopicIds }, verificationStatus: VerificationStatus.REJECTED },
          }),
          prisma.question.count({
            where: { subtopicId: { in: subtopicIds }, origin: QuestionOrigin.SOURCE },
          }),
          prisma.question.count({
            where: { subtopicId: { in: subtopicIds }, origin: QuestionOrigin.AI_GENERATED },
          }),
          prisma.question.count({
            where: {
              subtopicId: { in: subtopicIds },
              verificationStatus: VerificationStatus.VERIFIED,
              type: QuestionType.MCQ,
            },
          }),
          prisma.question.count({
            where: {
              subtopicId: { in: subtopicIds },
              verificationStatus: VerificationStatus.VERIFIED,
              type: QuestionType.MSQ,
            },
          }),
          prisma.question.count({
            where: {
              subtopicId: { in: subtopicIds },
              verificationStatus: VerificationStatus.VERIFIED,
              type: QuestionType.NAT,
            },
          }),
          prisma.question.count({
            where: {
              subtopicId: { in: subtopicIds },
              verificationStatus: VerificationStatus.VERIFIED,
              difficulty: { in: [Difficulty.EASY, Difficulty.VERY_EASY] },
            },
          }),
          prisma.question.count({
            where: {
              subtopicId: { in: subtopicIds },
              verificationStatus: VerificationStatus.VERIFIED,
              difficulty: Difficulty.MEDIUM,
            },
          }),
          prisma.question.count({
            where: {
              subtopicId: { in: subtopicIds },
              verificationStatus: VerificationStatus.VERIFIED,
              difficulty: { in: [Difficulty.HARD, Difficulty.VERY_HARD] },
            },
          }),
          // Check if indexed AIDocumentChunks exist for this topic/subject
          prisma.aIDocumentChunk.count({
            where: {
              document: {
                OR: [{ subjectId }, { topicId: topic.id }],
              },
            },
          }),
        ]);

        topicResults.push({
          topicId: topic.id,
          topicName: topic.name,
          moduleId: mod.id,
          moduleName: mod.name,
          total: totalCount,
          verified: verifiedCount,
          needsReview: needsReviewCount,
          rejected: rejectedCount,
          sourceQuestions: sourceCount,
          aiGenerated: aiCount,
          types: {
            MCQ: mcqCount,
            MSQ: msqCount,
            NAT: natCount,
          },
          difficulty: {
            EASY: easyCount,
            MEDIUM: mediumCount,
            HARD: hardCount,
          },
          hasSourceMaterial: sourceChunksCount > 0,
        });
      }
    }

    return topicResults;
  }

  /**
   * Asserts whether a single question is safe to delete.
   * Questions linked to MockTestQuestion (DRAFT, PUBLISHED, COMPLETED) are strictly protected.
   */
  public static async assertQuestionDeletionSafety(questionId: string): Promise<void> {
    const usages = await prisma.mockTestQuestion.findMany({
      where: { questionId },
      include: {
        mockTest: { select: { id: true, title: true, status: true, isPublished: true } },
      },
    });

    if (usages.length > 0) {
      const examTitle = usages[0].mockTest.title;
      throw new Error(`Question is currently used in examination "${examTitle}" and cannot be deleted.`);
    }
  }

  /**
   * Evaluates a list of question IDs for bulk deletion safety.
   */
  public static async evaluateBulkQuestionDeletion(questionIds: string[]) {
    const usages = await prisma.mockTestQuestion.findMany({
      where: { questionId: { in: questionIds } },
      include: {
        mockTest: { select: { id: true, title: true } },
      },
    });

    const protectedMap = new Map<string, string>();
    for (const u of usages) {
      protectedMap.set(u.questionId, `Used in examination "${u.mockTest.title}"`);
    }

    const deletableIds = questionIds.filter((id) => !protectedMap.has(id));
    const protectedIds = questionIds
      .filter((id) => protectedMap.has(id))
      .map((id) => ({ id, reason: protectedMap.get(id)! }));

    return {
      deletableIds,
      protectedIds,
    };
  }
}
