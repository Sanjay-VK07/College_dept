import { prisma } from '../../../config/prisma';

export interface ExamIntelligenceMetrics {
  mockTestId: string;
  title: string;
  isPublished: boolean;
  totalQuestions: number;
  totalMarks: number;
  durationMinutes: number;
  completedAssignmentsCount: number;
  averageScore: number;
  averageAccuracyPercentage: number;
  completionRatePercentage: number;
  actualDifficultyDistribution: { EASY: number; MEDIUM: number; HARD: number };
  typeDistribution: { MCQ: number; MSQ: number; NAT: number };
  topicCoverage: Array<{ topicName: string; count: number }>;
  balanceAssessment: string;
}

export class ExamIntelligenceService {
  /**
   * Evaluates intelligence metrics & balance for a specific MockTest based on real completed assignments.
   */
  public static async getExamIntelligence(mockTestId: string): Promise<ExamIntelligenceMetrics | null> {
    const mockTest = await prisma.mockTest.findUnique({
      where: { id: mockTestId },
      include: {
        testQuestions: {
          include: {
            question: {
              include: {
                subtopic: { include: { topic: true } },
              },
            },
          },
        },
        assignments: {
          where: { status: { in: ['COMPLETED', 'AUTO_SUBMITTED'] } },
        },
      },
    });

    if (!mockTest) return null;

    const questions = mockTest.testQuestions.map((tq) => tq.question);
    const totalQuestions = questions.length;

    // Difficulty & Type Distribution
    const difficultyCounts = { EASY: 0, MEDIUM: 0, HARD: 0 };
    const typeCounts = { MCQ: 0, MSQ: 0, NAT: 0 };
    const topicMap = new Map<string, number>();

    questions.forEach((q) => {
      const diff = (q.difficulty || 'MEDIUM') as string;
      if (diff === 'EASY' || diff === 'VERY_EASY') difficultyCounts.EASY++;
      else if (diff === 'HARD' || diff === 'VERY_HARD') difficultyCounts.HARD++;
      else difficultyCounts.MEDIUM++;

      const type = (q.type || 'MCQ') as 'MCQ' | 'MSQ' | 'NAT';
      typeCounts[type] = (typeCounts[type] || 0) + 1;

      const topicName = q.subtopic?.topic?.name || 'General';
      topicMap.set(topicName, (topicMap.get(topicName) || 0) + 1);
    });

    const topicCoverage = Array.from(topicMap.entries()).map(([topicName, count]) => ({
      topicName,
      count,
    }));

    // Completed Assignments Metrics
    const completedAssignments = mockTest.assignments;
    const completedAssignmentsCount = completedAssignments.length;

    let averageScore = 0;
    let averageAccuracyPercentage = 0;

    if (completedAssignmentsCount > 0) {
      const totalScoreSum = completedAssignments.reduce((acc, a) => acc + (a.score || 0), 0);
      const totalAccuracySum = completedAssignments.reduce((acc, a) => acc + (a.accuracy || 0), 0);

      averageScore = Math.round((totalScoreSum / completedAssignmentsCount) * 100) / 100;
      averageAccuracyPercentage = Math.round((totalAccuracySum / completedAssignmentsCount) * 10) / 10;
    }

    const totalAssigned = await prisma.testAssignment.count({ where: { testId: mockTestId } });
    const completionRatePercentage = totalAssigned > 0 ? Math.round((completedAssignmentsCount / totalAssigned) * 1000) / 10 : 0;

    // Balance Assessment
    let balanceAssessment = 'Balanced exam difficulty and question type distribution.';
    const totalCount = totalQuestions || 1;
    const easyPct = Math.round((difficultyCounts.EASY / totalCount) * 100);
    const hardPct = Math.round((difficultyCounts.HARD / totalCount) * 100);

    if (easyPct > 60) {
      balanceAssessment = 'Exam difficulty leans heavily EASY compared to standard GATE target (30% EASY).';
    } else if (hardPct > 50) {
      balanceAssessment = 'Exam difficulty leans heavily HARD compared to standard GATE target (20% HARD).';
    }

    return {
      mockTestId: mockTest.id,
      title: mockTest.title,
      isPublished: mockTest.isPublished,
      totalQuestions,
      totalMarks: mockTest.totalMarks,
      durationMinutes: mockTest.durationMinutes,
      completedAssignmentsCount,
      averageScore,
      averageAccuracyPercentage,
      completionRatePercentage,
      actualDifficultyDistribution: difficultyCounts,
      typeDistribution: typeCounts,
      topicCoverage,
      balanceAssessment,
    };
  }

