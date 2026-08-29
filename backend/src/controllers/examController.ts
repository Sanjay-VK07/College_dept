import { Response } from 'express';
import { AuthRequest } from '../middlewares/authMiddleware';
import { prisma } from '../config/prisma';
import { GateScoringService } from '../services/gateScoringService';
import { AuditLogger } from '../services/auditLogger';

export class ExamController {
  /**
   * Get student's assigned tests (Upcoming, Active, Completed)
   */
  public static async getStudentTests(req: AuthRequest, res: Response) {
    try {
      const studentId = req.user!.id;

      // 1. Fetch authenticated student profile to obtain department
      const student = await prisma.user.findUnique({
        where: { id: studentId },
        select: { id: true, department: true },
      });

      if (student) {
        // 2. Query published MockTest records applicable to student's department or ALL
        const applicableTests = await prisma.mockTest.findMany({
          where: {
            isPublished: true,
            OR: [
              { targetDepartment: student.department },
              { targetDepartment: 'ALL' },
              { targetDepartment: 'Computer Science & Engineering' },
              { targetDepartment: 'Computer Science and Engineering' },
              { targetDepartment: 'CSE' },
            ],
          },
        });

        // 3. Ensure an assignment exists for each published departmental test (idempotent)
        for (const test of applicableTests) {
          const existingAssignment = await prisma.testAssignment.findFirst({
            where: { testId: test.id, studentId },
          });

          if (!existingAssignment) {
            try {
              await prisma.testAssignment.create({
                data: {
                  testId: test.id,
                  studentId,
                  status: 'SCHEDULED',
                },
              });
            } catch (err) {
              // Ignore potential concurrent creation race condition
            }
          }
        }
      }

      // 4. Query all test assignments strictly belonging to authenticated studentId
      const assignments = await prisma.testAssignment.findMany({
        where: { studentId },
        include: {
          test: {
            include: {
              createdBy: {
                select: { name: true, department: true },
              },
            },
          },
          responses: {
            where: { status: { in: ['ANSWERED', 'ANSWERED_AND_MARKED'] } },
            select: { isCorrect: true },
          },
        },
        orderBy: { test: { startTime: 'desc' } },
      });

      // Attach correct/wrong counts and drop the raw response rows from the payload
      const assignmentsWithCounts = assignments.map(({ responses, ...assignment }) => ({
        ...assignment,
        correctCount: responses.filter((r) => r.isCorrect).length,
        wrongCount: responses.filter((r) => !r.isCorrect).length,
      }));

      return res.status(200).json({ success: true, data: assignmentsWithCounts });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Start Exam Session & Fetch Question Paper
   */
  public static async startExam(req: AuthRequest, res: Response) {
    try {
      const { testId } = req.params;
      const studentId = req.user!.id;

      let assignment = await prisma.testAssignment.findFirst({
        where: { testId, studentId },
      });

      if (!assignment) {
        assignment = await prisma.testAssignment.create({
          data: {
            testId,
            studentId,
            status: 'IN_PROGRESS',
            startedAt: new Date(),
          },
        });
      } else if (assignment.status === 'SCHEDULED') {
        assignment = await prisma.testAssignment.update({
          where: { id: assignment.id },
          data: { status: 'IN_PROGRESS', startedAt: new Date() },
        });
      }

      // Audit Log for Exam Start
      await AuditLogger.log({
        userId: studentId,
        action: 'EXAM_STARTED',
        resource: 'TestAssignment',
        details: `Student started examination (Assignment ID: ${assignment.id})`,
        ipAddress: req.ip,
      });

      // Fetch test details & question paper
      const test = await prisma.mockTest.findUnique({
        where: { id: testId },
        include: {
          testQuestions: {
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
            orderBy: { order: 'asc' },
          },
        },
      });

      if (!test) {
        return res.status(404).json({ success: false, message: 'Mock Test not found' });
      }

      // Fetch existing saved responses for session recovery
      const existingResponses = await prisma.questionResponse.findMany({
        where: { assignmentId: assignment.id },
      });

      const responseMap = new Map();
      existingResponses.forEach(r => responseMap.set(r.questionId, r));

      // Sanitize question paper (hide correct answers during live exam)
      const questions = test.testQuestions.map(tq => {
        const q = tq.question;
        const savedResp = responseMap.get(q.id);

        return {
          id: q.id,
          order: tq.order,
          text: q.text,
          type: q.type,
          difficulty: q.difficulty,
          marks: q.marks,
          negativeMarks: q.negativeMarks,
          options: q.options,
          imageUrl: q.imageUrl,
          subject: q.subtopic.topic.module.subject.name,
          module: q.subtopic.topic.module.name,
          topic: q.subtopic.topic.name,
          subtopic: q.subtopic.name,
          savedAnswer: savedResp ? savedResp.chosenAnswer : null,
          status: savedResp ? savedResp.status : 'NOT_VISITED',
        };
      });

      // Calculate server-side remaining time
      const elapsedSec = Math.floor((Date.now() - new Date(assignment.startedAt || Date.now()).getTime()) / 1000);
      const totalAllowedSec = test.durationMinutes * 60;
      const remainingSec = Math.max(0, totalAllowedSec - elapsedSec);

      return res.status(200).json({
        success: true,
        data: {
          assignmentId: assignment.id,
          test: {
            id: test.id,
            title: test.title,
            description: test.description,
            durationMinutes: test.durationMinutes,
            totalMarks: test.totalMarks,
            instructions: test.instructions,
            maxViolations: test.maxViolations,
          },
          remainingSec,
          questions,
        },
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Multi-trigger Autosave Endpoint
   */
  public static async autoSaveResponse(req: AuthRequest, res: Response) {
    try {
      const { assignmentId, questionId, chosenAnswer, status, timeSpentSec } = req.body;

      if (!assignmentId || !questionId) {
        return res.status(400).json({ success: false, message: 'Assignment ID and Question ID required' });
      }

      await prisma.questionResponse.upsert({
        where: {
          assignmentId_questionId: {
            assignmentId,
            questionId,
          },
        },
        update: {
          chosenAnswer,
          status: status || 'ANSWERED',
          timeSpentSec: { increment: timeSpentSec || 0 },
        },
        create: {
          assignmentId,
          questionId,
          chosenAnswer,
          status: status || 'ANSWERED',
          timeSpentSec: timeSpentSec || 0,
        },
      });

      return res.status(200).json({ success: true, message: 'Response saved' });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Submit Exam & Compute GATE Official Scoring
   */
  public static async submitExam(req: AuthRequest, res: Response) {
    try {
      const { assignmentId } = req.body;

      const assignment = await prisma.testAssignment.findUnique({
        where: { id: assignmentId },
        include: {
          test: {
            include: {
              testQuestions: {
                include: { question: true, questionVersion: true },
              },
            },
          },
          responses: true,
        },
      });

      if (!assignment) {
        return res.status(404).json({ success: false, message: 'Assignment not found' });
      }

      // Submission must be a one-time transition. Without this guard, a retried/duplicated
      // request re-scores and overwrites an already-final result (confirmed live: a second call
      // silently recomputed timeTakenSec and returned 200 again with no error).
      if (assignment.status === 'COMPLETED' || assignment.status === 'AUTO_SUBMITTED') {
        return res.status(200).json({
          success: true,
          message: 'Exam was already submitted.',
          data: {
            assignmentId,
            score: assignment.score,
            totalMarks: assignment.totalMarks,
            accuracy: assignment.accuracy,
            timeTakenSec: assignment.timeTakenSec,
          },
        });
      }

      let totalScore = 0;
      let totalAttempted = 0;
      let totalCorrect = 0;

      const responseMap = new Map();
      assignment.responses.forEach(r => responseMap.set(r.questionId, r));

      for (const tq of assignment.test.testQuestions) {
        const q = tq.question;
        // Score against the frozen snapshot taken when this question was attached to the exam,
        // not the live Question row — an edit or AI-solution approval after attach must never
        // retroactively change what an in-progress/completed exam is graded against.
        const graded = tq.questionVersion || q;
        const studentResp = responseMap.get(q.id);
        const chosenAnswer = studentResp ? studentResp.chosenAnswer : null;

        if (chosenAnswer !== null && chosenAnswer !== undefined && chosenAnswer !== '') {
          totalAttempted++;
          const evaluation = GateScoringService.evaluateResponse(
            {
              id: q.id,
              type: graded.type,
              marks: graded.marks,
              negativeMarks: graded.negativeMarks,
              correctAnswer: graded.correctAnswer,
            },
            chosenAnswer
          );

          totalScore += evaluation.marksObtained;
          if (evaluation.isCorrect) totalCorrect++;

          if (studentResp) {
            await prisma.questionResponse.update({
              where: { id: studentResp.id },
              data: {
                isCorrect: evaluation.isCorrect,
                marksObtained: evaluation.marksObtained,
              },
            });
          }
        }
      }

      const finalScore = Math.max(0, Number(totalScore.toFixed(2)));
      const accuracy = totalAttempted > 0 ? (totalCorrect / totalAttempted) * 100 : 0;
      const timeTakenSec = Math.floor((Date.now() - new Date(assignment.startedAt || Date.now()).getTime()) / 1000);

      await prisma.testAssignment.update({
        where: { id: assignmentId },
        data: {
          status: 'COMPLETED',
          score: finalScore,
          totalMarks: assignment.test.totalMarks,
          accuracy: Number(accuracy.toFixed(1)),
          timeTakenSec,
          submittedAt: new Date(),
        },
      });

      await AuditLogger.log({
        userId: req.user?.id,
        action: 'EXAM_SUBMITTED',
        resource: 'TestAssignment',
        details: `Exam submitted. Score: ${finalScore}/${assignment.test.totalMarks}`,
        ipAddress: req.ip,
      });

      return res.status(200).json({
        success: true,
        message: 'Exam submitted successfully',
        data: {
          assignmentId,
          score: finalScore,
          totalMarks: assignment.test.totalMarks,
          accuracy: Number(accuracy.toFixed(1)),
          timeTakenSec,
          totalCorrect,
          totalAttempted,
          resultVisibility: assignment.test.resultVisibility,
        },
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Solution Review Endpoint
   */
  public static async getSolutionReview(req: AuthRequest, res: Response) {
    try {
      const { assignmentId } = req.params;
      const studentId = req.user!.id;

      const assignment = await prisma.testAssignment.findUnique({
        where: { id: assignmentId },
        include: {
          test: {
            include: {
              testQuestions: {
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
                  questionVersion: true,
                },
                orderBy: { order: 'asc' },
              },
            },
          },
          responses: true,
        },
      });

      if (!assignment) {
        return res.status(404).json({ success: false, message: 'Assignment not found' });
      }

      if (req.user!.role === 'STUDENT' && assignment.studentId !== studentId) {
        return res.status(403).json({
          success: false,
          message: '403 Forbidden: Student Privacy Policy strictly prohibits viewing other students metrics.',
        });
      }

      if (assignment.status !== 'COMPLETED' && assignment.status !== 'AUTO_SUBMITTED') {
        return res.status(403).json({
          success: false,
          message: 'Solution review is only available after completing or submitting the examination.',
        });
      }

      const responseMap = new Map();
      assignment.responses.forEach(r => responseMap.set(r.questionId, r));

      // Solutions/answer keys are gated by the exam's configured solutionVisibility — this
      // endpoint previously ignored that setting entirely and always exposed the correct answer
      // and explanation to any student who'd completed the exam, even when faculty had
      // explicitly set HIDE_SOLUTIONS. Admin/Faculty callers (not this student-only route) are
      // unaffected — they have their own authorization path.
      const visibility = assignment.test.solutionVisibility;
      const canSeeAnswerKey =
        visibility === 'SHOW_ALWAYS' ||
        visibility === 'SHOW_AFTER_RESULT' ||
        (visibility === 'SHOW_AFTER_EXAM_ENDS' && new Date() >= new Date(assignment.test.endTime));

      const solutions = assignment.test.testQuestions.map(tq => {
        const q = tq.question;
        // Review must agree with what was actually scored — read from the same frozen snapshot
        // submitExam graded against, not whatever the live Question row says today.
        const graded = tq.questionVersion || q;
        const resp = responseMap.get(q.id);

        return {
          id: q.id,
          order: tq.order,
          text: graded.text,
          type: graded.type,
          difficulty: graded.difficulty,
          marks: graded.marks,
          negativeMarks: graded.negativeMarks,
          options: graded.options,
          correctAnswer: canSeeAnswerKey ? graded.correctAnswer : undefined,
          chosenAnswer: resp ? resp.chosenAnswer : null,
          isCorrect: resp ? resp.isCorrect : false,
          marksObtained: resp ? resp.marksObtained : 0,
          timeSpentSec: resp ? resp.timeSpentSec : 0,
          explanation: canSeeAnswerKey ? graded.explanation : undefined,
          reference: q.reference,
          previousYear: q.previousYear,
          subject: q.subtopic.topic.module.subject.name,
          module: q.subtopic.topic.module.name,
          topic: q.subtopic.topic.name,
          subtopic: q.subtopic.name,
        };
      });

      return res.status(200).json({
        success: true,
        data: {
          testTitle: assignment.test.title,
          score: assignment.score,
          totalMarks: assignment.test.totalMarks,
          accuracy: assignment.accuracy,
          timeTakenSec: assignment.timeTakenSec,
          solutions,
        },
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }
}
