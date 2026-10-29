import { Response } from 'express';
import { AuthRequest } from '../middlewares/authMiddleware';
import { prisma } from '../config/prisma';
import { GateScoringService } from '../services/gateScoringService';
import { AuditLogger } from '../services/auditLogger';

export class ExamController {
  /**
   * Whether a student is currently allowed to see their own result (score/accuracy/correctness)
   * for an exam, per that exam's configured resultVisibility. This gates the student-facing
   * surfaces only — Faculty/Admin review is never subject to this check.
   */
  private static canStudentSeeResult(test: { resultVisibility: string; endTime: Date | string; resultsPublished: boolean; status?: string }): boolean {
    switch (test.resultVisibility) {
      case 'IMMEDIATE':
        return true;
      case 'AFTER_EXAM_ENDS':
        return Boolean(test.resultsPublished) || test.status === 'COMPLETED' || test.status === 'ARCHIVED' || new Date() >= new Date(test.endTime);
      case 'MANUAL_PUBLISH':
        return Boolean(test.resultsPublished);
      default:
        return true;
    }
  }

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

      // Attach correct/wrong counts and drop the raw response rows from the payload. A
      // finished attempt's outcome (score/accuracy/correct-wrong counts) is only included once
      // that exam's resultVisibility condition is actually met — the assignment/status itself
      // ("you submitted") is never hidden, only the mark.
      const assignmentsWithCounts = assignments.map(({ responses, ...assignment }) => {
        const finished = assignment.status === 'COMPLETED' || assignment.status === 'AUTO_SUBMITTED';
        const resultVisible = !finished || ExamController.canStudentSeeResult(assignment.test);

        if (finished && !resultVisible) {
          return {
            ...assignment,
            score: null,
            accuracy: null,
            correctCount: 0,
            wrongCount: 0,
            resultVisible: false,
          };
        }

        return {
          ...assignment,
          correctCount: responses.filter((r) => r.isCorrect).length,
          wrongCount: responses.filter((r) => !r.isCorrect).length,
          resultVisible: true,
        };
      });

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

      // Fetch test details & question paper first — every eligibility check below runs before
      // any TestAssignment row is touched, so a rejected start never leaves a stray IN_PROGRESS
      // attempt behind.
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

      if (!test.isPublished) {
        return res.status(403).json({ success: false, message: 'This examination has not been published yet.' });
      }

      const now = new Date();
      if (now < new Date(test.startTime)) {
        return res.status(403).json({
          success: false,
          message: `This examination has not started yet. It opens at ${new Date(test.startTime).toISOString()}.`,
        });
      }
      if (now > new Date(test.endTime)) {
        return res.status(403).json({
          success: false,
          message: 'This examination window has closed. It can no longer be started or continued.',
        });
      }

      // Authorization: the same department-eligibility rule getStudentTests uses to decide which
      // published exams a student is even shown — enforced again here so a student can't start
      // an exam outside their eligibility just by knowing/guessing its ID.
      const student = await prisma.user.findUnique({ where: { id: studentId }, select: { department: true } });
      const eligibleDepartments = [
        student?.department,
        'ALL',
        'Computer Science & Engineering',
        'Computer Science and Engineering',
        'CSE',
      ];
      if (!eligibleDepartments.includes(test.targetDepartment)) {
        return res.status(403).json({ success: false, message: 'You are not eligible to take this examination.' });
      }

      let assignment = await prisma.testAssignment.findFirst({
        where: { testId, studentId },
      });