  /**
   * Returns overview intelligence for all MockTests in the system using efficient bulk queries.
   */
  public static async getAllExamsIntelligence(): Promise<ExamIntelligenceMetrics[]> {
    const mockTests = await prisma.mockTest.findMany({
      include: {
        testQuestions: {
          include: {
            question: {
              include: {
                subtopic: { include: { topic: true } },
              },
            },
          },
        },
        assignments: {
          where: { status: { in: ['COMPLETED', 'AUTO_SUBMITTED'] } },
        },
      },
    });

    const assignmentCounts = await prisma.testAssignment.groupBy({
      by: ['testId'],
      _count: { _all: true },
    });

    const countMap = new Map<string, number>();
    assignmentCounts.forEach((ac) => {
      countMap.set(ac.testId, ac._count._all);
    });

    return mockTests.map((mockTest) => {
      const questions = mockTest.testQuestions.map((tq) => tq.question);
      const totalQuestions = questions.length;

      const difficultyCounts = { EASY: 0, MEDIUM: 0, HARD: 0 };
      const typeCounts = { MCQ: 0, MSQ: 0, NAT: 0 };
      const topicMap = new Map<string, number>();

      questions.forEach((q) => {
        const diff = (q.difficulty || 'MEDIUM') as string;
        if (diff === 'EASY' || diff === 'VERY_EASY') difficultyCounts.EASY++;
        else if (diff === 'HARD' || diff === 'VERY_HARD') difficultyCounts.HARD++;
        else difficultyCounts.MEDIUM++;

        const type = (q.type || 'MCQ') as 'MCQ' | 'MSQ' | 'NAT';
        typeCounts[type] = (typeCounts[type] || 0) + 1;

        const topicName = q.subtopic?.topic?.name || 'General';
        topicMap.set(topicName, (topicMap.get(topicName) || 0) + 1);
      });

      const topicCoverage = Array.from(topicMap.entries()).map(([topicName, count]) => ({
        topicName,
        count,
      }));

      const completedAssignments = mockTest.assignments;
      const completedAssignmentsCount = completedAssignments.length;

      let averageScore = 0;
      let averageAccuracyPercentage = 0;

      if (completedAssignmentsCount > 0) {
        const totalScoreSum = completedAssignments.reduce((acc, a) => acc + (a.score || 0), 0);
        const totalAccuracySum = completedAssignments.reduce((acc, a) => acc + (a.accuracy || 0), 0);

        averageScore = Math.round((totalScoreSum / completedAssignmentsCount) * 100) / 100;
        averageAccuracyPercentage = Math.round((totalAccuracySum / completedAssignmentsCount) * 10) / 10;
      }

      const totalAssigned = countMap.get(mockTest.id) || 0;
      const completionRatePercentage = totalAssigned > 0 ? Math.round((completedAssignmentsCount / totalAssigned) * 1000) / 10 : 0;

      let balanceAssessment = 'Balanced exam difficulty and question type distribution.';
      const totalCount = totalQuestions || 1;
      const easyPct = Math.round((difficultyCounts.EASY / totalCount) * 100);
      const hardPct = Math.round((difficultyCounts.HARD / totalCount) * 100);

      if (easyPct > 60) {
        balanceAssessment = 'Exam difficulty leans heavily EASY compared to standard GATE target (30% EASY).';
      } else if (hardPct > 50) {
        balanceAssessment = 'Exam difficulty leans heavily HARD compared to standard GATE target (20% HARD).';
      }

      return {
        mockTestId: mockTest.id,
        title: mockTest.title,
        isPublished: mockTest.isPublished,
        totalQuestions,
        totalMarks: mockTest.totalMarks,
        durationMinutes: mockTest.durationMinutes,
        completedAssignmentsCount,
        averageScore,
        averageAccuracyPercentage,
        completionRatePercentage,
        actualDifficultyDistribution: difficultyCounts,
        typeDistribution: typeCounts,
        topicCoverage,
        balanceAssessment,
      };
    });
  }
}
