import { prisma } from '../../../config/prisma';
import { Role } from '@prisma/client';
import { LLMFactory } from './llmProvider';

export class AIStatsService {
  /**
   * Safely retrieves student count.
   */
  public static async getStudentCount(): Promise<number> {
    return await prisma.user.count({
      where: { role: Role.STUDENT },
    });
  }

  /**
   * Safely retrieves faculty count.
   */
  public static async getFacultyCount(): Promise<number> {
    return await prisma.user.count({
      where: { role: Role.FACULTY },
    });
  }

  /**
   * Safely retrieves mock test / exam count.
   */
  public static async getExamCount(): Promise<number> {
    return await prisma.mockTest.count();
  }

  /**
   * Safely retrieves total questions in Question Bank.
   */
  public static async getQuestionBankCount(): Promise<number> {
    return await prisma.question.count();
  }

  /**
   * Safely retrieves department statistics.
   */
  public static async getDepartmentStatistics(): Promise<any[]> {
    const users = await prisma.user.groupBy({
      by: ['department'],
      _count: {
        id: true,
      },
    });
    return users.map((u) => ({
      department: u.department,
      studentCount: u._count.id,
    }));
  }

  /**
   * Safely retrieves exams scheduled this week.
   */
  public static async getExamsScheduledThisWeek(): Promise<number> {
    const now = new Date();
    const oneWeekLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    return await prisma.mockTest.count({
      where: {
        startTime: {
          gte: now,
          lte: oneWeekLater,
        },
      },
    });
  }

  /**
   * Safely retrieves average score metrics for mock tests.
   */
  public static async getAverageScore(testTitleQuery?: string): Promise<any> {
    let whereClause: any = {
      status: 'COMPLETED',
    };

    if (testTitleQuery) {
      whereClause.test = {
        title: {
          contains: testTitleQuery,
          mode: 'insensitive',
        },
      };
    }

    const agg = await prisma.testAssignment.aggregate({
      where: whereClause,
      _avg: {
        score: true,
      },
      _count: {
        id: true,
      },
    });

    return {
      averageScore: agg._avg.score !== null ? parseFloat(agg._avg.score.toFixed(2)) : null,
      completedAttempts: agg._count.id,
    };
  }

  /**
   * Safely retrieves overall attendance statistics.
   */
  public static async getAttendanceStatistics(): Promise<any> {
    const total = await prisma.testAssignment.count();
    const completed = await prisma.testAssignment.count({
      where: {
        status: { in: ['COMPLETED', 'AUTO_SUBMITTED'] },
      },
    });
    return {
      totalAssigned: total,
      totalCompleted: completed,
      attendanceRate: total > 0 ? parseFloat(((completed / total) * 100).toFixed(2)) : 0,
    };
  }

