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
        where: {
          studentId,
          status: { in: ['COMPLETED', 'AUTO_SUBMITTED'] },
        },
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

      // Deduplicated topic grouping using unique topic.id
      const topicStats = new Map<string, { id: string; topic: string; subjectName: string; total: number; correct: number }>();

      let overallAttempted = 0;
      let overallCorrect = 0;
      let totalTimeSec = 0;
      let timingResponseCount = 0;

      let analyticsEligibleExamsCount = 0;

      assignments.forEach((a: any) => {
        let assignmentHasAttempts = false;

        a.responses.forEach((r: any) => {
          // Verify valid attempted response
          const hasAnswer = r.chosenAnswer !== null && r.chosenAnswer !== undefined && r.chosenAnswer !== '';
          if (!hasAnswer && r.status !== 'ANSWERED' && r.status !== 'ANSWERED_AND_MARKED') {
            return;
          }

          assignmentHasAttempts = true;
          const topicId = r.question?.subtopic?.topic?.id;
          const topicName = r.question?.subtopic?.topic?.name;
          const subjectName = r.question?.subtopic?.topic?.module?.subject?.name || 'General';

          if (!topicId || !topicName) return;

          if (!topicStats.has(topicId)) {
            topicStats.set(topicId, { id: topicId, topic: topicName, subjectName, total: 0, correct: 0 });
          }

          const current = topicStats.get(topicId)!;
          current.total += 1;
          overallAttempted += 1;

          if (r.timeSpentSec && r.timeSpentSec > 0) {
            totalTimeSec += r.timeSpentSec;
            timingResponseCount += 1;
          }

          if (r.isCorrect) {
            current.correct += 1;
            overallCorrect += 1;
          }
        });

        if (assignmentHasAttempts) {
          analyticsEligibleExamsCount += 1;
        }
      });

      // Exclude topics with 0 attempted questions
      const validTopicAccuracy = Array.from(topicStats.values())
        .filter((stat) => stat.total > 0)
        .map((stat) => ({
          id: stat.id,
          topic: stat.topic,
          subject: stat.subjectName,
          accuracy: Math.round((stat.correct / stat.total) * 100),
          total: stat.total,
        }));

      // Rule 3: Mutually Exclusive Classification Rules
      // Strong: accuracy >= 70 and total > 0
      // Weak: accuracy < 70 and total > 0
      // A topic is placed in AT MOST ONE array using an explicit if-else loop
      const strongTopics: any[] = [];
      const weakTopics: any[] = [];

      for (const topicItem of validTopicAccuracy) {
        if (topicItem.accuracy >= 70) {
          strongTopics.push(topicItem);
        } else if (topicItem.accuracy < 70) {
          weakTopics.push(topicItem);
        }
      }

      // Sort strong (highest first) and weak (lowest first) and slice top 3
      strongTopics.sort((a, b) => b.accuracy - a.accuracy);
      weakTopics.sort((a, b) => a.accuracy - b.accuracy);

      const finalStrongTopics = strongTopics.slice(0, 3);
      const finalWeakTopics = weakTopics.slice(0, 3);

      // Verify Mutually Exclusive property: strongTopics ∩ weakTopics = ∅
      const strongIds = new Set(finalStrongTopics.map((t) => t.id));
      const duplicates = finalWeakTopics.filter((t) => strongIds.has(t.id));
      if (duplicates.length > 0) {
        console.error('CRITICAL ERROR: Overlapping topic classification detected!', duplicates);
      }

      const historyGraph = assignments.map((a: any) => ({
        testTitle: a.test.title,
        date: a.submittedAt?.toISOString().split('T')[0] || '--',
        score: a.score || 0,
        totalMarks: a.test.totalMarks,
        accuracy: a.accuracy || 0,
      }));

      return res.status(200).json({
        success: true,
        data: {
          totalExamsCompleted: assignments.length,
          analyticsEligibleExams: analyticsEligibleExamsCount,
          overallAccuracy: overallAttempted > 0 ? Math.round((overallCorrect / overallAttempted) * 100) : null,
          avgTimePerQuestion: timingResponseCount > 0 ? Math.round(totalTimeSec / timingResponseCount) : null,
          strongTopics: finalStrongTopics,
          weakTopics: finalWeakTopics,
          topicAccuracy: validTopicAccuracy,
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
      const passCount = completed.filter((a: any) => (a.score || 0) >= (test.totalMarks * 0.35)).length;
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
