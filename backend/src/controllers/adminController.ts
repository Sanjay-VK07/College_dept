import { Response } from 'express';
import { AuthRequest } from '../middlewares/authMiddleware';
import { prisma } from '../config/prisma';
import { ExcelImportService } from '../services/excelImportService';
import { ReportExportService } from '../services/reportExportService';
import { StudentDataExportService } from '../services/studentDataExportService';
import { AuditLogger } from '../services/auditLogger';
import { Role, QuestionType, Difficulty, ExamType, ExamStatus, AIDocumentStatus } from '@prisma/client';
import { ENV } from '../config/env';
import { NotificationController } from './notificationController';
import { LocalStorageProvider } from '../modules/ai/services/documentStorageService';
import { PDFQuestionImportService } from '../modules/ai/services/pdfQuestionImportService';
import { QuestionVersionService } from '../services/questionVersionService';
import { EmbeddingProvider } from '../modules/ai/services/embeddingProvider';
import { DepartmentService } from '../services/departmentService';

export class AdminController {
  /**
   * Overall Institutional Dashboard Overview & Real System Metrics
   */
  public static async getOverviewStats(req: AuthRequest, res: Response) {
    try {
      const now = new Date();
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

      if (req.user!.role === Role.FACULTY) {
        const userId = req.user!.id;
        
        // Scope to exams created by or assigned to this faculty member
        const facultyExams = await prisma.mockTest.findMany({
          where: {
            OR: [
              { createdById: userId },
              { invigilators: { some: { facultyId: userId } } }
            ]
          },
          select: { id: true, startTime: true, endTime: true, status: true, title: true }
        });
        
        const examIds = facultyExams.map(e => e.id);
        
        const assignedCount = facultyExams.length;
        const upcomingCount = facultyExams.filter(e => e.status === 'SCHEDULED' || e.status === 'PUBLISHED').length;
        const liveCount = facultyExams.filter(e => e.status === 'LIVE').length;
        const completedCount = facultyExams.filter(e => e.status === 'COMPLETED' || e.status === 'ARCHIVED').length;
        
        const [
          totalQuestions,
          totalCandidates,
          pendingEvaluations,
          attendancePresent,
          attendanceTotal,
          recentLogs,
        ] = await Promise.all([
          prisma.question.count({ where: { createdById: userId } }),
          prisma.testAssignment.count({ where: { testId: { in: examIds } } }),
          prisma.testAssignment.count({ where: { testId: { in: examIds }, status: 'COMPLETED' } }),
          prisma.testAssignment.count({ where: { testId: { in: examIds }, startedAt: { not: null } } }),
          prisma.testAssignment.count({ where: { testId: { in: examIds } } }),
          prisma.auditLog.findMany({
            where: {
              OR: [
                { userId },
                { details: { contains: userId } },
                { resource: 'MockTest', details: { contains: 'exam' } }
              ]
            },
            take: 10,
            orderBy: { timestamp: 'desc' },
            include: {
              user: { select: { name: true, registerNo: true, role: true } }
            }
          })
        ]);

        const recentActivities = recentLogs.map((log) => ({
          id: log.id,
          text: log.details || `${log.action} performed on ${log.resource}`,
          time: log.timestamp.toISOString(),
          user: log.user?.name || 'System',
          action: log.action,
        }));

        const notifications = recentLogs.slice(0, 4).map((log) => ({
          id: log.id,
          text: log.details || `${log.action}: ${log.resource}`,
          badge: log.action.includes('EXAM') ? 'EXAM' : log.action.includes('USER') ? 'USER' : 'SYSTEM',
          time: log.timestamp.toISOString(),
        }));

        return res.status(200).json({
          success: true,
          data: {
            metrics: {
              assignedExams: assignedCount,
              upcomingExams: upcomingCount,
              liveExams: liveCount,
              completedExams: completedCount,
              questionBank: totalQuestions,
              students: totalCandidates,
              pendingEvaluations,
              attendanceRate: attendanceTotal > 0 ? Math.round((attendancePresent / attendanceTotal) * 100) : 0,
              databaseStatus: 'CONNECTED',
              socketStatus: 'ACTIVE',
              serverHealth: 'HEALTHY',
            },
            recentActivities,
            notifications,
          }
        });
      }

      // Perform database queries in controlled small batches (max 3 concurrent queries) to prevent connection pool starvation
      const [totalStudents, totalFaculty, totalQuestions] = await Promise.all([
        prisma.user.count({ where: { role: Role.STUDENT } }),
        prisma.user.count({ where: { role: Role.FACULTY } }),
        prisma.question.count(),
      ]);

      const [totalExams, activeExams, todaysExamsCount] = await Promise.all([
        prisma.mockTest.count(),
        prisma.mockTest.count({ where: { isPublished: true } }),
        prisma.mockTest.count({
          where: {
            startTime: { gte: startOfDay, lte: endOfDay },
          },
        }),
      ]);

      const [pendingApprovalsCount, completedAssignments, activeSessions] = await Promise.all([
        prisma.mockTest.count({ where: { isPublished: false } }),
        prisma.testAssignment.count({ where: { status: 'COMPLETED' } }),
        prisma.testAssignment.count({ where: { status: 'IN_PROGRESS' } }),
      ]);

      const [deptCounts, difficultyCounts, recentLogs] = await Promise.all([
        prisma.user.groupBy({
          by: ['department'],
          where: { role: Role.STUDENT },
          _count: { id: true },
        }),
        prisma.question.groupBy({
          by: ['difficulty'],
          _count: { id: true },
        }),
        prisma.auditLog.findMany({
          take: 10,
          orderBy: { timestamp: 'desc' },
          include: {
            user: { select: { name: true, registerNo: true, role: true } },
          },
        }),
      ]);

      const [todaysExamsList, pendingStudentVerifications] = await Promise.all([
        prisma.mockTest.findMany({
          take: 5,
          where: { isPublished: true },
          orderBy: { startTime: 'desc' },
          include: {
            createdBy: { select: { name: true, department: true } },
            _count: { select: { assignments: true } },
          },
        }),
        prisma.user.count({ where: { role: Role.STUDENT, registerNo: null } }),
      ]);

      // Check DB Connection Status
      let isDbConnected = true;
      try {
        await prisma.$queryRaw`SELECT 1`;
      } catch (e) {
        isDbConnected = false;
      }

      const settings = await prisma.systemSetting.findMany();
      const domainSetting = settings.find((s) => s.key === 'ALLOWED_EMAIL_DOMAINS');

      // Map real activities
      const recentActivities = recentLogs.map((log) => ({
        id: log.id,
        text: log.details || `${log.action} performed on ${log.resource}`,
        time: log.timestamp.toISOString(),
        user: log.user?.name || 'System',
        action: log.action,
      }));

      // Map real notifications from audit logs & notices
      const notifications = recentLogs.slice(0, 4).map((log, i) => ({
        id: log.id,
        text: log.details || `${log.action}: ${log.resource}`,
        badge: log.action.includes('EXAM') ? 'EXAM' : log.action.includes('USER') ? 'USER' : 'SYSTEM',
        time: log.timestamp.toISOString(),
      }));

      // Calculate real pending tasks
      const pendingTasks = [
        { title: 'Question Papers Pending Approval', count: pendingApprovalsCount, urgent: pendingApprovalsCount > 0 },
        { title: 'Student Registration Requests', count: pendingStudentVerifications, urgent: false },
        { title: 'Faculty Verifications Required', count: 0, urgent: false },
        { title: 'Active In-Progress Test Sessions', count: activeSessions, urgent: activeSessions > 0 },
      ];

      const masterDepartments = await DepartmentService.getDepartments();

      return res.status(200).json({
        success: true,
        data: {
          metrics: {
            students: totalStudents,
            faculty: totalFaculty,
            departments: masterDepartments.length || 1,
            questionBank: totalQuestions,
            activeExams,
            todaysExams: todaysExamsCount,
            completedExams: completedAssignments,
            pendingApprovals: pendingApprovalsCount,
            databaseStatus: isDbConnected ? 'CONNECTED' : 'DISCONNECTED',
            socketStatus: 'ACTIVE',
            serverHealth: 'HEALTHY',
          },
          security: {
            allowedDomains: domainSetting ? domainSetting.value : ENV.ALLOWED_DOMAINS.join(','),
            jwtSecretConfigured: true,
            maxViolationThreshold: 5,
          },
          departmentBreakdown: masterDepartments.map((d) => ({
            id: d.id,
            code: d.code,
            department: d.name,
            count: d.studentCount || 0,
            active: d.active,
            collegeId: d.collegeId,
          })),
          difficultyBreakdown: difficultyCounts.map((df) => ({
            difficulty: df.difficulty,
            count: df._count.id,
          })),
          todaysSchedule: todaysExamsList.map((t) => ({
            id: t.id,
            code: t.title.split(' ')[0] || 'EXAM',
            subject: t.title,
            faculty: t.createdBy?.name || 'Faculty Member',
            time: `${t.durationMinutes} Mins`,
            students: t._count?.assignments || 0,
            status: t.isPublished ? 'PUBLISHED' : 'DRAFT',
          })),
          recentActivities,
          notifications,
          pendingTasks,
          systemHealth: [
            { name: 'API Server', status: 'ONLINE', detail: '100% Uptime • Operational' },
            { name: 'Database', status: isDbConnected ? 'CONNECTED' : 'DISCONNECTED', detail: 'Prisma PostgreSQL Active' },
            { name: 'Socket Connection', status: 'ACTIVE', detail: 'Socket.IO Gateway Live' },
            { name: 'Storage System', status: 'HEALTHY', detail: 'Local File System Ready' },
            { name: 'Authentication', status: 'SECURE', detail: 'Google OAuth & JWT Active' },
            { name: 'Email Service', status: 'OPERATIONAL', detail: 'Institutional Mail Ready' },
          ],
        },
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Student Management CRUD & Search
   */
  public static async getStudents(req: AuthRequest, res: Response) {
    try {
      const { search, department, year, section } = req.query;

      const whereClause: any = { role: Role.STUDENT };

      if (department && department !== 'ALL') {
        whereClause.department = String(department);
      }
      if (year && year !== 'ALL') {
        whereClause.year = Number(year);
      }
      if (section && section !== 'ALL') {
        whereClause.section = String(section);
      }

      if (search) {
        const query = String(search).trim();
        whereClause.OR = [
          { name: { contains: query, mode: 'insensitive' } },
          { email: { contains: query, mode: 'insensitive' } },
          { registerNo: { contains: query, mode: 'insensitive' } },
        ];
      }

      if (req.user!.role === Role.FACULTY) {
        const userId = req.user!.id;
        const facultyExams = await prisma.mockTest.findMany({
          where: {
            OR: [
              { createdById: userId },
              { invigilators: { some: { facultyId: userId } } }
            ]
          },
          select: { id: true }
        });
        const examIds = facultyExams.map(e => e.id);
        whereClause.assignments = {
          some: {
            testId: { in: examIds }
          }
        };
      }

      const students = await prisma.user.findMany({
        where: whereClause,
        orderBy: { name: 'asc' },
        select: {
          id: true,
          registerNo: true,
          name: true,
          email: true,
          department: true,
          year: true,
          semester: true,
          section: true,
          createdAt: true,
          _count: { select: { assignments: true } },
        },
      });

      return res.status(200).json({ success: true, data: students });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  public static async createStudent(req: AuthRequest, res: Response) {
    try {
      const { registerNo, name, email, department, year, semester, section } = req.body;

      if (!name || !email) {
        return res.status(400).json({ success: false, message: 'Name and Email are required' });
      }

      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) {
        return res.status(400).json({ success: false, message: `User with email ${email} already exists` });
      }

      const rawDepartments = await DepartmentService.getRawDepartments();
      const matchedDept = rawDepartments.find(
        (d) =>
          d.id === department ||
          d.code.toLowerCase() === (department || '').toLowerCase() ||
          d.name.toLowerCase() === (department || '').toLowerCase()
      );
      const canonicalDepartment = matchedDept ? matchedDept.name : (department || 'Computer Science and Engineering');

      const student = await prisma.user.create({
        data: {
          registerNo: registerNo || `717621050${Date.now().toString().slice(-3)}`,
          name,
          email,
          role: Role.STUDENT,
          department: canonicalDepartment,
          year: Number(year) || 3,
          semester: Number(semester) || 6,
          section: section || 'A',
        },
      });

      await AuditLogger.log({
        userId: req.user?.id,
        action: 'CREATE_STUDENT',
        resource: 'User',
        details: `Student account created for ${name} (${email})`,
        ipAddress: req.ip,
      });

      await NotificationController.createSystemNotification(
        'Student Registered',
        `New student account created for ${name} (${email})`,
        'success',
        'Admin'
      );

      return res.status(201).json({ success: true, message: 'Student created successfully', data: student });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  public static async updateStudent(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const { registerNo, name, email, department, year, semester, section } = req.body;

      const student = await prisma.user.update({
        where: { id },
        data: {
          registerNo,
          name,
          email,
          department,
          year: year ? Number(year) : undefined,
          semester: semester ? Number(semester) : undefined,
          section,
        },
      });

      return res.status(200).json({ success: true, message: 'Student profile updated', data: student });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  public static async deleteStudent(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const student = await prisma.user.findUnique({ where: { id } });
      if (!student) {
        return res.status(404).json({ success: false, message: 'Student record not found' });
      }

      // Preflight dependency check across ownership and assignment relations
      const [questionCount, mockTestCount, docCount, assignmentCount] = await Promise.all([
        prisma.question.count({ where: { createdById: id } }),
        prisma.mockTest.count({ where: { createdById: id } }),
        prisma.aIDocument.count({ where: { uploadedById: id } }),
        prisma.testAssignment.count({ where: { studentId: id } }),
      ]);

      if (questionCount > 0 || mockTestCount > 0 || docCount > 0 || assignmentCount > 0) {
        return res.status(400).json({
          success: false,
          code: 'USER_HAS_DEPENDENT_RECORDS',
          message: 'Student account cannot be deleted because dependent records exist in system.',
          summary: {
            questions: questionCount,
            mockTests: mockTestCount,
            documents: docCount,
            examAssignments: assignmentCount,
          },
        });
      }

      await prisma.$transaction(async (tx) => {
        await tx.user.delete({ where: { id } });
      });

      await AuditLogger.log({
        userId: req.user?.id,
        action: 'DELETE_STUDENT',
        resource: 'User',
        details: `Deleted student account: ${student.name || id}`,
        ipAddress: req.ip,
      });

      await NotificationController.createSystemNotification(
        'Student Deleted',
        `Student account ${student.name || id} was deleted from database`,
        'warning',
        'Admin'
      );

      return res.status(200).json({ success: true, message: 'Student record deleted' });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  public static async resetStudentAttempts(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const { testId } = req.body;

      if (req.user!.role === Role.FACULTY) {
        if (!testId) {
          return res.status(400).json({ success: false, message: 'testId is required for faculty to reset attempts' });
        }
        const test = await prisma.mockTest.findUnique({
          where: { id: testId },
          include: { invigilators: { where: { facultyId: req.user!.id } } }
        });
        if (!test || (test.createdById !== req.user!.id && test.invigilators.length === 0)) {
          return res.status(403).json({ success: false, message: 'Unauthorized to reset attempts for this examination' });
        }
        await prisma.testAssignment.deleteMany({
          where: { studentId: id, testId },
        });
      } else {
        const whereClause: any = { studentId: id };
        if (testId) whereClause.testId = testId;
        await prisma.testAssignment.deleteMany({
          where: whereClause,
        });
      }

      await AuditLogger.log({
        userId: req.user?.id,
        action: 'RESET_ATTEMPTS',
        resource: 'TestAssignment',
        details: `Reset exam attempts for student ID ${id}${testId ? ` on test ${testId}` : ''}`,
        ipAddress: req.ip,
      });

      return res.status(200).json({ success: true, message: 'Student exam attempts successfully reset' });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Faculty Management CRUD
   */
  public static async getFaculty(req: AuthRequest, res: Response) {
    try {
      const faculty = await prisma.user.findMany({
        where: { role: Role.FACULTY },
        orderBy: { name: 'asc' },
        select: {
          id: true,
          name: true,
          email: true,
          department: true,
          createdAt: true,
          canCreateExams: true,
          _count: { select: { createdTests: true, questions: true } },
        },
      });

      return res.status(200).json({ success: true, data: faculty });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  public static async createFaculty(req: AuthRequest, res: Response) {
    try {
      const { name, email, department } = req.body;

      if (!name || !email) {
        return res.status(400).json({ success: false, message: 'Name and Email are required' });
      }

      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) {
        return res.status(400).json({ success: false, message: `User with email ${email} already exists` });
      }

      const faculty = await prisma.user.create({
        data: {
          name,
          email,
          role: Role.FACULTY,
          department: department || 'Computer Science and Engineering',
        },
      });

      await AuditLogger.log({
        userId: req.user?.id,
        action: 'CREATE_FACULTY',
        resource: 'User',
        details: `Created faculty account for ${name} (${email})`,
        ipAddress: req.ip,
      });

      await NotificationController.createSystemNotification(
        'Faculty Added',
        `Faculty member ${name} (${department || 'CSE'}) added to institutional directory`,
        'success',
        'Admin'
      );

      return res.status(201).json({ success: true, message: 'Faculty member created', data: faculty });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  public static async updateFaculty(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const { name, email, department, canCreateExams } = req.body;

      const data: any = { name, email, department };
      if (typeof canCreateExams === 'boolean') {
        data.canCreateExams = canCreateExams;
      }

      const faculty = await prisma.user.update({
        where: { id },
        data,
      });

      if (typeof canCreateExams === 'boolean') {
        await AuditLogger.log({
          userId: req.user?.id,
          action: canCreateExams ? 'GRANT_EXAM_CREATE_PERMISSION' : 'REVOKE_EXAM_CREATE_PERMISSION',
          resource: 'User',
          details: `${canCreateExams ? 'Granted' : 'Revoked'} exam-creation permission for faculty ${faculty.name} (${faculty.email})`,
          ipAddress: req.ip,
        });
      }

      return res.status(200).json({ success: true, message: 'Faculty profile updated', data: faculty });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  public static async deleteFaculty(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const faculty = await prisma.user.findUnique({ where: { id } });
      if (!faculty) {
        return res.status(404).json({ success: false, message: 'Faculty member not found' });
      }

      // Preflight dependency check across created questions, tests, documents, and invigilation assignments
      const [questionCount, mockTestCount, docCount, invigilatorCount] = await Promise.all([
        prisma.question.count({ where: { createdById: id } }),
        prisma.mockTest.count({ where: { createdById: id } }),
        prisma.aIDocument.count({ where: { uploadedById: id } }),
        prisma.invigilatorAssignment.count({ where: { facultyId: id } }),
      ]);

      if (questionCount > 0 || mockTestCount > 0 || docCount > 0 || invigilatorCount > 0) {
        return res.status(400).json({
          success: false,
          code: 'USER_HAS_DEPENDENT_RECORDS',
          message: 'Faculty account cannot be deleted because dependent questions, tests, or assignments exist.',
          summary: {
            questions: questionCount,
            mockTests: mockTestCount,
            documents: docCount,
            invigilatorAssignments: invigilatorCount,
          },
        });
      }

      await prisma.$transaction(async (tx) => {
        await tx.user.delete({ where: { id } });
      });

      await AuditLogger.log({
        userId: req.user?.id,
        action: 'DELETE_FACULTY',
        resource: 'User',
        details: `Removed faculty member ID ${id}`,
        ipAddress: req.ip,
      });

      await NotificationController.createSystemNotification(
        'Faculty Deleted',
        `Faculty member ${faculty.name || id} removed from directory`,
        'warning',
        'Admin'
      );

      return res.status(200).json({ success: true, message: 'Faculty member removed' });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Question Bank Management
   */
  public static async getQuestions(req: AuthRequest, res: Response) {
    try {
      const { search, type, difficulty } = req.query;

      const whereClause: any = {};
      if (type && type !== 'ALL') whereClause.type = type as QuestionType;
      if (difficulty && difficulty !== 'ALL') whereClause.difficulty = difficulty as Difficulty;

      if (search) {
        whereClause.text = { contains: String(search), mode: 'insensitive' };
      }

      if (req.user!.role === Role.FACULTY) {
        whereClause.OR = [
          { createdById: req.user!.id },
          { subtopic: { topic: { module: { subject: { department: { contains: req.user!.department, mode: 'insensitive' } } } } } }
        ];
      }

      const questions = await prisma.question.findMany({
        where: whereClause,
        include: {
          subtopic: {
            include: {
              topic: {
                include: {
                  module: {
                    include: { subject: true },
                  },
                },
              },
            },
          },
          createdBy: { select: { name: true, department: true } },
          aiSources: { select: { documentId: true } },
        },
        orderBy: { createdAt: 'desc' },
      });

      return res.status(200).json({ success: true, data: questions });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Lists uploaded question-bank PDFs as grouped entries (one row per PDF),
   * each with a count of the questions extracted from it, for the Question
   * Bank UI and for exam-assembly source selection.
   */
  public static async getQuestionBankDocuments(req: AuthRequest, res: Response) {
    try {
      const documents = await prisma.aIDocument.findMany({
        where: { aiSources: { some: {} } },
        include: {
          _count: { select: { aiSources: true } },
        },
        orderBy: { createdAt: 'desc' },
      });

      const data = documents.map((doc) => ({
        id: doc.id,
        title: doc.title,
        fileName: doc.fileName,
        status: doc.status,
        questionCount: doc._count.aiSources,
        uploadedAt: doc.createdAt,
      }));

      return res.status(200).json({ success: true, data });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  public static async createQuestion(req: AuthRequest, res: Response) {
    try {
      const { text, type, difficulty, marks, negativeMarks, options, correctAnswer, explanation, reference } = req.body;

      let subtopic = await prisma.subtopic.findFirst();
      if (!subtopic) {
        return res.status(400).json({ success: false, message: 'No taxonomy subtopic found. Run seed script first.' });
      }

      const embeddingFields = await EmbeddingProvider.getEmbeddingFields(text);

      const question = await prisma.question.create({
        data: {
          text,
          type: type || QuestionType.MCQ,
          difficulty: difficulty || Difficulty.MEDIUM,
          marks: Number(marks) || 1.0,
          negativeMarks: Number(negativeMarks) || 0.33,
          options: options || [{ text: 'Option A' }, { text: 'Option B' }, { text: 'Option C' }, { text: 'Option D' }],
          correctAnswer: correctAnswer || [0],
          explanation,
          reference,
          subtopicId: subtopic.id,
          createdById: req.user!.id,
          ...embeddingFields,
        },
      });

      await AuditLogger.log({
        userId: req.user?.id,
        action: 'CREATE_QUESTION',
        resource: 'Question',
        details: `Created new question (${question.type})`,
        ipAddress: req.ip,
      });

      await NotificationController.createSystemNotification(
        'Question Added',
        `New ${question.type} question added to Question Bank`,
        'info',
        'Admin'
      );

      return res.status(201).json({ success: true, message: 'Question created successfully', data: question });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  public static async deleteQuestion(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const userId = req.user!.id;
      const role = req.user!.role;

      console.log(`[QUESTION DELETE] userId=${userId} questionId=${id} routeReached=true`);

      // 1. Check question existence and authorization
      const question = await prisma.question.findUnique({
        where: { id },
        select: { id: true, createdById: true },
      });

      if (!question) {
        return res.status(404).json({
          success: false,
          code: 'QUESTION_NOT_FOUND',
          message: 'Question not found.',
        });
      }

      if (role === Role.FACULTY && question.createdById !== userId) {
        return res.status(403).json({
          success: false,
          code: 'UNAUTHORIZED',
          message: 'Unauthorized to delete this question.',
        });
      }

      // 2. Preflight dependency check: verify question is not in use in exams or student responses
      const [mockTestUsageCount, responseUsageCount, solutionUsageCount] = await Promise.all([
        prisma.mockTestQuestion.count({ where: { questionId: id } }),
        prisma.questionResponse.count({ where: { questionId: id } }),
        prisma.aISolution.count({ where: { questionId: id } }),
      ]);

      console.log(
        `[QUESTION DELETE] questionId=${id} mockTestCount=${mockTestUsageCount} responseCount=${responseUsageCount} solutionCount=${solutionUsageCount}`
      );

      if (mockTestUsageCount > 0 || responseUsageCount > 0 || solutionUsageCount > 0) {
        return res.status(409).json({
          success: false,
          code: 'QUESTION_IN_USE',
          message: 'This question is currently used and cannot be deleted.',
        });
      }

      // 3. Race-safe atomic deletion
      const deleteResult = await prisma.question.deleteMany({
        where: { id },
      });

      console.log(`[QUESTION DELETE] questionId=${id} deleteCount=${deleteResult.count}`);

      if (deleteResult.count === 0) {
        return res.status(404).json({
          success: false,
          code: 'QUESTION_NOT_FOUND',
          message: 'Question not found.',
        });
      }

      // 4. Record audit log only upon successful deletion
      await AuditLogger.log({
        userId,
        action: 'DELETE_QUESTION',
        resource: 'Question',
        details: `Deleted question ID ${id}`,
        ipAddress: req.ip,
      });

      await NotificationController.createSystemNotification(
        'Question Deleted',
        `Question ID ${id.slice(0, 8)} removed from Question Bank`,
        'warning',
        'Admin'
      );

      return res.status(200).json({
        success: true,
        code: 'QUESTION_DELETED',
        message: 'Question deleted successfully.',
        data: { id },
      });
    } catch (error: any) {
      console.error('[AdminController.deleteQuestion Error]:', error?.message || error);
      return res.status(500).json({
        success: false,
        code: 'SERVER_ERROR',
        message: 'Unable to delete the question right now.',
      });
    }
  }

  /**
   * Phase 9 Diagnostic: Returns metadata for documents where DB record exists but storage file is missing
   */
  public static async getStorageOrphans(req: AuthRequest, res: Response) {
    try {
      const documents = await prisma.aIDocument.findMany({
        select: {
          id: true,
          title: true,
          fileName: true,
          storageKey: true,
          status: true,
          createdAt: true,
        },
      });

      const orphans: Array<{
        id: string;
        title: string;
        fileName: string;
        status: string;
        createdAt: string;
      }> = [];

      for (const doc of documents) {
        const fileExists = await LocalStorageProvider.prototype.fileExists?.call(new LocalStorageProvider(), doc.storageKey) ?? false;
        if (!fileExists) {
          orphans.push({
            id: doc.id,
            title: doc.title,
            fileName: doc.fileName,
            status: doc.status,
            createdAt: doc.createdAt.toISOString(),
          });
        }
      }

      return res.status(200).json({
        success: true,
        count: orphans.length,
        data: orphans,
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Bulk-deletes multiple Question Bank entries in a single transaction. A question referenced
   * by any exam (MockTestQuestion) is never deleted — the DB's own FK constraint would reject it
   * anyway, and doing so would silently corrupt an exam's question list — so usage is checked
   * up front and those questions are reported back as blocked, not silently skipped.
   */
  public static async bulkDeleteQuestions(req: AuthRequest, res: Response) {
    try {
      const { questionIds } = req.body;

      if (!Array.isArray(questionIds) || questionIds.length === 0) {
        return res.status(400).json({ success: false, message: 'questionIds must be a non-empty array.' });
      }
      if (questionIds.some((id: any) => typeof id !== 'string' || !id.trim())) {
        return res.status(400).json({ success: false, message: 'questionIds must contain only non-empty string IDs.' });
      }

      const uniqueIds = Array.from(new Set<string>(questionIds));

      const existing = await prisma.question.findMany({
        where: { id: { in: uniqueIds } },
        include: {
          mockTestQuestions: {
            include: { mockTest: { select: { title: true, isPublished: true, status: true } } },
          },
        },
      });

      const existingIds = new Set(existing.map((q) => q.id));
      const notFoundIds = uniqueIds.filter((id) => !existingIds.has(id));

      // Faculty may only delete questions they authored themselves; Admin may delete any.
      const forbiddenIds: string[] = [];
      const ownedQuestions =
        req.user!.role === Role.FACULTY
          ? existing.filter((q) => {
              if (q.createdById !== req.user!.id) {
                forbiddenIds.push(q.id);
                return false;
              }
              return true;
            })
          : existing;

      // A question attached to any exam (draft or published) cannot be deleted — the
      // MockTestQuestion -> Question foreign key would reject it. Reported separately from
      // "not found"/"forbidden" so the caller can explain exactly why each ID was skipped.
      const blockedIds: string[] = [];
      const blockedDetails: Array<{ id: string; examTitles: string[]; hasActiveExam: boolean }> = [];
      const deletableQuestions = ownedQuestions.filter((q) => {
        if (q.mockTestQuestions.length > 0) {
          blockedIds.push(q.id);
          blockedDetails.push({
            id: q.id,
            examTitles: q.mockTestQuestions.map((mtq) => mtq.mockTest.title),
            hasActiveExam: q.mockTestQuestions.some(
              (mtq) => mtq.mockTest.isPublished || ['PUBLISHED', 'LIVE', 'SCHEDULED'].includes(mtq.mockTest.status)
            ),
          });
          return false;
        }
        return true;
      });

      if (deletableQuestions.length === 0) {
        return res.status(409).json({
          success: false,
          message:
            blockedIds.length > 0
              ? `None of the selected questions could be deleted — they are associated with an examination and cannot be removed while in use.`
              : 'None of the selected questions could be deleted.',
          deletedCount: 0,
          notFoundIds,
          forbiddenIds,
          blockedIds,
          blockedDetails,
        });
      }

      const idsToDelete = deletableQuestions.map((q) => q.id);
      let deletedCount = 0;

      try {
        await prisma.$transaction(
          async (tx) => {
            const result = await tx.question.deleteMany({ where: { id: { in: idsToDelete } } });
            deletedCount = result.count;
          },
          { timeout: 20000 }
        );
      } catch (txErr: any) {
        console.error('[bulkDeleteQuestions] Transaction failed:', txErr);
        return res.status(500).json({
          success: false,
          message: `Bulk delete failed: ${txErr.message}. No questions were deleted.`,
        });
      }

      await AuditLogger.log({
        userId: req.user?.id,
        action: 'BULK_DELETE_QUESTIONS',
        resource: 'Question',
        details: `Bulk deleted ${deletedCount} question(s): ${idsToDelete.join(', ')}${
          blockedIds.length > 0 ? ` | Blocked (in use by exam): ${blockedIds.join(', ')}` : ''
        }`,
        ipAddress: req.ip,
      });

      await NotificationController.createSystemNotification(
        'Questions Deleted',
        `${deletedCount} question(s) removed from Question Bank`,
        'warning',
        'Admin'
      );

      const skippedCount = notFoundIds.length + forbiddenIds.length + blockedIds.length;
      const message =
        skippedCount > 0
          ? `${deletedCount} question(s) deleted successfully. ${blockedIds.length > 0 ? `${blockedIds.length} could not be deleted — in use by an examination.` : ''} ${
              forbiddenIds.length > 0 ? `${forbiddenIds.length} skipped — not authorized.` : ''
            }`.trim()
          : `${deletedCount} question(s) deleted successfully.`;

      return res.status(200).json({
        success: true,
        message,
        deletedCount,
        notFoundIds,
        forbiddenIds,
        blockedIds,
        blockedDetails,
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Examination Management CRUD & Scheduling
   */
  public static async getExams(req: AuthRequest, res: Response) {
    try {
      const userId = req.user!.id;
      const role = req.user!.role;

      const whereClause: any = {};
      if (role === Role.FACULTY) {
        whereClause.OR = [
          { createdById: userId },
          { invigilators: { some: { facultyId: userId } } }
        ];
      }

      const exams = await prisma.mockTest.findMany({
        where: whereClause,
        include: {
          createdBy: { select: { name: true, department: true } },
          _count: { select: { testQuestions: true, assignments: true } },
        },
        orderBy: { createdAt: 'desc' },
      });

      return res.status(200).json({ success: true, data: exams });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  public static async createExam(req: AuthRequest, res: Response) {
    try {
      const {
        title,
        description,
        examType,
        durationMinutes,
        totalMarks,
        targetDepartment,
        targetSemester,
        targetYear,
        maxViolations,
        instructions,
        questionCount,
        sourceDocumentId,
      } = req.body;

      if (!title || String(title).trim().length < 5) {
        return res.status(400).json({ success: false, message: 'Exam title / course code is required and must be at least 5 characters.' });
      }

      const parsedDuration = Number(durationMinutes);
      if (isNaN(parsedDuration) || parsedDuration <= 0) {
        return res.status(400).json({ success: false, message: 'Duration must be a valid positive integer.' });
      }

      const parsedMarks = Number(totalMarks);
      if (isNaN(parsedMarks) || parsedMarks <= 0) {
        return res.status(400).json({ success: false, message: 'Total marks must be a valid positive number.' });
      }

      const parsedViolations = Number(maxViolations);
      if (isNaN(parsedViolations) || parsedViolations < 0) {
        return res.status(400).json({ success: false, message: 'Max violations threshold must be a non-negative number.' });
      }

      const parsedQuestionCount = Number(questionCount) || 0;
      if (questionCount !== undefined && (isNaN(parsedQuestionCount) || parsedQuestionCount < 0)) {
        return res.status(400).json({ success: false, message: 'Number of questions must be a non-negative number.' });
      }

      let resolvedYear: number | undefined = targetYear ? Number(targetYear) : undefined;
      let finalDescription = description || 'Official Institutional CBT Examination';

      if (targetSemester) {
        const romanToNum: Record<string, number> = {
          'VIII': 8, 'VII': 7, 'VI': 6, 'IV': 4, 'V': 5, 'III': 3, 'II': 2, 'I': 1
        };
        const numMatch = String(targetSemester).match(/\b([1-8])\b/);
        let semNum: number | undefined = numMatch ? Number(numMatch[1]) : undefined;
        if (!semNum) {
          for (const [roman, n] of Object.entries(romanToNum)) {
            if (String(targetSemester).toUpperCase().includes(roman)) {
              semNum = n;
              break;
            }
          }
        }
        if (semNum && !resolvedYear) {
          resolvedYear = Math.ceil(semNum / 2);
        }
        if (!finalDescription.includes(String(targetSemester))) {
          finalDescription = `[${targetSemester}] ${finalDescription}`;
        }
      }

      const exam = await prisma.mockTest.create({
        data: {
          title,
          description: finalDescription,
          examType: examType || ExamType.SCHEDULED,
          durationMinutes: parsedDuration,
          totalMarks: parsedMarks,
          startTime: new Date(),
          endTime: new Date(Date.now() + 86400000 * 7),
          targetDepartment: targetDepartment || 'Computer Science and Engineering',
          targetYear: resolvedYear || 3,
          maxViolations: parsedViolations,
          instructions: instructions || 'Fullscreen mode is strictly enforced.',
          isPublished: false,
          status: ExamStatus.DRAFT,
          createdById: req.user!.id,
        },
      });

      let attachedCount = 0;
      if (parsedQuestionCount > 0) {
        const poolWhere: any = sourceDocumentId
          ? { aiSources: { some: { documentId: String(sourceDocumentId) } } }
          : {};

        const pool = await prisma.question.findMany({ where: poolWhere, select: { id: true } });

        // Fisher-Yates shuffle, then take the requested count (capped to pool size)
        const shuffled = [...pool];
        for (let i = shuffled.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        const selected = shuffled.slice(0, parsedQuestionCount);

        if (selected.length > 0) {
          // Pin each question's current version at attach time so later edits/AI-solution
          // approvals never retroactively change what this exam scores against.
          const versionIds = await Promise.all(
            selected.map((q) => QuestionVersionService.getCurrentVersionId(q.id))
          );

          await prisma.mockTestQuestion.createMany({
            data: selected.map((q, idx) => ({
              mockTestId: exam.id,
              questionId: q.id,
              questionVersionId: versionIds[idx],
              order: idx + 1,
            })),
          });
          attachedCount = selected.length;
        }
      }

      await AuditLogger.log({
        userId: req.user?.id,
        action: 'CREATE_EXAM',
        resource: 'MockTest',
        details: `Scheduled and published exam: ${title}${parsedQuestionCount > 0 ? ` (${attachedCount}/${parsedQuestionCount} questions randomly attached)` : ''}`,
        ipAddress: req.ip,
      });

      await NotificationController.createSystemNotification(
        'Examination Created',
        `New examination paper "${title}" created as DRAFT`,
        'info',
        'ALL'
      );

      const message =
        parsedQuestionCount > 0 && attachedCount < parsedQuestionCount
          ? `Exam created, but only ${attachedCount} of the requested ${parsedQuestionCount} questions were available in the selected pool.`
          : 'Exam created successfully';

      return res.status(201).json({ success: true, message, data: { ...exam, attachedQuestionCount: attachedCount } });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  public static async togglePublishExam(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const exam = await prisma.mockTest.findUnique({ where: { id } });

      if (!exam) {
        return res.status(404).json({ success: false, message: 'Exam not found' });
      }

      const updated = await prisma.mockTest.update({
        where: { id },
        data: { isPublished: !exam.isPublished },
      });

      await AuditLogger.log({
        userId: req.user?.id,
        action: 'TOGGLE_PUBLISH_EXAM',
        resource: 'MockTest',
        details: `Exam "${exam.title}" status set to ${updated.isPublished ? 'Published' : 'Draft'}`,
        ipAddress: req.ip,
      });

      await NotificationController.createSystemNotification(
        updated.isPublished ? 'Examination Published' : 'Examination Moved to Draft',
        `Examination paper "${exam.title}" status changed to ${updated.isPublished ? 'Published' : 'Draft'}`,
        updated.isPublished ? 'success' : 'warning',
        'ALL'
      );

      return res.status(200).json({
        success: true,
        message: `Exam status toggled to ${updated.isPublished ? 'Published' : 'Draft'}`,
        data: updated,
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  public static async deleteExam(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const exam = await prisma.mockTest.findUnique({ where: { id } });
      await prisma.mockTest.delete({ where: { id } });

      await AuditLogger.log({
        userId: req.user?.id,
        action: 'DELETE_EXAM',
        resource: 'MockTest',
        details: `Deleted examination ID ${id}`,
        ipAddress: req.ip,
      });

      await NotificationController.createSystemNotification(
        'Examination Cancelled',
        `Examination paper "${exam?.title || id}" was deleted from Controller of Examinations database`,
        'error',
        'ALL'
      );

      return res.status(200).json({ success: true, message: 'Exam deleted' });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Excel / CSV / JSON Bulk Upload for Question Bank
   */
  public static async uploadQuestions(req: AuthRequest, res: Response) {
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, message: 'No file uploaded' });
      }

      const defaultSubtopic = await prisma.subtopic.findFirst();
      if (!defaultSubtopic) {
        return res.status(400).json({ success: false, message: 'Please create a subject/subtopic in taxonomy before importing questions.' });
      }

      // If PDF file is uploaded, enqueue background extraction (page-batched internally, so a
      // large PDF never blocks this request or gets sent to the model in one shot) — poll
      // GET /ai/questions/batch-status/:generationRequestId for progress.
      if (req.file.mimetype === 'application/pdf' || req.file.originalname.endsWith('.pdf')) {
        const storageProvider = new LocalStorageProvider();
        const storageKey = await storageProvider.upload(req.file.buffer, req.file.originalname, req.file.mimetype);

        const docId = `import_${Date.now()}`;
        const document = await prisma.aIDocument.create({
          data: {
            id: docId,
            title: req.file.originalname,
            fileName: req.file.originalname,
            mimeType: req.file.mimetype,
            fileSize: req.file.size,
            storageKey,
            visibility: 'PRIVATE',
            status: AIDocumentStatus.UPLOADED,
            uploadedById: req.user!.id,
          },
        });

        const targetCount = req.body.targetQuestionCount ? Number(req.body.targetQuestionCount) : undefined;

        const enqueued = await PDFQuestionImportService.enqueueImport({
          userId: req.user!.id,
          role: req.user!.role,
          documentId: document.id,
          subtopicId: defaultSubtopic.id,
          targetCount,
        });

        await AuditLogger.log({
          userId: req.user?.id,
          action: 'BULK_UPLOAD_QUESTIONS',
          resource: 'Question',
          details: `Queued question extraction from PDF: ${req.file.originalname}${targetCount ? ` (target count: ${targetCount})` : ''} — job ${enqueued.generationRequestId}.`,
          ipAddress: req.ip,
        });

        return res.status(202).json({
          success: true,
          message: `"${req.file.originalname}" uploaded — extracting questions in the background${targetCount ? ` (up to ${targetCount})` : ''}. This can take a few minutes for large documents.`,
          documentId: document.id,
          generationRequestId: enqueued.generationRequestId,
          status: enqueued.status,
        });
      }

      const questions = await ExcelImportService.importQuestions(
        req.file.buffer,
        req.file.mimetype,
        req.user!.id,
        defaultSubtopic.id
      );

      await AuditLogger.log({
        userId: req.user?.id,
        action: 'BULK_UPLOAD_QUESTIONS',
        resource: 'Question',
        details: `Uploaded ${questions.length} questions to Question Bank via file import`,
        ipAddress: req.ip,
      });

      return res.status(200).json({
        success: true,
        message: `Successfully imported ${questions.length} questions into Question Bank!`,
        count: questions.length,
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Excel Bulk Upload for Student Roster
   */
  public static async uploadStudents(req: AuthRequest, res: Response) {
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, message: 'No file uploaded' });
      }

      const students = await ExcelImportService.importStudents(req.file.buffer);

      await AuditLogger.log({
        userId: req.user?.id,
        action: 'BULK_UPLOAD_STUDENTS',
        resource: 'User',
        details: `Imported ${students.length} student records into database via file upload`,
        ipAddress: req.ip,
      });

      return res.status(200).json({
        success: true,
        message: `Successfully imported ${students.length} students into institutional database!`,
        count: students.length,
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Multi-format Export (Excel, PDF, CSV)
   */
  public static async exportTestReport(req: AuthRequest, res: Response) {
    try {
      const { testId } = req.params;
      const format = (req.query.format as string) || 'excel';

      if (format === 'excel') {
        const buffer = await ReportExportService.generateExcelReport(testId);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=EMS_Test_${testId}_Report.xlsx`);
        return res.send(buffer);
      } else if (format === 'pdf') {
        const buffer = await ReportExportService.generatePDFReport(testId);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=EMS_Test_${testId}_Report.pdf`);
        return res.send(buffer);
      } else if (format === 'csv') {
        const csvString = await ReportExportService.generateCSVReport(testId);
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=EMS_Test_${testId}_Report.csv`);
        return res.send(csvString);
      } else {
        return res.status(400).json({ success: false, message: 'Unsupported export format' });
      }
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Generates and streams dynamic Excel export of all student records for authorized Admins
   */
  public static async exportStudentsExcel(req: AuthRequest, res: Response) {
    try {
      const buffer = await StudentDataExportService.generateExcel();
      const dateStr = new Date().toISOString().split('T')[0];
      const filename = `student_data_${dateStr}.xlsx`;

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Cache-Control', 'no-cache');
      return res.send(buffer);
    } catch (error: any) {
      console.error('[AdminController.exportStudentsExcel Error]:', error);
      return res.status(500).json({ success: false, message: error.message || 'Failed to export student data' });
    }
  }

  /**
   * System Settings & Audit Logs
   */
  public static async getSystemSettings(req: AuthRequest, res: Response) {
    try {
      const settings = await prisma.systemSetting.findMany();
      return res.status(200).json({ success: true, data: settings });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  public static async updateSystemSetting(req: AuthRequest, res: Response) {
    try {
      const { key, value } = req.body;
      const setting = await prisma.systemSetting.upsert({
        where: { key },
        update: { value },
        create: { key, value, description: 'Updated by Admin' },
      });

      await AuditLogger.log({
        userId: req.user?.id,
        action: 'UPDATE_SETTING',
        resource: 'SystemSetting',
        details: `Updated setting ${key} = ${value}`,
        ipAddress: req.ip,
      });

      await NotificationController.createSystemNotification(
        'System Governance Setting Updated',
        `Setting "${key}" was updated to value: ${value}`,
        'warning',
        'Admin'
      );

      return res.status(200).json({ success: true, data: setting });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Results Ledger
   */
  public static async getResultsLedger(req: AuthRequest, res: Response) {
    try {
      const whereClause: any = {};
      if (req.user!.role === Role.FACULTY) {
        whereClause.test = {
          OR: [
            { createdById: req.user!.id },
            { invigilators: { some: { facultyId: req.user!.id } } }
          ]
        };
      }

      const assignments = await prisma.testAssignment.findMany({
        where: whereClause,
        include: {
          student: {
            select: { id: true, name: true, registerNo: true, department: true, email: true },
          },
          test: {
            select: { id: true, title: true, totalMarks: true },
          },
        },
        orderBy: { submittedAt: 'desc' },
      });

      const ledger = assignments.map((a) => {
        const score = a.score || 0;
        const total = a.totalMarks || a.test?.totalMarks || 100;
        const pct = total > 0 ? (score / total) * 100 : 0;
        let grade = 'F';
        if (pct >= 90) grade = 'O (Outstanding)';
        else if (pct >= 80) grade = 'A+ (Excellent)';
        else if (pct >= 70) grade = 'A (Very Good)';
        else if (pct >= 60) grade = 'B+ (Good)';
        else if (pct >= 50) grade = 'B (Above Average)';
        else if (pct >= 35) grade = 'C (Pass)';

        // "Completed" is an attempt-progress state, not an academic outcome — a 1/100 score
        // completed the exam same as a 90/100 one. PASS/FAIL must reflect the actual score
        // against the same 35% cutoff the grade scale above already uses as its pass line.
        const attemptFinished = a.status === 'COMPLETED' || a.status === 'AUTO_SUBMITTED';
        const status = attemptFinished ? (pct >= 35 ? 'PASS' : 'FAIL') : a.status;

        return {
          id: a.id,
          registerNo: a.student?.registerNo || '—',
          studentName: a.student?.name || 'Student',
          courseTitle: a.test?.title || 'Examination',
          score,
          totalMarks: total,
          grade,
          status,
          submittedAt: a.submittedAt,
        };
      });

      return res.status(200).json({ success: true, data: ledger });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Assign Invigilator
   */
  public static async assignInvigilator(req: AuthRequest, res: Response) {
    try {
      const { testId, facultyId } = req.body;

      if (!testId || !facultyId) {
        return res.status(400).json({ success: false, message: 'testId and facultyId are required' });
      }

      const test = await prisma.mockTest.findUnique({ where: { id: testId } });
      const faculty = await prisma.user.findUnique({ where: { id: facultyId } });

      if (!test) {
        return res.status(404).json({ success: false, message: 'Examination not found' });
      }

      if (!faculty) {
        return res.status(404).json({ success: false, message: 'Faculty user not found' });
      }

      if (faculty.role !== Role.FACULTY && faculty.role !== Role.ADMIN) {
        return res.status(400).json({ success: false, message: 'Only faculty/admin members can be assigned as invigilators' });
      }

      if (req.user!.role === Role.FACULTY && test.createdById !== req.user!.id) {
        return res.status(403).json({ success: false, message: 'Unauthorized to assign invigilator to this examination' });
      }

      const existing = await prisma.invigilatorAssignment.findUnique({
        where: {
          testId_facultyId: { testId, facultyId }
        }
      });

      if (existing) {
        return res.status(400).json({ success: false, message: 'Faculty member is already assigned as an invigilator for this exam' });
      }

      const assignment = await prisma.invigilatorAssignment.create({
        data: { testId, facultyId },
      });

      await AuditLogger.log({
        userId: req.user?.id,
        action: 'ASSIGN_INVIGILATOR',
        resource: 'MockTest',
        details: `Assigned faculty ${faculty.name} (ID: ${facultyId}) as invigilator for test ${test.title} (ID: ${testId})`,
        ipAddress: req.ip,
      });

      await NotificationController.createSystemNotification(
        'Invigilator Assigned',
        `Faculty member ${faculty.name} allocated to ${test.title}`,
        'info',
        'Faculty',
        facultyId
      );

      return res.status(200).json({
        success: true,
        message: `Invigilator ${faculty.name} successfully assigned to ${test.title}.`,
        data: assignment,
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  public static async getAttendanceByTestId(req: AuthRequest, res: Response) {
    try {
      const { testId } = req.params;

      if (!testId) {
        return res.status(400).json({ success: false, message: 'Examination ID is required' });
      }

      const exam = await prisma.mockTest.findUnique({
        where: { id: testId },
        include: {
          invigilators: { where: { facultyId: req.user!.id } }
        }
      });

      if (!exam) {
        return res.status(404).json({ success: false, message: 'Examination not found' });
      }

      if (req.user!.role === Role.FACULTY && exam.createdById !== req.user!.id && exam.invigilators.length === 0) {
        return res.status(403).json({ success: false, message: 'Unauthorized to view attendance for this examination' });
      }

      // Query test assignments strictly filtered by examination_id (testId)
      const assignments = await prisma.testAssignment.findMany({
        where: { testId },
        include: {
          student: {
            select: {
              id: true,
              registerNo: true,
              name: true,
              department: true,
              email: true,
            },
          },
        },
        orderBy: { student: { registerNo: 'asc' } },
      });

      const attendanceList = assignments.map((a) => {
        const isPresent = Boolean(
          a.startedAt ||
          a.status === 'IN_PROGRESS' ||
          a.status === 'COMPLETED' ||
          a.status === 'AUTO_SUBMITTED'
        );

        let checkInTimeStr = '-';
        if (a.startedAt) {
          checkInTimeStr = new Date(a.startedAt).toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: true,
          });
        }

        return {
          assignmentId: a.id,
          studentId: a.studentId,
          registerNo: a.student?.registerNo || 'N/A',
          name: a.student?.name || 'Candidate',
          department: a.student?.department || exam.targetDepartment || 'N/A',
          status: isPresent ? 'PRESENT' : 'ABSENT',
          checkInTime: checkInTimeStr,
          rawStatus: a.status,
          startedAt: a.startedAt,
          submittedAt: a.submittedAt,
        };
      });

      const examMeta = {
        id: exam.id,
        title: exam.title,
        targetDepartment: exam.targetDepartment,
        examDate: exam.startTime ? exam.startTime.toISOString().split('T')[0] : 'N/A',
        examHall: 'Hall B-302',
        durationMinutes: exam.durationMinutes,
        totalCandidates: assignments.length,
      };

      return res.status(200).json({
        success: true,
        data: {
          exam: examMeta,
          attendance: attendanceList,
        },
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Toggle Student Attendance Status
   */
  public static async toggleAttendance(req: AuthRequest, res: Response) {
    try {
      const { testId } = req.params;
      const { studentId, status } = req.body;

      if (!testId || !studentId || !status) {
        return res.status(400).json({ success: false, message: 'testId, studentId, and status are required' });
      }

      // Check faculty authorization
      const exam = await prisma.mockTest.findUnique({
        where: { id: testId },
        include: {
          invigilators: { where: { facultyId: req.user!.id } }
        }
      });

      if (!exam) {
        return res.status(404).json({ success: false, message: 'Examination not found' });
      }

      if (req.user!.role === Role.FACULTY && exam.createdById !== req.user!.id && exam.invigilators.length === 0) {
        return res.status(403).json({ success: false, message: 'Unauthorized to toggle attendance for this examination' });
      }

      const assignment = await prisma.testAssignment.findFirst({
        where: { testId, studentId },
      });

      if (!assignment) {
        return res.status(404).json({ success: false, message: 'Student assignment not found' });
      }

      const updated = await prisma.testAssignment.update({
        where: { id: assignment.id },
        data: {
          startedAt: status === 'PRESENT' ? new Date() : null,
          status: status === 'PRESENT' ? 'IN_PROGRESS' : 'SCHEDULED',
        },
      });

      return res.status(200).json({ success: true, message: 'Attendance status updated successfully', data: updated });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Transition Exam Lifecycle Status
   */
  public static async updateExamStatus(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const { status } = req.body; // DRAFT, SCHEDULED, PUBLISHED, LIVE, COMPLETED, ARCHIVED

      if (!status || !['DRAFT', 'SCHEDULED', 'PUBLISHED', 'LIVE', 'COMPLETED', 'ARCHIVED'].includes(status)) {
        return res.status(400).json({ success: false, message: 'Invalid exam status value' });
      }

      const exam = await prisma.mockTest.findUnique({
        where: { id },
        include: {
          _count: { select: { testQuestions: true } },
          invigilators: { where: { facultyId: req.user!.id } }
        }
      });

      if (!exam) {
        return res.status(404).json({ success: false, message: 'Examination not found' });
      }

      if (req.user!.role === Role.FACULTY && exam.createdById !== req.user!.id && exam.invigilators.length === 0) {
        return res.status(403).json({ success: false, message: 'Unauthorized to manage this examination' });
      }

      const current = exam.status;
      let allowed = false;

      if (current === 'DRAFT') {
        allowed = ['SCHEDULED', 'PUBLISHED'].includes(status);
      } else if (current === 'SCHEDULED') {
        allowed = ['PUBLISHED', 'DRAFT'].includes(status);
      } else if (current === 'PUBLISHED') {
        allowed = ['LIVE', 'DRAFT', 'SCHEDULED'].includes(status);
      } else if (current === 'LIVE') {
        allowed = ['COMPLETED'].includes(status);
      } else if (current === 'COMPLETED') {
        allowed = ['ARCHIVED'].includes(status);
      } else if (current === 'ARCHIVED') {
        allowed = false;
      }

      if (!allowed) {
        return res.status(400).json({ success: false, message: `Invalid status transition from ${current} to ${status}` });
      }

      if ((status === 'PUBLISHED' || status === 'SCHEDULED' || status === 'LIVE') && exam._count.testQuestions === 0) {
        return res.status(400).json({ success: false, message: 'Cannot publish or schedule an examination with no questions.' });
      }

      const isPublished = ['PUBLISHED', 'LIVE', 'COMPLETED'].includes(status);

      const updated = await prisma.$transaction(async (tx) => {
        const u = await tx.mockTest.update({
          where: { id },
          data: {
            status: status as ExamStatus,
            isPublished,
          },
        });

        await tx.auditLog.create({
          data: {
            userId: req.user!.id,
            action: 'UPDATE_EXAM_STATUS',
            resource: 'MockTest',
            details: `Exam status transitioned from ${current} to ${status} (isPublished: ${isPublished})`,
            ipAddress: req.ip,
          }
        });

        return u;
      });

      await NotificationController.createSystemNotification(
        `Examination Status: ${status}`,
        `Exam "${exam.title}" status changed to ${status}`,
        status === 'LIVE' ? 'success' : 'info',
        'ALL'
      );

      return res.status(200).json({ success: true, message: `Exam status successfully updated to ${status}`, data: updated });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Department & College Master Data Management
   */
  public static async getColleges(req: AuthRequest, res: Response) {
    try {
      const colleges = await DepartmentService.getColleges();
      return res.status(200).json({ success: true, data: colleges });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  public static async getDepartments(req: AuthRequest, res: Response) {
    try {
      const { collegeId, activeOnly } = req.query;
      const departments = await DepartmentService.getDepartments({
        collegeId: collegeId ? String(collegeId) : undefined,
        activeOnly: activeOnly === 'true',
      });
      return res.status(200).json({ success: true, data: departments });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  public static async createDepartment(req: AuthRequest, res: Response) {
    try {
      const { code, name, collegeId, active } = req.body;
      if (!code || !name) {
        return res.status(400).json({ success: false, message: 'Department code and name are required' });
      }

      const department = await DepartmentService.createDepartment({
        code,
        name,
        collegeId,
        active,
      });

      await AuditLogger.log({
        userId: req.user?.id,
        action: 'CREATE_DEPARTMENT',
        resource: 'Department',
        details: `Department "${name}" (${code}) created for college "${collegeId || 'citchennai'}"`,
        ipAddress: req.ip,
      });

      return res.status(201).json({ success: true, message: 'Department created successfully', data: department });
    } catch (error: any) {
      return res.status(400).json({ success: false, message: error.message });
    }
  }

  public static async updateDepartment(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const { code, name, collegeId, active } = req.body;

      const department = await DepartmentService.updateDepartment(id, {
        code,
        name,
        collegeId,
        active,
      });

      await AuditLogger.log({
        userId: req.user?.id,
        action: 'UPDATE_DEPARTMENT',
        resource: 'Department',
        details: `Department "${id}" updated`,
        ipAddress: req.ip,
      });

      return res.status(200).json({ success: true, message: 'Department updated successfully', data: department });
    } catch (error: any) {
      return res.status(400).json({ success: false, message: error.message });
    }
  }

  public static async deleteDepartment(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      await DepartmentService.deleteDepartment(id);

      await AuditLogger.log({
        userId: req.user?.id,
        action: 'DELETE_DEPARTMENT',
        resource: 'Department',
        details: `Department "${id}" deleted`,
        ipAddress: req.ip,
      });

      return res.status(200).json({ success: true, message: 'Department deleted successfully' });
    } catch (error: any) {
      return res.status(400).json({ success: false, message: error.message });
    }
  }
}


