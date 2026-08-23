import { prisma } from '../../../config/prisma';
import { AdminController } from '../../../controllers/adminController';

describe('Admin Delete Safety & Foreign Key Protection Tests', () => {
  let facultyUser: any;

  beforeAll(async () => {
    facultyUser = await prisma.user.upsert({
      where: { email: 'delete_safety_faculty@cit.edu.in' },
      update: {},
      create: {
        name: 'Delete Safety Faculty',
        email: 'delete_safety_faculty@cit.edu.in',
        role: 'FACULTY',
        department: 'CSE',
      },
    });
  });

  afterAll(async () => {
    await prisma.question.deleteMany({ where: { createdById: facultyUser.id } });
    await prisma.user.deleteMany({ where: { id: facultyUser.id } });
  });

  it('should handle question delete race safely with deleteMany returning zero count', async () => {
    const fakeQuestionId = '00000000-0000-0000-0000-000000000000';
    const req: any = {
      params: { id: fakeQuestionId },
      user: { id: facultyUser.id, role: 'ADMIN' },
      ip: '127.0.0.1',
    };

    let responseCode = 0;
    let responseBody: any = null;

    const res: any = {
      status: (code: number) => {
        responseCode = code;
        return {
          json: (body: any) => {
            responseBody = body;
          },
        };
      },
    };

    await AdminController.deleteQuestion(req, res);

    expect(responseCode).toBe(404);
    expect(responseBody?.code).toBe('QUESTION_NOT_FOUND');
  });

  it('should prevent deletion of user with dependent Question records and return USER_HAS_DEPENDENT_RECORDS', async () => {
    // Create a subtopic for testing
    const subtopic = await prisma.subtopic.findFirst();
    if (!subtopic) return;

    // Create a question owned by facultyUser
    const question = await prisma.question.create({
      data: {
        text: 'Delete Safety Test Question',
        type: 'MCQ',
        difficulty: 'MEDIUM',
        marks: 1,
        negativeMarks: 0.33,
        options: [{ text: 'A' }, { text: 'B' }],
        correctAnswer: [0],
        subtopicId: subtopic.id,
        createdById: facultyUser.id,
      },
    });

    const req: any = {
      params: { id: facultyUser.id },
      user: { id: facultyUser.id, role: 'ADMIN' },
      ip: '127.0.0.1',
    };

    let responseCode = 0;
    let responseBody: any = null;

    const res: any = {
      status: (code: number) => {
        responseCode = code;
        return {
          json: (body: any) => {
            responseBody = body;
          },
        };
      },
    };

    await AdminController.deleteFaculty(req, res);

    expect(responseCode).toBe(400);
    expect(responseBody?.code).toBe('USER_HAS_DEPENDENT_RECORDS');
    expect(responseBody?.summary?.questions).toBeGreaterThan(0);

    // Clean up created question
    await prisma.question.delete({ where: { id: question.id } });
  });
});
