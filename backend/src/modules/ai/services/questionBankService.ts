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

    // Previously this ran ~13 separate count() queries PER TOPIC in a sequential loop — for a
    // 40-topic subject that's ~520 DB round trips, which measured live (via real UI testing) at
    // well over 30 seconds before the Smart Question Paper Builder's topic step ever finished
    // loading. Fixed by fetching every question in the subject once and aggregating all the same
    // breakdowns in memory — one query instead of hundreds, regardless of topic count.
    const allSubtopics = modules.flatMap((mod) => mod.topics.flatMap((topic) => topic.subtopics.map((s) => ({ ...s, topicId: topic.id }))));
    const subtopicIdToTopicId = new Map(allSubtopics.map((s) => [s.id, s.topicId]));
    const allSubtopicIds = allSubtopics.map((s) => s.id);

    const questions = allSubtopicIds.length
      ? await prisma.question.findMany({
          where: { subtopicId: { in: allSubtopicIds } },
          select: { subtopicId: true, verificationStatus: true, origin: true, type: true, difficulty: true },
        })
      : [];

    const topicIds = modules.flatMap((mod) => mod.topics.map((t) => t.id));
    const [subjectLevelChunkCount, topicLevelChunks] = await Promise.all([
      prisma.aIDocumentChunk.count({ where: { document: { subjectId } } }),
      topicIds.length
        ? prisma.aIDocumentChunk.groupBy({
            by: ['documentId'],
            where: { document: { topicId: { in: topicIds } } },
            _count: true,
          }).then(async (rows) => {
            if (rows.length === 0) return new Set<string>();
            const docs = await prisma.aIDocument.findMany({ where: { id: { in: rows.map((r) => r.documentId) } }, select: { topicId: true } });
            return new Set(docs.map((d) => d.topicId).filter((id): id is string => !!id));
          })
        : Promise.resolve(new Set<string>()),
    ]);
    const hasSubjectLevelSource = subjectLevelChunkCount > 0;

    type Bucket = {
      total: number; verified: number; needsReview: number; rejected: number;
      sourceQuestions: number; aiGenerated: number;
      types: { MCQ: number; MSQ: number; NAT: number };
      difficulty: { EASY: number; MEDIUM: number; HARD: number };
    };
    const emptyBucket = (): Bucket => ({
      total: 0, verified: 0, needsReview: 0, rejected: 0, sourceQuestions: 0, aiGenerated: 0,
      types: { MCQ: 0, MSQ: 0, NAT: 0 }, difficulty: { EASY: 0, MEDIUM: 0, HARD: 0 },
    });
    const byTopic = new Map<string, Bucket>();

    for (const q of questions) {
      const topicId = subtopicIdToTopicId.get(q.subtopicId);
      if (!topicId) continue;
      if (!byTopic.has(topicId)) byTopic.set(topicId, emptyBucket());
      const b = byTopic.get(topicId)!;
      b.total++;
      if (q.verificationStatus === VerificationStatus.VERIFIED) {
        b.verified++;
        if (q.type === QuestionType.MCQ) b.types.MCQ++;
        else if (q.type === QuestionType.MSQ) b.types.MSQ++;
        else if (q.type === QuestionType.NAT) b.types.NAT++;
        if (q.difficulty === Difficulty.EASY || q.difficulty === Difficulty.VERY_EASY) b.difficulty.EASY++;
        else if (q.difficulty === Difficulty.MEDIUM) b.difficulty.MEDIUM++;
        else if (q.difficulty === Difficulty.HARD || q.difficulty === Difficulty.VERY_HARD) b.difficulty.HARD++;
      } else if (q.verificationStatus === VerificationStatus.NEEDS_REVIEW) {
        b.needsReview++;
      } else if (q.verificationStatus === VerificationStatus.REJECTED) {
        b.rejected++;
      }
      if (q.origin === QuestionOrigin.SOURCE) b.sourceQuestions++;
      else if (q.origin === QuestionOrigin.AI_GENERATED) b.aiGenerated++;
    }

    const topicResults: TopicAvailability[] = [];
    for (const mod of modules) {
      for (const topic of mod.topics) {
        const b = byTopic.get(topic.id) || emptyBucket();
        topicResults.push({
          topicId: topic.id,
          topicName: topic.name,
          moduleId: mod.id,
          moduleName: mod.name,
          total: b.total,
          verified: b.verified,
          needsReview: b.needsReview,
          rejected: b.rejected,
          sourceQuestions: b.sourceQuestions,
          aiGenerated: b.aiGenerated,
          types: b.types,
          difficulty: b.difficulty,
          hasSourceMaterial: hasSubjectLevelSource || topicLevelChunks.has(topic.id),
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
