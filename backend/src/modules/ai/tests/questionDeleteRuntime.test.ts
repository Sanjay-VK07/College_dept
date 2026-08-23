import { prisma } from '../../../config/prisma';
import { AdminController } from '../../../controllers/adminController';

describe('Question Delete Runtime & Standardized Contract Tests', () => {
  let adminUser: any;
  let facultyUser1: any;
  let facultyUser2: any;
  let subtopic: any;
  let mockTest: any;

  beforeAll(async () => {
    adminUser = await prisma.user.upsert({
      where: { email: 'runtime_del_admin@cit.edu.in' },
      update: {},
      create: {
        name: 'Runtime Delete Admin',
        email: 'runtime_del_admin@cit.edu.in',
        role: 'ADMIN',
        department: 'CSE',
      },
    });

    facultyUser1 = await prisma.user.upsert({
      where: { email: 'runtime_del_faculty1@cit.edu.in' },
      update: {},
      create: {
        name: 'Runtime Delete Faculty 1',
        email: 'runtime_del_faculty1@cit.edu.in',
        role: 'FACULTY',
        department: 'CSE',
      },
    });

    facultyUser2 = await prisma.user.upsert({
      where: { email: 'runtime_del_faculty2@cit.edu.in' },
      update: {},
      create: {
        name: 'Runtime Delete Faculty 2',
        email: 'runtime_del_faculty2@cit.edu.in',
        role: 'FACULTY',
        department: 'ECE',
      },
    });

    subtopic = await prisma.subtopic.findFirst();

    mockTest = await prisma.mockTest.create({
      data: {
        title: 'Runtime Question Delete Mock Test',
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

  it('CASE 1: Delete unused question -> returns 200 QUESTION_DELETED with data object', async () => {
    const question = await prisma.question.create({
      data: {
        text: 'Unused Question for Runtime Test',
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
    expect(jsonBody.code).toBe('QUESTION_DELETED');
    expect(jsonBody.data?.id).toBe(question.id);
  });

  it('CASE 2: Delete same question twice -> returns 404 QUESTION_NOT_FOUND', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000099';
    const { req, res, getResult } = createMockReqRes({ id: fakeId }, adminUser);
    await AdminController.deleteQuestion(req, res);

    const { statusCode, jsonBody } = getResult();
    expect(statusCode).toBe(404);
    expect(jsonBody.success).toBe(false);
    expect(jsonBody.code).toBe('QUESTION_NOT_FOUND');
  });

  it('CASE 3: Question referenced by MockTestQuestion -> returns 409 QUESTION_IN_USE', async () => {
    const question = await prisma.question.create({
      data: {
        text: 'In-Use Question in MockTest',
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

    await prisma.mockTestQuestion.deleteMany({ where: { questionId: question.id } });
    await prisma.question.delete({ where: { id: question.id } });
  });

  it('CASE 4: Question referenced by AISolution -> returns 409 QUESTION_IN_USE', async () => {
    const question = await prisma.question.create({
      data: {
        text: 'Question with AI Solution attached',
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

    await prisma.aISolution.create({
      data: {
        questionId: question.id,
        generationRequestId: `sol_req_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        draftAnswer: [0],
        draftExplanation: 'Draft explanation text',
        generatedById: adminUser.id,
      },
    });

    const { req, res, getResult } = createMockReqRes({ id: question.id }, adminUser);
    await AdminController.deleteQuestion(req, res);

    const { statusCode, jsonBody } = getResult();
    expect(statusCode).toBe(409);
    expect(jsonBody.success).toBe(false);
    expect(jsonBody.code).toBe('QUESTION_IN_USE');

    await prisma.aISolution.deleteMany({ where: { questionId: question.id } });
    await prisma.question.delete({ where: { id: question.id } });
  });

  it('CASE 5: Unauthorized delete attempt by another faculty -> returns 403 UNAUTHORIZED', async () => {
    const question = await prisma.question.create({
      data: {
        text: 'Faculty 1 Question for Unauthorized Test',
        type: 'MCQ',
        difficulty: 'EASY',
        marks: 1,
        negativeMarks: 0.33,
        options: [{ text: 'A' }, { text: 'B' }],
        correctAnswer: [0],
        subtopicId: subtopic.id,
        createdById: facultyUser1.id,
      },
    });

    const { req, res, getResult } = createMockReqRes({ id: question.id }, facultyUser2);
    await AdminController.deleteQuestion(req, res);

    const { statusCode, jsonBody } = getResult();
    expect(statusCode).toBe(403);
    expect(jsonBody.success).toBe(false);
    expect(jsonBody.code).toBe('UNAUTHORIZED');

    await prisma.question.delete({ where: { id: question.id } });
  });
});
