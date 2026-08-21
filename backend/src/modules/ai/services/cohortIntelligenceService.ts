import { prisma } from '../../../config/prisma';

export interface TopicAcademicGap {
  topicId: string;
  topicName: string;
  subjectName: string;
  attemptCount: number;
  accuracyPercentage: number;
  status: 'WEAK_ACADEMIC_AREA' | 'MODERATE' | 'STRONG';
  evidence: string;
}

export interface CohortPerformanceOverview {
  department: string;
  totalStudentsCount: number;
  totalExamsCompleted: number;
  averageCohortAccuracy: number;
  academicGaps: TopicAcademicGap[];
}

export class CohortIntelligenceService {
  /**
   * Aggregates real cohort performance by department and identifies evidence-based academic gaps.
   */
  public static async getCohortIntelligence(department: string = 'Computer Science and Engineering'): Promise<CohortPerformanceOverview> {
    const studentCount = await prisma.user.count({
      where: { role: 'STUDENT', department },
    });

    const completedAssignments = await prisma.testAssignment.findMany({
      where: {
        student: { department },
        status: { in: ['COMPLETED', 'AUTO_SUBMITTED'] },
      },
      include: {
        responses: {
          include: {
            question: {
              include: {
                subtopic: {
                  include: {
                    topic: {
                      include: { module: { include: { subject: true } } },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (completedAssignments.length === 0) {
      return {
        department,
        totalStudentsCount: studentCount,
        totalExamsCompleted: 0,
        averageCohortAccuracy: 0,
        academicGaps: [],
      };
    }

    let totalAccSum = 0;
    completedAssignments.forEach((a) => {
      totalAccSum += a.accuracy || 0;
    });
    const averageCohortAccuracy = Math.round((totalAccSum / completedAssignments.length) * 10) / 10;

    // Group responses by Topic ID
    const topicGroupMap = new Map<
      string,
      { topicName: string; subjectName: string; totalAttempts: number; correctAttempts: number }
    >();

    completedAssignments.forEach((a) => {
      a.responses.forEach((r) => {
        if (r.status === 'ANSWERED' || r.status === 'ANSWERED_AND_MARKED') {
          const topic = r.question?.subtopic?.topic;
          if (topic) {
            const topicId = topic.id;
            const topicName = topic.name;
            const subjectName = topic.module?.subject?.name || 'General';

            const existing = topicGroupMap.get(topicId) || {
              topicName,
              subjectName,
              totalAttempts: 0,
              correctAttempts: 0,
            };

            existing.totalAttempts++;
            if (r.isCorrect) existing.correctAttempts++;
            topicGroupMap.set(topicId, existing);
          }
        }
      });
    });

    const academicGaps: TopicAcademicGap[] = [];

    topicGroupMap.forEach((data, topicId) => {
      if (data.totalAttempts >= 5) {
        const accuracyPct = Math.round((data.correctAttempts / data.totalAttempts) * 1000) / 10;
        let status: 'WEAK_ACADEMIC_AREA' | 'MODERATE' | 'STRONG' = 'MODERATE';
        let evidence = `Topic '${data.topicName}' accuracy is ${accuracyPct}% across ${data.totalAttempts} attempts.`;

        if (accuracyPct < 55) {
          status = 'WEAK_ACADEMIC_AREA';
          evidence = `Topic '${data.topicName}' shows below-average cohort performance (${accuracyPct}% accuracy across ${data.totalAttempts} attempts).`;
        } else if (accuracyPct >= 75) {
          status = 'STRONG';
          evidence = `Topic '${data.topicName}' demonstrates strong cohort mastery (${accuracyPct}% accuracy across ${data.totalAttempts} attempts).`;
        }

        academicGaps.push({
          topicId,
          topicName: data.topicName,
          subjectName: data.subjectName,
          attemptCount: data.totalAttempts,
          accuracyPercentage: accuracyPct,
          status,
          evidence,
        });
      }
    });

    return {
      department,
      totalStudentsCount: studentCount,
      totalExamsCompleted: completedAssignments.length,
      averageCohortAccuracy,
      academicGaps: academicGaps.sort((a, b) => a.accuracyPercentage - b.accuracyPercentage),
    };
  }
}
