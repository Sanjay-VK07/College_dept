import { Server, Socket } from 'socket.io';
import { prisma } from '../config/prisma';
import { RiskLevel } from '@prisma/client';

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
  io.on('connection', (socket: Socket) => {
    console.log(`🔌 [Socket.IO] Client connected: ${socket.id}`);

    // Join Faculty Invigilator Room
    socket.on('join_faculty_room', async (data: { testId: string }) => {
      const requestedTestId = data?.testId;
      if (!requestedTestId) return;

      socket.join(`faculty_${requestedTestId}`);

      console.log(`👨‍🏫 [Socket.IO] Faculty joined monitoring room: faculty_${requestedTestId}`);

      try {
        // Query DB for test assignments strictly filtered by examination ID
        const assignments = await prisma.testAssignment.findMany({
          where: requestedTestId !== 'all' ? { testId: requestedTestId } : {},
          include: {
            student: true,
            test: true,
          },
        });

        // Merge DB records with active live socket connections
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

        console.log(`📊 [Socket.IO] Emitting live_students_snapshot with ${snapshot.length} students to faculty_${requestedTestId}`);
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
        studentId: string;
        testId: string;
        registerNo: string;
        name: string;
        department: string;
      }) => {
        console.log(`👨‍🎓 [Socket.IO] Student joined exam: ${data.name} (${data.registerNo}) [Assignment: ${data.assignmentId}]`);

        socket.join(`exam_${data.assignmentId}`);
        socket.join(`test_${data.testId}`);

        try {
          const assignment = await prisma.testAssignment.findUnique({
            where: { id: data.assignmentId },
            include: { test: true },
          });

          const totalSec = assignment?.test?.durationMinutes ? assignment.test.durationMinutes * 60 : 10800;
          const elapsedSec = assignment?.startedAt
            ? Math.floor((Date.now() - new Date(assignment.startedAt).getTime()) / 1000)
            : 0;

          const currentStudent: ConnectedStudent = {
            socketId: socket.id,
            studentId: data.studentId,
            assignmentId: data.assignmentId,
            testId: data.testId,
            registerNo: data.registerNo,
            name: data.name,
            department: data.department,
            currentQuestion: 1,
            remainingSec: Math.max(0, totalSec - elapsedSec),
            violationCount: assignment?.violationCount || 0,
            riskLevel: (assignment?.riskLevel as RiskLevel) || RiskLevel.SAFE,
            status: 'ONLINE',
            lastSeen: new Date(),
          };

          activeStudents.set(data.assignmentId, currentStudent);

          // Broadcast status change to faculty room
          io.to(`faculty_${data.testId}`).emit('student_status_changed', currentStudent);
        } catch (error: any) {
          console.error('❌ [Socket.IO] Error handling student_join_exam:', error.message);
        }
      }
    );

    // Student Heartbeat & Progress Update
    socket.on(
      'student_heartbeat',
      async (data: { assignmentId: string; currentQuestion: number; remainingSec: number }) => {
        const student = activeStudents.get(data.assignmentId);
        if (student) {
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
        console.warn(`🚨 [Socket.IO] Violation logged for assignment ${data.assignmentId}: ${data.violationType}`);

        const student = activeStudents.get(data.assignmentId);
        let violationCount = (student?.violationCount || 0) + 1;
        let riskLevel: RiskLevel = RiskLevel.SAFE;

        if (violationCount >= 4) {
          riskLevel = RiskLevel.HIGH_RISK;
        } else if (violationCount >= 2) {
          riskLevel = RiskLevel.WARNING;
        }

        if (student) {
          student.violationCount = violationCount;
          student.riskLevel = riskLevel;
        }

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

          const test = student ? await prisma.mockTest.findUnique({ where: { id: student.testId } }) : null;
          const maxViolations = test?.maxViolations || 5;

          const violationPayload = {
            assignmentId: data.assignmentId,
            studentName: student?.name || 'Student',
            violationType: data.violationType,
            violationCount,
            riskLevel,
            timestamp: new Date(),
          };

          if (student?.testId) {
            io.to(`faculty_${student.testId}`).emit('student_violation_logged', violationPayload);
          }

          if (violationCount >= maxViolations) {
            console.error(`⛔ [Socket.IO] Max violations reached (${violationCount}/${maxViolations}). Triggering auto submit.`);
            io.to(`exam_${data.assignmentId}`).emit('force_auto_submit', {
              reason: `Maximum violation limit (${maxViolations}) exceeded. Exam automatically submitted.`,
            });
          }
        } catch (error: any) {
          console.error('❌ [Socket.IO] Error handling security_violation_event:', error.message);
        }
      }
    );

    // Student Exam Submission Event
    socket.on('student_submit_exam', (data: { assignmentId: string }) => {
      console.log(`🏁 [Socket.IO] Student submitted exam for assignment: ${data.assignmentId}`);
      const student = activeStudents.get(data.assignmentId);
      if (student) {
        student.status = 'DISCONNECTED';
        io.to(`faculty_${student.testId}`).emit('student_status_changed', student);
      }
    });

    // Faculty sends warning message to student
    socket.on('faculty_send_warning', (data: { assignmentId: string; message: string }) => {
      console.log(`💬 [Socket.IO] Faculty warning sent to assignment ${data.assignmentId}: ${data.message}`);
      io.to(`exam_${data.assignmentId}`).emit('faculty_warning_received', {
        message: data.message,
        timestamp: new Date(),
      });
    });

    // Faculty forces immediate submit for high-risk student
    socket.on('faculty_force_submit', (data: { assignmentId: string; reason: string }) => {
      console.log(`⚡ [Socket.IO] Faculty force submit requested for assignment ${data.assignmentId}`);
      io.to(`exam_${data.assignmentId}`).emit('force_auto_submit', {
        reason: data.reason || 'Invigilator issued remote termination.',
      });
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
