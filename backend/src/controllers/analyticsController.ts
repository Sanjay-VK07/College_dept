import { Response } from 'express';
import { AuthRequest } from '../middlewares/authMiddleware';
import { prisma } from '../config/prisma';

export class AnalyticsController {
  /**
   * Student Analytics Hub (Subject accuracy, weak/strong topics, attempt history)
   * Strictly protected by student privacy middleware
   */
  public static async getStudentAnalytics(req: AuthRequest, res: Response) {
    try {
      const studentId = req.params.studentId || req.user!.id;

      const assignments = await prisma.testAssignment.findMany({
        where: { studentId, status: 'COMPLETED' },
        include: {
          test: true,
          responses: {
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
          },
        },
        orderBy: { submittedAt: 'asc' },
      });

      // Compute topic performance
      const topicStats = new Map<string, { total: number; correct: number; subjectName: string }>();

      let overallAttempted = 0;
      let overallCorrect = 0;
      let totalTimeSec = 0;

      assignments.forEach((a: any) => {
        a.responses.forEach((r: any) => {
          const topicName = r.question.subtopic.topic.name;
          const subjectName = r.question.subtopic.topic.module.subject.name;

          if (!topicStats.has(topicName)) {
            topicStats.set(topicName, { total: 0, correct: 0, subjectName });
          }

          const current = topicStats.get(topicName)!;
          current.total += 1;
          overallAttempted += 1;
          totalTimeSec += r.timeSpentSec;

          if (r.isCorrect) {
            current.correct += 1;
            overallCorrect += 1;
          }
        });
      });

      const topicAccuracy = Array.from(topicStats.entries()).map(([topic, stat]) => ({
        topic,
        subject: stat.subjectName,
        accuracy: Math.round((stat.correct / stat.total) * 100),
        total: stat.total,
      }));

      // Sort weak and strong topics
      const strongTopics = [...topicAccuracy].sort((a, b) => b.accuracy - a.accuracy).slice(0, 3);
      const weakTopics = [...topicAccuracy].sort((a, b) => a.accuracy - b.accuracy).slice(0, 3);

      const historyGraph = assignments.map((a: any) => ({
        testTitle: a.test.title,
        date: a.submittedAt?.toISOString().split('T')[0],
        score: a.score || 0,
        totalMarks: a.test.totalMarks,
        accuracy: a.accuracy || 0,
      }));

      return res.status(200).json({
        success: true,
        data: {
          overallAccuracy: overallAttempted > 0 ? Math.round((overallCorrect / overallAttempted) * 100) : 0,
          avgTimePerQuestion: overallAttempted > 0 ? Math.round(totalTimeSec / overallAttempted) : 0,
          totalExamsCompleted: assignments.length,
          strongTopics,
          weakTopics,
          topicAccuracy,
          historyGraph,
        },
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Faculty Deep Analytics (Class average, most wrong questions, most skipped, pass %)
   */
  public static async getFacultyTestAnalytics(req: AuthRequest, res: Response) {
    try {
      const { testId } = req.params;

      const test = await prisma.mockTest.findUnique({
        where: { id: testId },
        include: {
          assignments: {
            include: {
              student: true,
              responses: {
                include: {
                  question: true,
                },
              },
            },
          },
        },
      });

      if (!test) {
        return res.status(404).json({ success: false, message: 'Test not found' });
      }

      const completed = test.assignments.filter((a: any) => a.status === 'COMPLETED' || a.status === 'AUTO_SUBMITTED');
      const totalStudents = completed.length;

      const avgScore = totalStudents > 0 ? completed.reduce((acc: number, curr: any) => acc + (curr.score || 0), 0) / totalStudents : 0;
      const passCount = completed.filter((a: any) => (a.score || 0) >= (test.totalMarks * 0.35)).length; // GATE 35% cutoff estimate
      const passPercentage = totalStudents > 0 ? Math.round((passCount / totalStudents) * 100) : 0;

      // Question-wise breakdown
      const questionStats = new Map<string, { questionText: string; type: string; wrongCount: number; skippedCount: number; correctCount: number }>();

      completed.forEach((a: any) => {
        a.responses.forEach((r: any) => {
          if (!questionStats.has(r.questionId)) {
            questionStats.set(r.questionId, {
              questionText: r.question.text,
              type: r.question.type,
              wrongCount: 0,
              skippedCount: 0,
              correctCount: 0,
            });
          }

          const qStat = questionStats.get(r.questionId)!;
          if (r.status === 'SKIPPED' || r.status === 'NOT_VISITED') {
            qStat.skippedCount += 1;
          } else if (r.isCorrect) {
            qStat.correctCount += 1;
          } else {
            qStat.wrongCount += 1;
          }
        });
      });

      const mostWrongQuestions = Array.from(questionStats.values()).sort((a, b) => b.wrongCount - a.wrongCount).slice(0, 5);
      const mostSkippedQuestions = Array.from(questionStats.values()).sort((a, b) => b.skippedCount - a.skippedCount).slice(0, 5);

      return res.status(200).json({
        success: true,
        data: {
          testTitle: test.title,
          totalStudents,
          avgScore: Number(avgScore.toFixed(2)),
          passPercentage,
          totalMarks: test.totalMarks,
          mostWrongQuestions,
          mostSkippedQuestions,
        },
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }
}
