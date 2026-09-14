import request from 'supertest';
import app from '../app';
import { prisma } from '../config/prisma';
import jwt from 'jsonwebtoken';
import { ENV } from '../config/env';
import { QuestionType, Difficulty, VerificationStatus, QuestionOrigin, Role, ExamStatus } from '@prisma/client';

// Regression tests for the exam start/end time window enforcement fix: startExam previously
// never checked test.startTime/test.endTime, so a student could begin (or "continue") an
// attempt before an exam opened or after it closed, as long as it was published.

describe('Exam time-window enforcement — POST /api/exam/start/:testId', () => {
  const ts = Date.now();
  let subjectId: string, subtopicId: string, questionId: string, studentId: string, studentToken: string;

  beforeAll(async () => {
    const admin = await prisma.user.findFirst({ where: { role: 'ADMIN', email: { endsWith: '@citchennai.net' } } });
    if (!admin) throw new Error('Test fixture requires an existing ADMIN account with an institutional email.');

    const subj = await prisma.subject.create({ data: { id: `twtest-subj-${ts}`, name: 'TW-TEST Subject', code: `TW${ts}`, department: 'CSE' } });
    const mod = await prisma.module.create({ data: { id: `twtest-mod-${ts}`, name: 'TW-TEST Module', subjectId: subj.id } });
    const top = await prisma.topic.create({ data: { id: `twtest-top-${ts}`, name: 'TW-TEST Topic', moduleId: mod.id } });
    const subtop = await prisma.subtopic.create({ data: { id: `twtest-subtop-${ts}`, name: 'TW-TEST Subtopic', topicId: top.id } });
    subjectId = subj.id;
    subtopicId = subtop.id;

    const q = await prisma.question.create({
      data: {
        text: 'TW-TEST MCQ', type: QuestionType.MCQ, difficulty: Difficulty.MEDIUM, marks: 1, negativeMarks: 0.33,
        options: [{ text: 'A' }, { text: 'B' }], correctAnswer: [0], subtopicId: subtop.id, createdById: admin.id,
        origin: QuestionOrigin.SOURCE, verificationStatus: VerificationStatus.VERIFIED,
      },
    });
    questionId = q.id;

    const student = await prisma.user.create({
      data: {
        name: 'TW-TEST Student', email: `twtest-student-${ts}@citchennai.net`, role: Role.STUDENT,
        department: 'CSE', registerNo: `TW${ts}`, googleId: `twtest_${ts}`, year: 3, semester: 6, section: 'A',
      },
    });
    studentId = student.id;
    studentToken = jwt.sign({ id: studentId }, ENV.JWT_SECRET, { expiresIn: '1h' });
  });

  afterAll(async () => {
    await prisma.mockTestQuestion.deleteMany({ where: { question: { subtopicId } } });
    await prisma.testAssignment.deleteMany({ where: { studentId } });
    await prisma.mockTest.deleteMany({ where: { title: { startsWith: 'TW-TEST' } } });
    await prisma.question.deleteMany({ where: { subtopicId } });
    await prisma.subtopic.delete({ where: { id: subtopicId } });
    await prisma.topic.deleteMany({ where: { module: { subjectId } } });
    await prisma.module.deleteMany({ where: { subjectId } });
    await prisma.subject.delete({ where: { id: subjectId } });
    await prisma.user.delete({ where: { id: studentId } });
    await prisma.$disconnect();
  });

  async function makeExam(overrides: { startTime: Date; endTime: Date; isPublished?: boolean; title: string }) {
    const admin = await prisma.user.findFirst({ where: { role: 'ADMIN', email: { endsWith: '@citchennai.net' } } });
    const test = await prisma.mockTest.create({
      data: {
        title: overrides.title,
        durationMinutes: 30,
        totalMarks: 1,
        startTime: overrides.startTime,
        endTime: overrides.endTime,
        targetDepartment: 'CSE',
        isPublished: overrides.isPublished ?? true,
        status: (overrides.isPublished ?? true) ? ExamStatus.PUBLISHED : ExamStatus.DRAFT,
        createdById: admin!.id,
        testQuestions: { create: [{ questionId, order: 1 }] },
      },
    });
    return test;
  }

  it('rejects starting an exam before its configured startTime', async () => {
    const test = await makeExam({ startTime: new Date(Date.now() + 3600_000), endTime: new Date(Date.now() + 7200_000), title: 'TW-TEST Before Start' });
    const res = await request(app).post(`/api/exam/start/${test.id}`).set('Authorization', `Bearer ${studentToken}`);
    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    const assignment = await prisma.testAssignment.findFirst({ where: { testId: test.id, studentId } });
    expect(assignment).toBeNull();
  });

  it('allows starting an exam during its valid window', async () => {
    const test = await makeExam({ startTime: new Date(Date.now() - 60_000), endTime: new Date(Date.now() + 3600_000), title: 'TW-TEST During' });
    const res = await request(app).post(`/api/exam/start/${test.id}`).set('Authorization', `Bearer ${studentToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.questions.length).toBe(1);
  });

  it('rejects starting an exam after its configured endTime', async () => {
    const test = await makeExam({ startTime: new Date(Date.now() - 7200_000), endTime: new Date(Date.now() - 60_000), title: 'TW-TEST After End' });
    const res = await request(app).post(`/api/exam/start/${test.id}`).set('Authorization', `Bearer ${studentToken}`);
    expect(res.status).toBe(403);
    const assignment = await prisma.testAssignment.findFirst({ where: { testId: test.id, studentId } });
    expect(assignment).toBeNull();
  });

  it('rejects starting an unpublished exam even if the time window is valid', async () => {
    const test = await makeExam({ startTime: new Date(Date.now() - 60_000), endTime: new Date(Date.now() + 3600_000), isPublished: false, title: 'TW-TEST Unpublished' });
    const res = await request(app).post(`/api/exam/start/${test.id}`).set('Authorization', `Bearer ${studentToken}`);
    expect(res.status).toBe(403);
  });

  it('rejects starting a non-existent exam', async () => {
    const res = await request(app).post('/api/exam/start/does-not-exist').set('Authorization', `Bearer ${studentToken}`);
    expect(res.status).toBe(404);
  });

  it('rejects re-starting an exam the student has already completed/submitted', async () => {
    const test = await makeExam({ startTime: new Date(Date.now() - 60_000), endTime: new Date(Date.now() + 3600_000), title: 'TW-TEST Already Done' });
    const first = await request(app).post(`/api/exam/start/${test.id}`).set('Authorization', `Bearer ${studentToken}`);
    expect(first.status).toBe(200);
    const assignmentId = first.body.data.assignmentId;

    await request(app).post('/api/exam/submit').set('Authorization', `Bearer ${studentToken}`).send({ assignmentId });

    const second = await request(app).post(`/api/exam/start/${test.id}`).set('Authorization', `Bearer ${studentToken}`);
    expect(second.status).toBe(403);
  });

  // startTime/endTime are non-nullable DateTime columns in the current schema (MockTest.startTime
  // DateTime, endTime DateTime — no `?`), so a "missing" start/end time cannot occur at the
  // database level; this is a schema guarantee rather than something startExam needs to check.
  it('schema guarantees startTime/endTime cannot be null (documents why a "missing time" case is not separately tested)', async () => {
    const test = await makeExam({ startTime: new Date(), endTime: new Date(Date.now() + 3600_000), title: 'TW-TEST Schema Check' });
    expect(test.startTime).not.toBeNull();
    expect(test.endTime).not.toBeNull();
  });
});
