import { AdminController } from '../controllers/adminController';
import { prisma } from '../config/prisma';
import { Role, QuestionType, Difficulty, ExamType, ExamStatus } from '@prisma/client';

/**
 * Minimal Express req/res doubles — this codebase's test suite exercises real Prisma against
 * the real DB but has no HTTP-level test harness (no supertest), so controllers are invoked
 * directly with the same shape authenticateJWT/requireRoles would leave on `req` after passing.
 */
function mockReq(overrides: Partial<{ user: { id: string; role: Role }; body: any; ip: string }>) {
  return {
    user: overrides.user,
    body: overrides.body ?? {},
    ip: overrides.ip ?? '127.0.0.1',
  } as any;
}

function mockRes() {
  const res: any = {};
  res.statusCode = 200;
  res.payload = null;
  res.status = jest.fn((code: number) => {
    res.statusCode = code;
    return res;
  });
  res.json = jest.fn((payload: any) => {
    res.payload = payload;
    return res;
  });
  return res;
}

describe('AdminController.bulkDeleteQuestions', () => {
  const facultyId = 'bulkdel-fac-' + Date.now();
  const otherFacultyId = 'bulkdel-fac2-' + Date.now();
  const adminId = 'bulkdel-admin-' + Date.now();
  const subjectId = 'bulkdel-subj-' + Date.now();
  const moduleId = 'bulkdel-mod-' + Date.now();
  const topicId = 'bulkdel-top-' + Date.now();
  const subtopicId = 'bulkdel-subtop-' + Date.now();

  const allCreatedQuestionIds: string[] = [];
  let publishedExamId: string;

  beforeAll(async () => {
    await prisma.user.create({
      data: { id: facultyId, name: 'Bulk Delete Faculty', email: `bulkdel_fac_${Date.now()}@cit.edu.in`, role: Role.FACULTY, department: 'CSE' },
    });
    await prisma.user.create({
      data: { id: otherFacultyId, name: 'Other Faculty', email: `bulkdel_fac2_${Date.now()}@cit.edu.in`, role: Role.FACULTY, department: 'CSE' },
    });
    await prisma.user.create({
      data: { id: adminId, name: 'Bulk Delete Admin', email: `bulkdel_admin_${Date.now()}@cit.edu.in`, role: Role.ADMIN, department: 'CSE' },
    });

    const subj = await prisma.subject.create({ data: { id: subjectId, name: 'Bulk Delete Subject', code: 'BD_' + Date.now(), department: 'CSE' } });
    const mod = await prisma.module.create({ data: { id: moduleId, name: 'Bulk Delete Module', subjectId: subj.id } });
    const top = await prisma.topic.create({ data: { id: topicId, name: 'Bulk Delete Topic', moduleId: mod.id } });
    await prisma.subtopic.create({ data: { id: subtopicId, name: 'Bulk Delete Subtopic', topicId: top.id } });
  });

  afterAll(async () => {
    if (publishedExamId) {
      await prisma.mockTestQuestion.deleteMany({ where: { mockTestId: publishedExamId } });
      await prisma.mockTest.deleteMany({ where: { id: publishedExamId } });
    }
    await prisma.question.deleteMany({ where: { id: { in: allCreatedQuestionIds } } });
    await prisma.subtopic.deleteMany({ where: { id: subtopicId } });
    await prisma.topic.deleteMany({ where: { id: topicId } });
    await prisma.module.deleteMany({ where: { id: moduleId } });
    await prisma.subject.deleteMany({ where: { id: subjectId } });
    await prisma.user.deleteMany({ where: { id: { in: [facultyId, otherFacultyId, adminId] } } });
  });

  async function createTestQuestion(createdById: string, text: string) {
    const q = await prisma.question.create({
      data: {
        text,
        type: QuestionType.MCQ,
        difficulty: Difficulty.MEDIUM,
        marks: 1.0,
        negativeMarks: 0.33,
        options: [{ text: 'A' }, { text: 'B' }, { text: 'C' }, { text: 'D' }],
        correctAnswer: [0],
        subtopicId,
        createdById,
      },
    });
    allCreatedQuestionIds.push(q.id);
    return q;
  }

  it('1. deletes one valid question through the bulk endpoint', async () => {
    const q = await createTestQuestion(facultyId, 'Bulk delete single question');
    const req = mockReq({ user: { id: facultyId, role: Role.FACULTY }, body: { questionIds: [q.id] } });
    const res = mockRes();

    await AdminController.bulkDeleteQuestions(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.payload.success).toBe(true);
    expect(res.payload.deletedCount).toBe(1);

    const stillExists = await prisma.question.findUnique({ where: { id: q.id } });
    expect(stillExists).toBeNull();
  });

  it('2. deletes multiple questions in one call', async () => {
    const q1 = await createTestQuestion(facultyId, 'Bulk multi 1');
    const q2 = await createTestQuestion(facultyId, 'Bulk multi 2');
    const q3 = await createTestQuestion(facultyId, 'Bulk multi 3');
    const req = mockReq({ user: { id: facultyId, role: Role.FACULTY }, body: { questionIds: [q1.id, q2.id, q3.id] } });
    const res = mockRes();

    await AdminController.bulkDeleteQuestions(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.payload.deletedCount).toBe(3);

    const remaining = await prisma.question.findMany({ where: { id: { in: [q1.id, q2.id, q3.id] } } });
    expect(remaining.length).toBe(0);
  });

  it('3. reports invalid/non-existent IDs without deleting or erroring', async () => {
    const fakeId = 'does-not-exist-' + Date.now();
    const req = mockReq({ user: { id: facultyId, role: Role.FACULTY }, body: { questionIds: [fakeId] } });
    const res = mockRes();

    await AdminController.bulkDeleteQuestions(req, res);

    expect(res.statusCode).toBe(409); // nothing was deletable
    expect(res.payload.success).toBe(false);
    expect(res.payload.deletedCount).toBe(0);
    expect(res.payload.notFoundIds).toContain(fakeId);
  });

  it('4. unauthorized: a Faculty user cannot bulk-delete another Faculty member\'s question', async () => {
    const q = await createTestQuestion(otherFacultyId, 'Owned by other faculty');
    const req = mockReq({ user: { id: facultyId, role: Role.FACULTY }, body: { questionIds: [q.id] } });
    const res = mockRes();

    await AdminController.bulkDeleteQuestions(req, res);

    expect(res.payload.deletedCount).toBe(0);
    expect(res.payload.forbiddenIds).toContain(q.id);

    const stillExists = await prisma.question.findUnique({ where: { id: q.id } });
    expect(stillExists).not.toBeNull();
  });

  it('5. rejects an empty questionIds array with a 400', async () => {
    const req = mockReq({ user: { id: facultyId, role: Role.FACULTY }, body: { questionIds: [] } });
    const res = mockRes();

    await AdminController.bulkDeleteQuestions(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.payload.success).toBe(false);
  });

  it('6. deduplicates duplicate IDs in the request instead of erroring or double-counting', async () => {
    const q = await createTestQuestion(facultyId, 'Bulk duplicate id test');
    const req = mockReq({ user: { id: facultyId, role: Role.FACULTY }, body: { questionIds: [q.id, q.id, q.id] } });
    const res = mockRes();

    await AdminController.bulkDeleteQuestions(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.payload.deletedCount).toBe(1);
  });

  it('7. blocks deletion of a question referenced by a published/active exam', async () => {
    const q = await createTestQuestion(adminId, 'Question used in a published exam');

    const exam = await prisma.mockTest.create({
      data: {
        title: 'Bulk Delete Published Exam',
        description: 'Test',
        examType: ExamType.SCHEDULED,
        durationMinutes: 60,
        totalMarks: 10,
        targetDepartment: 'CSE',
        status: ExamStatus.PUBLISHED,
        isPublished: true,
        createdById: adminId,
        startTime: new Date(),
        endTime: new Date(Date.now() + 86400000),
      },
    });
    publishedExamId = exam.id;

    await prisma.mockTestQuestion.create({ data: { mockTestId: exam.id, questionId: q.id, order: 1 } });

    const req = mockReq({ user: { id: adminId, role: Role.ADMIN }, body: { questionIds: [q.id] } });
    const res = mockRes();

    await AdminController.bulkDeleteQuestions(req, res);

    expect(res.payload.deletedCount).toBe(0);
    expect(res.payload.blockedIds).toContain(q.id);
    const blockedDetail = res.payload.blockedDetails.find((b: any) => b.id === q.id);
    expect(blockedDetail.hasActiveExam).toBe(true);

    const stillExists = await prisma.question.findUnique({ where: { id: q.id } });
    expect(stillExists).not.toBeNull();
  });

  it('8. does not pretend success when the delete transaction fails', async () => {
    const q = await createTestQuestion(facultyId, 'Transaction failure test');

    const txSpy = jest.spyOn(prisma, '$transaction').mockRejectedValueOnce(new Error('Simulated DB connection loss'));

    const req = mockReq({ user: { id: facultyId, role: Role.FACULTY }, body: { questionIds: [q.id] } });
    const res = mockRes();

    await AdminController.bulkDeleteQuestions(req, res);

    expect(res.statusCode).toBe(500);
    expect(res.payload.success).toBe(false);
    expect(res.payload.message).toContain('Simulated DB connection loss');

    txSpy.mockRestore();

    // The question must still exist — a failed transaction must not have deleted it.
    const stillExists = await prisma.question.findUnique({ where: { id: q.id } });
    expect(stillExists).not.toBeNull();
  });
});
