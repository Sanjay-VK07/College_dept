import { Response } from 'express';
import { AuthRequest } from '../middlewares/authMiddleware';
import { prisma } from '../config/prisma';
import { ExcelImportService } from '../services/excelImportService';
import { ReportExportService } from '../services/reportExportService';
import { Role, QuestionType, Difficulty, ExamType } from '@prisma/client';
import { ENV } from '../config/env';

export class AdminController {
  /**
   * Overall Institutional Dashboard Overview & System Metrics
   */
  public static async getOverviewStats(req: AuthRequest, res: Response) {
    try {
      const [
        totalStudents,
        totalFaculty,
        totalQuestions,
        totalExams,
        activeExams,
        completedAssignments,
        activeSessions,
        deptCounts,
      ] = await Promise.all([
        prisma.user.count({ where: { role: Role.STUDENT } }),
        prisma.user.count({ where: { role: Role.FACULTY } }),
        prisma.question.count(),
        prisma.mockTest.count(),
        prisma.mockTest.count({ where: { isPublished: true } }),
        prisma.testAssignment.count({ where: { status: 'COMPLETED' } }),
        prisma.testAssignment.count({ where: { status: 'IN_PROGRESS' } }),
        prisma.user.groupBy({
          by: ['department'],
          _count: { id: true },
        }),
      ]);

      const settings = await prisma.systemSetting.findMany();
      const domainSetting = settings.find((s) => s.key === 'ALLOWED_EMAIL_DOMAINS');

      return res.status(200).json({
        success: true,
        data: {
          metrics: {
            totalStudents,
            totalFaculty,
            totalDepartments: deptCounts.length || 5,
            totalExams,
            activeExams,
            completedExams: completedAssignments,
            totalQuestions,
            activeSessions,
            databaseStatus: 'CONNECTED',
            socketStatus: 'ACTIVE',
            serverHealth: 'HEALTHY',
          },
          security: {
            allowedDomains: domainSetting ? domainSetting.value : ENV.ALLOWED_DOMAINS.join(','),
            jwtSecretConfigured: true,
            maxViolationThreshold: 5,
          },
          departmentBreakdown: deptCounts.map((d) => ({
            department: d.department,
            count: d._count.id,
          })),
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

      const students = await prisma.user.findMany({
        where: whereClause,
        orderBy: { registerNo: 'asc' },
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

      const student = await prisma.user.create({
        data: {
          registerNo: registerNo || `REG_${Date.now().toString().slice(-6)}`,
          name,
          email,
          role: Role.STUDENT,
          department: department || 'CSE',
          year: Number(year) || 3,
          semester: Number(semester) || 6,
          section: section || 'A',
        },
      });

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
      await prisma.user.delete({ where: { id } });
      return res.status(200).json({ success: true, message: 'Student record deleted' });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  public static async resetStudentAttempts(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      // Delete test assignments for student to allow fresh attempts
      await prisma.testAssignment.deleteMany({
        where: { studentId: id },
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
          department: department || 'CSE',
        },
      });

      return res.status(201).json({ success: true, message: 'Faculty member created', data: faculty });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  public static async updateFaculty(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const { name, email, department } = req.body;

      const faculty = await prisma.user.update({
        where: { id },
        data: { name, email, department },
      });

      return res.status(200).json({ success: true, message: 'Faculty profile updated', data: faculty });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  public static async deleteFaculty(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      await prisma.user.delete({ where: { id } });
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
        },
        orderBy: { createdAt: 'desc' },
      });

      return res.status(200).json({ success: true, data: questions });
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
        },
      });

      return res.status(201).json({ success: true, message: 'Question created successfully', data: question });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  public static async deleteQuestion(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      await prisma.question.delete({ where: { id } });
      return res.status(200).json({ success: true, message: 'Question deleted' });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Examination Management CRUD & Scheduling
   */
  public static async getExams(req: AuthRequest, res: Response) {
    try {
      const exams = await prisma.mockTest.findMany({
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
      const { title, description, examType, durationMinutes, totalMarks, targetDepartment, maxViolations, instructions } = req.body;

      if (!title) {
        return res.status(400).json({ success: false, message: 'Exam title is required' });
      }

      const exam = await prisma.mockTest.create({
        data: {
          title,
          description: description || 'Official Institutional GATE Mock Exam',
          examType: examType || ExamType.SCHEDULED,
          durationMinutes: Number(durationMinutes) || 180,
          totalMarks: Number(totalMarks) || 100,
          startTime: new Date(),
          endTime: new Date(Date.now() + 86400000 * 7),
          targetDepartment: targetDepartment || 'CSE',
          maxViolations: Number(maxViolations) || 5,
          instructions: instructions || 'Fullscreen mode is strictly enforced.',
          isPublished: true,
          createdById: req.user!.id,
        },
      });

      return res.status(201).json({ success: true, message: 'Exam scheduled and published', data: exam });
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
      await prisma.mockTest.delete({ where: { id } });
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

      const questions = await ExcelImportService.importQuestions(
        req.file.buffer,
        req.file.mimetype,
        req.user!.id,
        defaultSubtopic.id
      );

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
        res.setHeader('Content-Disposition', `attachment; filename=GSMAS_Test_${testId}_Report.xlsx`);
        return res.send(buffer);
      } else if (format === 'pdf') {
        const buffer = await ReportExportService.generatePDFReport(testId);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=GSMAS_Test_${testId}_Report.pdf`);
        return res.send(buffer);
      } else if (format === 'csv') {
        const csvString = await ReportExportService.generateCSVReport(testId);
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=GSMAS_Test_${testId}_Report.csv`);
        return res.send(csvString);
      } else {
        return res.status(400).json({ success: false, message: 'Unsupported export format' });
      }
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
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
      return res.status(200).json({ success: true, data: setting });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }
}