  /**
   * Generates real student performance insights based on actual exam response logs.
   */
  public static async getStudentPerformanceInsights(studentId: string): Promise<any> {
    const responses = await prisma.questionResponse.findMany({
      where: {
        assignment: {
          studentId,
          status: { in: ['COMPLETED', 'AUTO_SUBMITTED'] },
        },
      },
      include: {
        question: {
          include: {
            subtopic: {
              include: {
                topic: {
                  include: {
                    module: {
                      include: {
                        subject: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (responses.length === 0) {
      return null;
    }

    // Accumulate subject accuracy & topic accuracy
    const subjectStats: { [key: string]: { correct: number; total: number } } = {};
    const topicStats: { [key: string]: { correct: number; total: number; subject: string } } = {};

    for (const r of responses) {
      const subjectName = r.question.subtopic.topic.module.subject.name;
      const topicName = r.question.subtopic.topic.name;
      const isCorrect = r.isCorrect;

      // Subject stats
      if (!subjectStats[subjectName]) {
        subjectStats[subjectName] = { correct: 0, total: 0 };
      }
      subjectStats[subjectName].total++;
      if (isCorrect) subjectStats[subjectName].correct++;

      // Topic stats
      if (!topicStats[topicName]) {
        topicStats[topicName] = { correct: 0, total: 0, subject: subjectName };
      }
      topicStats[topicName].total++;
      if (isCorrect) topicStats[topicName].correct++;
    }

    // Format analysis
    const subjects = Object.keys(subjectStats).map((name) => {
      const stats = subjectStats[name];
      const accuracy = parseFloat(((stats.correct / stats.total) * 100).toFixed(2));
      return { name, accuracy, correct: stats.correct, total: stats.total };
    });

    const topics = Object.keys(topicStats).map((name) => {
      const stats = topicStats[name];
      const accuracy = parseFloat(((stats.correct / stats.total) * 100).toFixed(2));
      return { name, accuracy, subject: stats.subject, correct: stats.correct, total: stats.total };
    });

    const strongSubjects = subjects.filter((s) => s.accuracy >= 70).map((s) => s.name);
    const weakSubjects = subjects.filter((s) => s.accuracy < 50).map((s) => s.name);
    const weakTopics = topics.filter((t) => t.accuracy < 50).map((t) => t.name);

    return {
      subjects,
      topics,
      strongSubjects,
      weakSubjects,
      weakTopics,
      recommendations: weakTopics.slice(0, 3).map((t) => `Practice more questions in "${t}" to improve accuracy.`),
    };
  }

  /**
   * Intent router parsing query text, fetching real values, and letting LLM formulate an explanation.
   */
  /**
   * Safely retrieves a report of examinations scheduled or held today.
   */
  public static async getTodayExamsReport(): Promise<any[]> {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);

    const exams = await prisma.mockTest.findMany({
      where: {
        startTime: {
          gte: startOfToday,
          lte: endOfToday,
        },
      },
      include: {
        assignments: {
          select: {
            id: true,
            status: true,
            score: true,
            startedAt: true,
          }
        }
      }
    });

    return exams.map((e) => {
      const total = e.assignments.length;
      const present = e.assignments.filter(a => a.startedAt !== null).length;
      const completed = e.assignments.filter(a => a.status === 'COMPLETED').length;
      const scores = e.assignments.map(a => a.score || 0);
      const avgScore = scores.length > 0 ? parseFloat((scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2)) : 0;
      const maxScore = scores.length > 0 ? Math.max(...scores) : 0;

      return {
        id: e.id,
        title: e.title,
        status: e.status,
        totalCandidates: total,
        presentCandidates: present,
        completedCandidates: completed,
        averageScore: avgScore,
        maximumScore: maxScore,
      };
    });
  }

  /**
   * Safely retrieves the top 10 performing students based on exam scores.
   */
  public static async getTop10Students(): Promise<any[]> {
    const topAssignments = await prisma.testAssignment.findMany({
      where: {
        status: 'COMPLETED',
        score: { not: null }
      },
      orderBy: {
        score: 'desc'
      },
      take: 10,
      include: {
        student: {
          select: {
            name: true,
            registerNo: true,
            department: true,
          }
        },
        test: {
          select: {
            title: true
          }
        }
      }
    });

    return topAssignments.map(a => ({
      studentName: a.student.name,
      registerNo: a.student.registerNo,
      department: a.student.department,
      examTitle: a.test.title,
      score: a.score,
      totalMarks: a.totalMarks,
    }));
  }

  public static async handleStatsQuery(promptText: string, userRole: Role): Promise<string> {
    // Strict RBAC: only Admin and Faculty are allowed to request statistics.
    if (userRole !== Role.ADMIN && userRole !== Role.FACULTY) {
      return 'I am sorry, but your role is not authorized to query system statistics.';
    }

    const normalized = promptText.toLowerCase();
    let statsData: any = {};
    let matchedIntent = '';

    // Match intents using keyword triggers
    if (normalized.includes('how many students') || normalized.includes('student count') || normalized.includes('registered students')) {
      statsData.studentCount = await this.getStudentCount();
      matchedIntent = 'student registration count';
    } else if (normalized.includes('how many faculty') || normalized.includes('faculty count')) {
      statsData.facultyCount = await this.getFacultyCount();
      matchedIntent = 'faculty registration count';
    } else if (normalized.includes('how many exams') || normalized.includes('exam count') || normalized.includes('mock tests count')) {
      statsData.examCount = await this.getExamCount();
      matchedIntent = 'examination count';
    } else if (normalized.includes('question bank') || normalized.includes('how many questions')) {
      statsData.questionCount = await this.getQuestionBankCount();
      matchedIntent = 'question bank size';
    } else if (normalized.includes('today\'s test') || normalized.includes('today test') || normalized.includes('report of today')) {
      statsData.todayExamsReport = await this.getTodayExamsReport();
      matchedIntent = 'report and summary of examinations scheduled today';
    } else if (normalized.includes('top 10') || normalized.includes('top student') || normalized.includes('highest score')) {
      statsData.top10Students = await this.getTop10Students();
      matchedIntent = 'top 10 performing candidates by score';
    } else if (normalized.includes('how many present') || normalized.includes('present candidates') || normalized.includes('attendance details')) {
      const todayExams = await this.getTodayExamsReport();
      statsData.attendanceSummary = todayExams.map(ex => ({
        examTitle: ex.title,
        totalCandidates: ex.totalCandidates,
        presentCandidates: ex.presentCandidates,
        absentCandidates: ex.totalCandidates - ex.presentCandidates,
      }));
      matchedIntent = 'attendance detail summary for examinations scheduled today';
    } else if (normalized.includes('department') && (normalized.includes('most') || normalized.includes('students'))) {
      statsData.departmentStats = await this.getDepartmentStatistics();
      matchedIntent = 'student distribution by department';
    } else if (normalized.includes('scheduled this week') || normalized.includes('exams this week')) {
      statsData.examsThisWeek = await this.getExamsScheduledThisWeek();
      matchedIntent = 'exams scheduled within the next 7 days';
    } else if (normalized.includes('average score') || normalized.includes('avg score') || normalized.includes('average performance')) {
      // Check if a specific course code/title was mentioned (e.g. CS6301)
      const match = promptText.match(/(cs\d{4}|cs\d{3}|cs\s\d{4})/i);
      const testQuery = match ? match[0] : undefined;
      statsData.performance = await this.getAverageScore(testQuery);
      matchedIntent = `average score performance ${testQuery ? 'for ' + testQuery : 'overall'}`;
    } else if (normalized.includes('attendance') || normalized.includes('how many completed')) {
      statsData.attendance = await this.getAttendanceStatistics();
      matchedIntent = 'examination attendance and completion rates';
    } else {
      // Default query: return overall system summary statistics to explain.
      statsData.studentCount = await this.getStudentCount();
      statsData.facultyCount = await this.getFacultyCount();
      statsData.examCount = await this.getExamCount();
      statsData.questionCount = await this.getQuestionBankCount();
      matchedIntent = 'overall system statistics summary';
    }

    // Call LLM to formulate explanation
    const systemPrompt = `
SYSTEM INSTRUCTIONS:
You are the GSMAS AI Statistics Assistant.
You will be provided with real data queried directly from the PostgreSQL database database regarding: ${matchedIntent}.

Your instructions are:
1. Explain the query statistics provided in the DATA payload below to the user in a professional manner.
2. Under no circumstances should you invent or fabricate database values, student numbers, average scores, or department rankings. Only use the values present in the DATA section.
3. If the data is empty or null, state clearly that no records were found matching the query.
4. Do not output raw JSON. Present the metrics in a clean, human-readable format.

DATA:
==================================
${JSON.stringify(statsData, null, 2)}
==================================
`;

    const llm = LLMFactory.getProvider();
    return await llm.generate(systemPrompt, [], promptText);
  }
}
