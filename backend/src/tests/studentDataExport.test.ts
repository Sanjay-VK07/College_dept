import { IntentService } from '../modules/ai/services/intentService';
import { StudentDataExportService } from '../services/studentDataExportService';
import { AdminController } from '../controllers/adminController';
import { AIChatService } from '../modules/ai/services/aiChatService';
import { prisma } from '../config/prisma';
import { Role } from '@prisma/client';
import xlsx from 'xlsx';

// Mock prisma
jest.mock('../config/prisma', () => ({
  prisma: {
    user: {
      count: jest.fn(),
      findMany: jest.fn(),
    },
    aIConversation: {
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    aIMessage: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    aIRAGTrace: {
      create: jest.fn(),
      upsert: jest.fn(),
    },
  },
}));

// Mock ConversationService methods used in AIChatService
jest.mock('../modules/ai/services/conversationService', () => ({
  ConversationService: {
    findUserMessageByRequestId: jest.fn().mockResolvedValue(null),
    getOrCreateConversation: jest.fn().mockResolvedValue({ id: 'conv-123', title: 'Consultation' }),
    saveUserMessage: jest.fn().mockResolvedValue({ id: 'user-msg-123' }),
    saveAssistantMessage: jest.fn().mockImplementation((convId, parentId, content) => {
      return Promise.resolve({
        id: 'assistant-msg-123',
        role: 'ASSISTANT',
        content,
        createdAt: new Date(),
      });
    }),
  },
}));

describe('Export Student Data to Excel Feature Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('1. Intent Detection (IntentService)', () => {
    it('should accurately detect EXPORT_STUDENT_DATA intent for required user prompts', () => {
      const requiredPrompts = [
        'Download student data',
        'Export students to Excel',
        'Give me the student details in Excel',
        'Download all student records',
        'export student records to excel',
        'download student excel sheet',
        'export student list',
        'export students to xlsx',
      ];

      for (const prompt of requiredPrompts) {
        const intent = IntentService.classifyIntent(prompt);
        expect(intent).toBe('EXPORT_STUDENT_DATA');
      }
    });

    it('should NOT trigger EXPORT_STUDENT_DATA for queries without export intent', () => {
      const nonExportPrompts = [
        'How many students are registered?',
        'What is Dijkstra algorithm?',
        'When is my next exam?',
        'Show my results',
        'Explain virtual calculator rules',
      ];

      for (const prompt of nonExportPrompts) {
        const intent = IntentService.classifyIntent(prompt);
        expect(intent).not.toBe('EXPORT_STUDENT_DATA');
      }
    });
  });

  describe('2. Level 1 Chatbot Authorization (AIChatService)', () => {
    it('should reject non-admin users with an unauthorized refusal message and no action payload', async () => {
      const result = await AIChatService.processChatMessage(
        'student-user-id',
        Role.STUDENT,
        'Export students to Excel'
      );

      expect(result.success).toBe(true);
      expect(result.type).toBe('UNAUTHORIZED_ACTION');
      expect(result.message?.content).toContain('Access Denied: Only administrators have permission');
      expect(result.action).toBeUndefined();
    });

    it('should reject faculty users with an unauthorized refusal message', async () => {
      const result = await AIChatService.processChatMessage(
        'faculty-user-id',
        Role.FACULTY,
        'Download student data'
      );

      expect(result.success).toBe(true);
      expect(result.type).toBe('UNAUTHORIZED_ACTION');
      expect(result.message?.content).toContain('Access Denied');
      expect(result.action).toBeUndefined();
    });

    it('should approve Admin users and return structured action payload and clear message', async () => {
      (prisma.user.count as jest.Mock).mockResolvedValueOnce(5);

      const result = await AIChatService.processChatMessage(
        'admin-user-id',
        Role.ADMIN,
        'Download student data'
      );

      expect(result.success).toBe(true);
      expect(result.type).toBe('EXPORT_READY');
      expect(result.message?.content).toBe(
        'Student data export is ready. Click the button below to download the Excel file.'
      );
      expect(result.action).toBeDefined();
      expect(result.action?.type).toBe('DOWNLOAD_STUDENT_EXCEL');
      expect(result.action?.downloadUrl).toBe('/api/admin/export-students');
      expect(result.action?.fileName).toMatch(/^student_data_\d{4}-\d{2}-\d{2}\.xlsx$/);
    });

    it('should handle zero student records gracefully in chatbot', async () => {
      (prisma.user.count as jest.Mock).mockResolvedValueOnce(0);

      const result = await AIChatService.processChatMessage(
        'admin-user-id',
        Role.ADMIN,
        'Download all student records'
      );

      expect(result.success).toBe(true);
      expect(result.type).toBe('NO_DATA');
      expect(result.message?.content).toContain('no student records in the database to export');
      expect(result.action).toBeUndefined();
    });
  });

  describe('3. Level 2 API Route (AdminController.exportStudentsExcel)', () => {
    it('should generate and stream Excel buffer with proper headers and date-based filename', async () => {
      const fakeBuffer = Buffer.from('mock-excel-content');
      jest.spyOn(StudentDataExportService, 'generateExcel').mockResolvedValueOnce(fakeBuffer);

      const req: any = {
        user: { id: 'admin-id', role: Role.ADMIN },
      };
      const res: any = {
        setHeader: jest.fn(),
        send: jest.fn(),
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };

      await AdminController.exportStudentsExcel(req, res);

      expect(res.setHeader).toHaveBeenCalledWith(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      expect(res.setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        expect.stringMatching(/^attachment; filename="student_data_\d{4}-\d{2}-\d{2}\.xlsx"$/)
      );
      expect(res.send).toHaveBeenCalledWith(fakeBuffer);
    });

    it('should handle export generation errors gracefully with 500 status', async () => {
      jest.spyOn(StudentDataExportService, 'generateExcel').mockRejectedValueOnce(
        new Error('Database query failure')
      );

      const req: any = {
        user: { id: 'admin-id', role: Role.ADMIN },
      };
      const res: any = {
        setHeader: jest.fn(),
        send: jest.fn(),
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };

      await AdminController.exportStudentsExcel(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, message: 'Database query failure' })
      );
    });
  });

  describe('4. Excel Generation Service & Strict DTO (StudentDataExportService)', () => {
    it('should produce a valid .xlsx buffer containing calculated metrics and whitelisted columns', async () => {
      const mockStudents = [
        {
          id: 'stud-1',
          registerNo: 'CS2026001',
          name: 'Rahul Sharma',
          email: 'rahul@college.edu',
          department: 'Computer Science and Engineering',
          year: 3,
          semester: 6,
          section: 'A',
          createdAt: new Date('2026-01-15T10:00:00Z'),
          assignments: [
            {
              id: 'assign-1',
              status: 'COMPLETED',
              score: 75.5,
              totalMarks: 100,
              accuracy: 82.0,
              test: { id: 't1', title: 'Algorithms Test', totalMarks: 100 },
            },
            {
              id: 'assign-2',
              status: 'COMPLETED',
              score: 85.0,
              totalMarks: 100,
              accuracy: 90.0,
              test: { id: 't2', title: 'Data Structures Test', totalMarks: 100 },
            },
            {
              id: 'assign-3',
              status: 'SCHEDULED',
              score: null,
              totalMarks: 100,
              accuracy: null,
              test: { id: 't3', title: 'DBMS Test', totalMarks: 100 },
            },
          ],
          aiPracticeAttempts: [
            { id: 'p1', score: 10, totalMarks: 10 },
            { id: 'p2', score: 8, totalMarks: 10 },
          ],
        },
      ];

      (prisma.user.findMany as jest.Mock).mockResolvedValueOnce(mockStudents);

      const buffer = await StudentDataExportService.generateExcel();
      expect(buffer).toBeInstanceOf(Buffer);

      // Parse the generated workbook
      const workbook = xlsx.read(buffer, { type: 'buffer' });
      expect(workbook.SheetNames).toContain('Students');

      const worksheet = workbook.Sheets['Students'];
      const data: any[] = xlsx.utils.sheet_to_json(worksheet);

      expect(data).toHaveLength(1);
      const row = data[0];

      expect(row['Student ID']).toBe('CS2026001');
      expect(row['Student Name']).toBe('Rahul Sharma');
      expect(row['Email']).toBe('rahul@college.edu');
      expect(row['Phone Number']).toBe('N/A');
      expect(row['Course / Branch']).toBe('Computer Science and Engineering');
      expect(row['Year']).toBe('Year 3');
      expect(row['Semester']).toBe('Sem 6');
      expect(row['Section']).toBe('A');
      expect(row['Registration Date']).toBe('2026-01-15');
      expect(row['Total Exams Assigned']).toBe(3);
      expect(row['Completed Exams']).toBe(2);
      // Progress = 2 / 3 * 100 = 67%
      expect(row['Progress (%)']).toBe('67%');
      // Best Score = max(75.5, 85.0) = 85.00
      expect(row['Best Mock Score']).toBe('85.00');
      // Average Score = (75.5 + 85.0) / 2 = 80.25
      expect(row['Average Mock Score']).toBe('80.25');
      // Average Accuracy = (82.0 + 90.0) / 2 = 86.0%
      expect(row['Average Accuracy (%)']).toBe('86.0%');
      expect(row['Practice Attempts']).toBe(2);

      // Ensure no sensitive fields leaked
      expect(row).not.toHaveProperty('passwordHash');
      expect(row).not.toHaveProperty('sessionId');
      expect(row).not.toHaveProperty('fingerprint');
    });

    it('should generate a valid workbook with empty notification when no students exist', async () => {
      (prisma.user.findMany as jest.Mock).mockResolvedValueOnce([]);

      const buffer = await StudentDataExportService.generateExcel();
      expect(buffer).toBeInstanceOf(Buffer);

      const workbook = xlsx.read(buffer, { type: 'buffer' });
      const worksheet = workbook.Sheets['Students'];
      const data: any[] = xlsx.utils.sheet_to_json(worksheet);

      expect(data).toHaveLength(1);
      expect(data[0]['Student ID']).toContain('No student records found');
    });
  });
});
