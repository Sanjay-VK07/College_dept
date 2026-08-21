import { Server, Socket } from 'socket.io';
import { prisma } from '../config/prisma';
import { RiskLevel, Role } from '@prisma/client';
import jwt from 'jsonwebtoken';
import { ENV } from '../config/env';
import { AuditLogger } from '../services/auditLogger';
import { GateScoringService } from '../services/gateScoringService';

export interface ConnectedStudent {
  socketId: string;
  studentId: string;
  assignmentId: string;
  testId: string;
  registerNo: string;
  name: string;
  department: string;
  currentQuestion: number;
  remainingSec: number;
  violationCount: number;
  riskLevel: RiskLevel;
  status: 'ONLINE' | 'OFFLINE' | 'DISCONNECTED';
  lastSeen: Date;
}

const activeStudents = new Map<string, ConnectedStudent>();
let globalIo: Server | null = null;

export function setupInvigilatorHub(io: Server) {
  globalIo = io;

  // Middleware to authenticate socket connections via JWT
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (!token) {
      return next(new Error('Authentication error: Token is required'));
    }
    try {
      const decoded = jwt.verify(token, ENV.JWT_SECRET) as any;
      socket.data.user = decoded;
      next();
    } catch (err) {
      return next(new Error('Authentication error: Invalid token'));
    }
  });
  io.on('connection', (socket: Socket) => {
    const user = socket.data.user;
    console.log(`🔌 [Socket.IO] Client connected: ${socket.id} (User: ${user?.email}, Role: ${user?.role})`);

    // Join Faculty Invigilator Room
    socket.on('join_faculty_room', async (data: { testId: string }) => {
      const requestedTestId = data?.testId;
      if (!requestedTestId) return;

      if (!user || (user.role !== Role.FACULTY && user.role !== Role.ADMIN)) {
        console.warn(`🛑 [Socket.IO] Unauthorized join_faculty_room request by user role: ${user?.role}`);
        return;
      }

      if (user.role === Role.FACULTY && requestedTestId !== 'all') {
        const test = await prisma.mockTest.findUnique({
          where: { id: requestedTestId },
          include: { invigilators: { where: { facultyId: user.id } } }
        });
        if (!test || (test.createdById !== user.id && test.invigilators.length === 0)) {
          console.warn(`🛑 [Socket.IO] Faculty user ${user.id} unauthorized to invigilate test ${requestedTestId}`);
          return;
        }
      }

      socket.join(`faculty_${requestedTestId}`);
      console.log(`👨‍🏫 [Socket.IO] Faculty joined monitoring room: faculty_${requestedTestId}`);

      try {
        const assignments = await prisma.testAssignment.findMany({
          where: requestedTestId !== 'all' ? { testId: requestedTestId } : {},
          include: {
            student: true,
            test: true,
          },
        });

        const snapshot: ConnectedStudent[] = assignments.map((a) => {
          const live = activeStudents.get(a.id);
          if (live) {
            return live;
          }

          const durationSec = a.test?.durationMinutes ? a.test.durationMinutes * 60 : 10800;

          return {
            socketId: '',
            studentId: a.studentId,
            assignmentId: a.id,
            testId: a.testId,
            registerNo: a.student.registerNo || 'N/A',
            name: a.student.name,
            department: a.student.department || 'CSE',
            currentQuestion: 1,
            remainingSec: a.timeTakenSec ? Math.max(0, durationSec - a.timeTakenSec) : durationSec,
            violationCount: a.violationCount || 0,
            riskLevel: (a.riskLevel as RiskLevel) || RiskLevel.SAFE,
            status: a.status === 'COMPLETED' ? 'DISCONNECTED' : 'OFFLINE',
            lastSeen: a.submittedAt || a.startedAt || new Date(),
          };
        });

        socket.emit('live_students_snapshot', snapshot);
      } catch (error: any) {
        console.error('❌ [Socket.IO] Error fetching live_students_snapshot:', error.message);
      }
    });

    // Student joins exam session
    socket.on(
      'student_join_exam',
      async (data: {
        assignmentId: string;
        testId: string;
      }) => {
        if (!user || user.role !== Role.STUDENT) {
          console.warn(`🛑 [Socket.IO] Unauthorized student_join_exam request`);
          return;
        }

        try {
          const assignment = await prisma.testAssignment.findUnique({
            where: { id: data.assignmentId },
            include: { test: true, student: true },
          });

          if (!assignment || assignment.studentId !== user.id) {
            console.warn(`🛑 [Socket.IO] Student ${user.id} not authorized for assignment ${data.assignmentId}`);
            return;
          }

          console.log(`👨‍🎓 [Socket.IO] Student joined exam: ${assignment.student.name} [Assignment: ${assignment.id}]`);

          socket.join(`exam_${assignment.id}`);
          socket.join(`test_${assignment.testId}`);

          const totalSec = assignment.test?.durationMinutes ? assignment.test.durationMinutes * 60 : 10800;
          const elapsedSec = assignment.startedAt
            ? Math.floor((Date.now() - new Date(assignment.startedAt).getTime()) / 1000)
            : 0;

          const currentStudent: ConnectedStudent = {
            socketId: socket.id,
            studentId: assignment.studentId,
            assignmentId: assignment.id,
            testId: assignment.testId,
            registerNo: assignment.student.registerNo || 'N/A',
            name: assignment.student.name,
            department: assignment.student.department,
            currentQuestion: 1,
            remainingSec: Math.max(0, totalSec - elapsedSec),
            violationCount: assignment.violationCount || 0,
            riskLevel: (assignment.riskLevel as RiskLevel) || RiskLevel.SAFE,
            status: 'ONLINE',
            lastSeen: new Date(),
          };

          activeStudents.set(assignment.id, currentStudent);
          io.to(`faculty_${assignment.testId}`).emit('student_status_changed', currentStudent);
        } catch (error: any) {
          console.error('❌ [Socket.IO] Error handling student_join_exam:', error.message);
        }
      }
    );

    // Student Heartbeat & Progress Update
    socket.on(
      'student_heartbeat',
      async (data: { assignmentId: string; currentQuestion: number; remainingSec: number }) => {
        if (!user || user.role !== Role.STUDENT) return;

        const student = activeStudents.get(data.assignmentId);
        if (student && student.studentId === user.id) {
          student.currentQuestion = data.currentQuestion;
          student.remainingSec = data.remainingSec;
          student.status = 'ONLINE';
          student.lastSeen = new Date();

          const updatePayload = {
            assignmentId: student.assignmentId,
            currentQuestion: student.currentQuestion,
            remainingSec: student.remainingSec,
            status: student.status,
          };

          io.to(`faculty_${student.testId}`).emit('student_progress_updated', updatePayload);
        }
      }
    );

    // Security Violation Event
    socket.on(
      'security_violation_event',
      async (data: { assignmentId: string; violationType: string; details?: string }) => {
        if (!user || user.role !== Role.STUDENT) return;

        const student = activeStudents.get(data.assignmentId);
        if (!student || student.studentId !== user.id) return;

        let violationCount = student.violationCount + 1;
        let riskLevel: RiskLevel = RiskLevel.SAFE;

        if (violationCount >= 4) {
          riskLevel = RiskLevel.HIGH_RISK;
        } else if (violationCount >= 2) {
          riskLevel = RiskLevel.WARNING;
        }

        student.violationCount = violationCount;
        student.riskLevel = riskLevel;

        try {
          await prisma.violationLog.create({
            data: {
              assignmentId: data.assignmentId,
              type: data.violationType,
              details: data.details || 'Browser security threshold breached',
            },
          });

          await prisma.testAssignment.update({
            where: { id: data.assignmentId },
            data: { violationCount, riskLevel },
          });

          const test = await prisma.mockTest.findUnique({ where: { id: student.testId } });
          const maxViolations = test?.maxViolations || 5;

          const violationPayload = {
            assignmentId: data.assignmentId,
            studentName: student.name,
            violationType: data.violationType,
            violationCount,
            riskLevel,
            timestamp: new Date(),
          };

          io.to(`faculty_${student.testId}`).emit('student_violation_logged', violationPayload);

          if (violationCount >= maxViolations) {
            console.error(`⛔ [Socket.IO] Max violations reached (${violationCount}/${maxViolations}). Triggering force transaction.`);
            await forceSubmitAssignment(data.assignmentId, '127.0.0.1', { id: 'SYSTEM' });
            io.to(`exam_${data.assignmentId}`).emit('force_auto_submit', {
              reason: `Maximum violation limit (${maxViolations}) exceeded. Exam automatically submitted.`,
            });
            
            student.status = 'DISCONNECTED';
            io.to(`faculty_${student.testId}`).emit('student_status_changed', student);
          }
        } catch (error: any) {
          console.error('❌ [Socket.IO] Error handling security_violation_event:', error.message);
        }
      }
    );

    // Student Exam Submission Event
    socket.on('student_submit_exam', (data: { assignmentId: string }) => {
      if (!user || user.role !== Role.STUDENT) return;

      const student = activeStudents.get(data.assignmentId);
      if (student && student.studentId === user.id) {
        student.status = 'DISCONNECTED';
        io.to(`faculty_${student.testId}`).emit('student_status_changed', student);
      }
    });

    // Faculty sends warning message to student
    socket.on('faculty_send_warning', async (data: { assignmentId: string; message: string }) => {
      if (!user || (user.role !== Role.FACULTY && user.role !== Role.ADMIN)) return;

      const assignment = await prisma.testAssignment.findUnique({
        where: { id: data.assignmentId },
        include: { test: { include: { invigilators: { where: { facultyId: user.id } } } } }
      });

      if (!assignment) return;

      if (user.role === Role.FACULTY && assignment.test.createdById !== user.id && assignment.test.invigilators.length === 0) {
        console.warn(`🛑 [Socket.IO] Faculty user ${user.id} unauthorized to warn student in test ${assignment.testId}`);
        return;
      }

      console.log(`💬 [Socket.IO] Faculty warning sent to assignment ${data.assignmentId}: ${data.message}`);
      io.to(`exam_${data.assignmentId}`).emit('faculty_warning_received', {
        message: data.message,
        timestamp: new Date(),
      });
    });

    // Faculty forces immediate submit for high-risk student
    socket.on('faculty_force_submit', async (data: { assignmentId: string; reason: string }) => {
      if (!user || (user.role !== Role.FACULTY && user.role !== Role.ADMIN)) return;

      const assignment = await prisma.testAssignment.findUnique({
        where: { id: data.assignmentId },
        include: { test: { include: { invigilators: { where: { facultyId: user.id } } } } }
      });

      if (!assignment) return;

      if (user.role === Role.FACULTY && assignment.test.createdById !== user.id && assignment.test.invigilators.length === 0) {
        console.warn(`🛑 [Socket.IO] Faculty user ${user.id} unauthorized to force submit assignment ${data.assignmentId}`);
        return;
      }

      try {
        console.log(`⚡ [Socket.IO] Faculty force submit executing transaction for assignment ${data.assignmentId}`);
        await forceSubmitAssignment(data.assignmentId, '127.0.0.1', user);
        
        io.to(`exam_${data.assignmentId}`).emit('force_auto_submit', {
          reason: data.reason || 'Invigilator issued remote termination.',
        });

        const student = activeStudents.get(data.assignmentId);
        if (student) {
          student.status = 'DISCONNECTED';
          io.to(`faculty_${student.testId}`).emit('student_status_changed', student);
        }
      } catch (error: any) {
        console.error('❌ [Socket.IO] Error executing force submission:', error.message);
      }
    });

    socket.on('disconnect', () => {
      console.log(`🔌 [Socket.IO] Client disconnected: ${socket.id}`);
      for (const [assignmentId, student] of activeStudents.entries()) {
        if (student.socketId === socket.id) {
          student.status = 'DISCONNECTED';
          io.to(`faculty_${student.testId}`).emit('student_status_changed', student);
          break;
        }
      }
    });
  });
}

