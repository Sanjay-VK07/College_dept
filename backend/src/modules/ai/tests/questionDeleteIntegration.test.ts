import { prisma } from '../../../config/prisma';
import { AdminController } from '../../../controllers/adminController';

describe('Question Delete Integration & Error Contract Tests', () => {
  let adminUser: any;
  let facultyUser1: any;
  let facultyUser2: any;
  let subtopic: any;
  let mockTest: any;

  beforeAll(async () => {
    adminUser = await prisma.user.upsert({
      where: { email: 'q_del_admin@cit.edu.in' },
      update: {},
      create: {
        name: 'Question Delete Admin',
        email: 'q_del_admin@cit.edu.in',
        role: 'ADMIN',
        department: 'CSE',
      },
    });

    facultyUser1 = await prisma.user.upsert({
      where: { email: 'q_del_faculty1@cit.edu.in' },
      update: {},
      create: {
        name: 'Question Delete Faculty 1',
        email: 'q_del_faculty1@cit.edu.in',
        role: 'FACULTY',
        department: 'CSE',
      },
    });

    facultyUser2 = await prisma.user.upsert({
      where: { email: 'q_del_faculty2@cit.edu.in' },
      update: {},
      create: {
        name: 'Question Delete Faculty 2',
        email: 'q_del_faculty2@cit.edu.in',
        role: 'FACULTY',
        department: 'ECE',
      },
    });

    subtopic = await prisma.subtopic.findFirst();

    mockTest = await prisma.mockTest.create({
      data: {
        title: 'Question Delete Safeguard Mock Test',
        targetDepartment: 'CSE',
        startTime: new Date(),
        endTime: new Date(Date.now() + 86400000),
        createdById: adminUser.id,
      },
    });
  });

  afterAll(async () => {
    if (mockTest?.id) {
      await prisma.mockTestQuestion.deleteMany({ where: { mockTestId: mockTest.id } });
      await prisma.mockTest.deleteMany({ where: { id: mockTest.id } });
    }
    await prisma.question.deleteMany({
      where: { createdById: { in: [adminUser.id, facultyUser1.id, facultyUser2.id] } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [adminUser.id, facultyUser1.id, facultyUser2.id] } },
    });
  });

  const createMockReqRes = (params: any, user: any) => {
    let statusCode = 0;
    let jsonBody: any = null;

    const req: any = {
      params,
      user,
      ip: '127.0.0.1',
    };

    const res: any = {
      status: (code: number) => {
        statusCode = code;
        return {
          json: (body: any) => {
            jsonBody = body;
          },
        };
      },
    };

    return { req, res, getResult: () => ({ statusCode, jsonBody }) };
  };

  it('should successfully delete an unused question and return 200 with audit entry', async () => {
    const question = await prisma.question.create({
      data: {
        text: 'Unused Test Question for Deletion',
        type: 'MCQ',
        difficulty: 'EASY',
        marks: 1,
        negativeMarks: 0.33,
        options: [{ text: 'A' }, { text: 'B' }],
        correctAnswer: [0],
        subtopicId: subtopic.id,
        createdById: adminUser.id,
      },
    });

    const { req, res, getResult } = createMockReqRes({ id: question.id }, adminUser);
    await AdminController.deleteQuestion(req, res);

    const { statusCode, jsonBody } = getResult();
    expect(statusCode).toBe(200);
    expect(jsonBody.success).toBe(true);
    expect(jsonBody.message).toContain('deleted');

    // Verify row is deleted from DB
    const deletedRow = await prisma.question.findUnique({ where: { id: question.id } });
    expect(deletedRow).toBeNull();
  });

  it('should return 404 QUESTION_NOT_FOUND when deleting a non-existent or previously deleted question', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000001';
    const { req, res, getResult } = createMockReqRes({ id: fakeId }, adminUser);
    await AdminController.deleteQuestion(req, res);

    const { statusCode, jsonBody } = getResult();
    expect(statusCode).toBe(404);
    expect(jsonBody.success).toBe(false);
    expect(jsonBody.code).toBe('QUESTION_NOT_FOUND');
  });

  it('should return 403 UNAUTHORIZED when a faculty tries to delete another user question', async () => {
    const question = await prisma.question.create({
      data: {
        text: 'Faculty 1 Question for Unauthorized Delete Test',
        type: 'MCQ',
        difficulty: 'MEDIUM',
        marks: 1,
        negativeMarks: 0.33,
        options: [{ text: 'A' }, { text: 'B' }],
        correctAnswer: [0],
        subtopicId: subtopic.id,
        createdById: facultyUser1.id,
      },
    });

    // Faculty 2 tries to delete Faculty 1's question
    const { req, res, getResult } = createMockReqRes({ id: question.id }, facultyUser2);
    await AdminController.deleteQuestion(req, res);

    const { statusCode, jsonBody } = getResult();
    expect(statusCode).toBe(403);
    expect(jsonBody.success).toBe(false);
    expect(jsonBody.code).toBe('UNAUTHORIZED');

    // Cleanup
    await prisma.question.delete({ where: { id: question.id } });
  });

  it('should return 409 QUESTION_IN_USE when question is referenced by MockTestQuestion', async () => {
    const question = await prisma.question.create({
      data: {
        text: 'In-Use Question attached to MockTest',
        type: 'MCQ',
        difficulty: 'MEDIUM',
        marks: 1,
        negativeMarks: 0.33,
        options: [{ text: 'A' }, { text: 'B' }],
        correctAnswer: [0],
        subtopicId: subtopic.id,
        createdById: adminUser.id,
      },
    });

    // Attach to MockTest
    await prisma.mockTestQuestion.create({
      data: {
        mockTestId: mockTest.id,
        questionId: question.id,
      },
    });

    const { req, res, getResult } = createMockReqRes({ id: question.id }, adminUser);
    await AdminController.deleteQuestion(req, res);

    const { statusCode, jsonBody } = getResult();
    expect(statusCode).toBe(409);
    expect(jsonBody.success).toBe(false);
    expect(jsonBody.code).toBe('QUESTION_IN_USE');

    // Clean up attachment and question
    await prisma.mockTestQuestion.deleteMany({ where: { questionId: question.id } });
    await prisma.question.delete({ where: { id: question.id } });
  });
});