      if (assignment && (assignment.status === 'COMPLETED' || assignment.status === 'AUTO_SUBMITTED')) {
        return res.status(403).json({
          success: false,
          message: 'You have already submitted this examination. It cannot be started again.',
        });
      }

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
          customId: q.customId,
          verificationStatus: q.verificationStatus,
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
          sourcePage: q.sourcePage,
          sourceChapter: q.sourceChapter,
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
        const alreadyVisible = ExamController.canStudentSeeResult(assignment.test);
        return res.status(200).json({
          success: true,
          message: 'Exam was already submitted.',
          data: {
            assignmentId,
            score: alreadyVisible ? assignment.score : null,
            totalMarks: assignment.totalMarks,
            accuracy: alreadyVisible ? assignment.accuracy : null,
            timeTakenSec: assignment.timeTakenSec,
            resultVisible: alreadyVisible,
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

        const isAttempted =
          chosenAnswer !== null &&
          chosenAnswer !== undefined &&
          chosenAnswer !== '' &&
          (!Array.isArray(chosenAnswer) || chosenAnswer.length > 0);

        if (isAttempted) {
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

      // The attempt is fully recorded and evaluated above regardless of visibility — only the
      // response returned to the student is gated. Per-question results are read through
      // buildSolutionReview()/getSolutionReview, which applies the same gate.
      const resultVisible = ExamController.canStudentSeeResult(assignment.test);

      return res.status(200).json({
        success: true,
        message: 'Exam submitted successfully',
        data: {
          assignmentId,
          score: resultVisible ? finalScore : null,
          totalMarks: assignment.test.totalMarks,
          accuracy: resultVisible ? Number(accuracy.toFixed(1)) : null,
          timeTakenSec,
          totalCorrect: resultVisible ? totalCorrect : undefined,
          totalAttempted,
          resultVisibility: assignment.test.resultVisibility,
          resultVisible,
        },
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Solution Review Endpoint
   */
  /**
   * Shared core for both the student-facing solution review and the faculty/admin per-student
   * drill-down — same frozen-snapshot join, same response mapping. `forceShowAnswerKey` bypasses
   * the exam's student-facing solutionVisibility gate (faculty/admin should always see the real
   * answer key; students are still gated by the exam's configured visibility).
   */
  private static async buildSolutionReview(assignmentId: string, forceShowAnswerKey: boolean) {
    const assignment = await prisma.testAssignment.findUnique({
      where: { id: assignmentId },
      include: {
        student: { select: { id: true, name: true, registerNo: true, email: true } },
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
      return null;
    }

    const responseMap = new Map();
    assignment.responses.forEach(r => responseMap.set(r.questionId, r));

    // Solutions/answer keys are gated by the exam's configured solutionVisibility for students —
    // faculty/admin always see the real answer key regardless of that setting.
    const visibility = assignment.test.solutionVisibility;
    const isResultReleased = assignment.test.resultsPublished || ExamController.canStudentSeeResult(assignment.test);
    const canSeeAnswerKey =
      forceShowAnswerKey ||
      isResultReleased ||
      visibility === 'SHOW_ALWAYS' ||
      visibility === 'SHOW_AFTER_RESULT' ||
      (visibility === 'SHOW_AFTER_EXAM_ENDS' && new Date() >= new Date(assignment.test.endTime));

    let totalScore = 0;
    let attemptedCount = 0;
    let correctCount = 0;
    let wrongCount = 0;

    const solutions = assignment.test.testQuestions.map(tq => {
      const q = tq.question;
      // Review must agree with what was actually scored — read from the same frozen snapshot
      // submitExam graded against, not whatever the live Question row says today.
      const graded = tq.questionVersion || q;
      const resp = responseMap.get(q.id);
      const chosenAnswer = resp ? resp.chosenAnswer : null;

      let isCorrect = resp ? resp.isCorrect : false;
      let marksObtained = resp ? resp.marksObtained : 0;

      const isAttempted =
        chosenAnswer !== null &&
        chosenAnswer !== undefined &&
        chosenAnswer !== '' &&
        (!Array.isArray(chosenAnswer) || chosenAnswer.length > 0);

      if (isAttempted) {
        attemptedCount++;
        const evalRes = GateScoringService.evaluateResponse(
          {
            id: q.id,
            type: graded.type,
            marks: graded.marks,
            negativeMarks: graded.negativeMarks,
            correctAnswer: graded.correctAnswer,
          },
          chosenAnswer
        );
        isCorrect = evalRes.isCorrect;
        marksObtained = evalRes.marksObtained;
        totalScore += marksObtained;
        if (isCorrect) correctCount++;
        else wrongCount++;
      }

      return {
        id: q.id,
        customId: q.customId,
        order: tq.order,
        text: graded.text,
        type: graded.type,
        difficulty: graded.difficulty,
        marks: graded.marks,
        negativeMarks: graded.negativeMarks,
        options: graded.options,
        imageUrl: graded.imageUrl || q.imageUrl,
        correctAnswer: canSeeAnswerKey ? graded.correctAnswer : undefined,
        chosenAnswer,
        isCorrect,
        marksObtained,
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

    const totalQuestions = assignment.test.testQuestions.length;
    const unansweredCount = Math.max(0, totalQuestions - attemptedCount);
    const finalScore = Math.max(0, Number(totalScore.toFixed(2)));
    const calculatedAccuracy = attemptedCount > 0 ? Number(((correctCount / attemptedCount) * 100).toFixed(1)) : 0;
    const resolvedScore = assignment.score !== null ? (assignment.score === 0 && finalScore > 0 ? finalScore : assignment.score) : finalScore;
    const resolvedAccuracy = assignment.accuracy !== null ? (assignment.accuracy === 0 && calculatedAccuracy > 0 ? calculatedAccuracy : assignment.accuracy) : calculatedAccuracy;

    return {
      assignment,
      testTitle: assignment.test.title,
      student: assignment.student,
      score: resolvedScore,
      totalMarks: assignment.test.totalMarks,
      accuracy: resolvedAccuracy,
      timeTakenSec: assignment.timeTakenSec,
      totalQuestions,
      attemptedCount,
      correctCount,
      wrongCount,
      unansweredCount,
      solutions,
    };
  }

  public static async getSolutionReview(req: AuthRequest, res: Response) {
    try {
      const { assignmentId } = req.params;
      const studentId = req.user!.id;

      const assignment = await prisma.testAssignment.findUnique({ where: { id: assignmentId }, include: { test: true } });
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

      // resultVisibility gates the student's own review of their result. This is enforced here
      // (the API), not just hidden in a UI — a direct call to this endpoint is blocked exactly
      // the same as the rendered page would be. Faculty/Admin never hit this branch; they use
      // the dedicated staff drill-down (getAssignmentSolutionForStaff), which always shows results.
      if (req.user!.role === 'STUDENT' && !ExamController.canStudentSeeResult(assignment.test)) {
        return res.status(403).json({
          success: false,
          code: 'RESULT_NOT_YET_VISIBLE',
          message: 'Results for this examination are not yet available. Please check back once they are released.',
          data: {
            assignmentId: assignment.id,
            testTitle: assignment.test.title,
            resultVisibility: assignment.test.resultVisibility,
            resultsPublished: assignment.test.resultsPublished,
            releaseDate: assignment.test.resultVisibility === 'AFTER_EXAM_ENDS' ? assignment.test.endTime : null,
            submittedAt: assignment.submittedAt,
            status: assignment.status,
            totalMarks: assignment.test.totalMarks,
          },
        });
      }

      const review = await ExamController.buildSolutionReview(assignmentId, false);
      if (!review) {
        return res.status(404).json({ success: false, message: 'Assignment not found' });
      }

      return res.status(200).json({
        success: true,
        data: {
          testTitle: review.testTitle,
          score: review.score,
          totalMarks: review.totalMarks,
          accuracy: review.accuracy,
          timeTakenSec: review.timeTakenSec,
          totalQuestions: review.totalQuestions,
          attemptedCount: review.attemptedCount,
          correctCount: review.correctCount,
          wrongCount: review.wrongCount,
          unansweredCount: review.unansweredCount,
          solutions: review.solutions,
        },
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * GET /admin/assignments/:assignmentId/solution — faculty/admin drill-down into one student's
   * exam attempt. Faculty may only view attempts on exams they created or invigilate; Admin is
   * unrestricted. Always shows the real answer key regardless of the exam's student-facing
   * solutionVisibility setting.
   */
  public static async getAssignmentSolutionForStaff(req: AuthRequest, res: Response) {
    try {
      const { assignmentId } = req.params;

      const assignment = await prisma.testAssignment.findUnique({
        where: { id: assignmentId },
        include: { test: { include: { invigilators: { where: { facultyId: req.user!.id } } } } },
      });
      if (!assignment) {
        return res.status(404).json({ success: false, message: 'Assignment not found' });
      }

      if (req.user!.role === 'FACULTY' && assignment.test.createdById !== req.user!.id && assignment.test.invigilators.length === 0) {
        return res.status(403).json({ success: false, message: 'Forbidden: You do not own or invigilate this examination.' });
      }

      if (assignment.status !== 'COMPLETED' && assignment.status !== 'AUTO_SUBMITTED') {
        return res.status(400).json({ success: false, message: 'This student has not completed the examination yet.' });
      }

      const review = await ExamController.buildSolutionReview(assignmentId, true);
      if (!review) {
        return res.status(404).json({ success: false, message: 'Assignment not found' });
      }

      return res.status(200).json({
        success: true,
        data: {
          testTitle: review.testTitle,
          student: review.student,
          score: review.score,
          totalMarks: review.totalMarks,
          accuracy: review.accuracy,
          timeTakenSec: review.timeTakenSec,
          totalQuestions: review.totalQuestions,
          attemptedCount: review.attemptedCount,
          correctCount: review.correctCount,
          wrongCount: review.wrongCount,
          unansweredCount: review.unansweredCount,
          startedAt: review.assignment.startedAt,
          submittedAt: review.assignment.submittedAt,
          solutions: review.solutions,
        },
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }
}