export function broadcastNotification(notif: any) {
  if (globalIo) {
    globalIo.emit('new_notification', notif);
  }
}

async function forceSubmitAssignment(assignmentId: string, ipAddress: string, triggerUser: any) {
  return await prisma.$transaction(async (tx) => {
    const assignment = await tx.testAssignment.findUnique({
      where: { id: assignmentId },
      include: {
        test: {
          include: {
            testQuestions: {
              include: { question: true },
            },
          },
        },
        responses: true,
      },
    });

    if (!assignment) {
      throw new Error('Assignment not found');
    }

    let totalScore = 0;
    let totalAttempted = 0;
    let totalCorrect = 0;

    const responseMap = new Map();
    assignment.responses.forEach(r => responseMap.set(r.questionId, r));

    for (const tq of assignment.test.testQuestions) {
      const q = tq.question;
      const studentResp = responseMap.get(q.id);
      const chosenAnswer = studentResp ? studentResp.chosenAnswer : null;

      if (chosenAnswer !== null && chosenAnswer !== undefined && chosenAnswer !== '') {
        totalAttempted++;
        const evaluation = GateScoringService.evaluateResponse(
          {
            id: q.id,
            type: q.type,
            marks: q.marks,
            negativeMarks: q.negativeMarks,
            correctAnswer: q.correctAnswer,
          },
          chosenAnswer
        );

        totalScore += evaluation.marksObtained;
        if (evaluation.isCorrect) totalCorrect++;

        if (studentResp) {
          await tx.questionResponse.update({
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

    const updated = await tx.testAssignment.update({
      where: { id: assignmentId },
      data: {
        status: 'COMPLETED',
        score: finalScore,
        totalMarks: assignment.test.totalMarks,
        accuracy,
        timeTakenSec,
        submittedAt: new Date(),
      },
    });

    await tx.auditLog.create({
      data: {
        userId: triggerUser.id === 'SYSTEM' ? null : triggerUser.id,
        action: 'FORCE_SUBMIT',
        resource: 'TestAssignment',
        details: `Invigilator force-submitted assignment ${assignmentId} for student ${assignment.studentId}`,
        ipAddress: ipAddress,
      }
    });

    return updated;
  });
}
