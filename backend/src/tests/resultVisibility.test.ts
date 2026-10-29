import request from 'supertest';
import app from '../app';
import { prisma } from '../config/prisma';
import jwt from 'jsonwebtoken';
import { ENV } from '../config/env';
import { QuestionType, Difficulty, VerificationStatus, QuestionOrigin, Role, ExamStatus, ResultVisibility } from '@prisma/client';

// Regression tests for resultVisibility enforcement. Previously the only reference to
// resultVisibility outside the schema was a dead pass-through field in submitExam's response —
// nothing ever read or branched on it, so every exam behaved as IMMEDIATE regardless of its
// configured mode.

describe('resultVisibility enforcement', () => {
  const ts = Date.now();
  let subjectId: string, subtopicId: string, questionId: string, adminId: string;
  const students: Record<string, { id: string; token: string }> = {};

  beforeAll(async () => {
    const admin = await prisma.user.findFirst({ where: { role: 'ADMIN', email: { endsWith: '@citchennai.net' } } });
    if (!admin) throw new Error('Test fixture requires an existing ADMIN account with an institutional email.');
    adminId = admin.id;

    const subj = await prisma.subject.create({ data: { id: `rvtest-subj-${ts}`, name: 'RV-TEST Subject', code: `RV${ts}`, department: 'CSE' } });
    const mod = await prisma.module.create({ data: { id: `rvtest-mod-${ts}`, name: 'RV-TEST Module', subjectId: subj.id } });
    const top = await prisma.topic.create({ data: { id: `rvtest-top-${ts}`, name: 'RV-TEST Topic', moduleId: mod.id } });
    const subtop = await prisma.subtopic.create({ data: { id: `rvtest-subtop-${ts}`, name: 'RV-TEST Subtopic', topicId: top.id } });
    subjectId = subj.id;
    subtopicId = subtop.id;

    const q = await prisma.question.create({
      data: {
        text: 'RV-TEST MCQ', type: QuestionType.MCQ, difficulty: Difficulty.MEDIUM, marks: 1, negativeMarks: 0.33,
        options: [{ text: 'A' }, { text: 'B' }], correctAnswer: [0], subtopicId: subtop.id, createdById: admin.id,
        origin: QuestionOrigin.SOURCE, verificationStatus: VerificationStatus.VERIFIED,
      },
    });
    questionId = q.id;

    for (const key of ['immediate', 'afterEnds', 'manual']) {
      const student = await prisma.user.create({
        data: {
          name: `RV-TEST Student ${key}`, email: `rvtest-${key}-${ts}@citchennai.net`, role: Role.STUDENT,
          department: 'CSE', registerNo: `RV${key}${ts}`, googleId: `rvtest_${key}_${ts}`, year: 3, semester: 6, section: 'A',
        },
      });
      students[key] = { id: student.id, token: jwt.sign({ id: student.id }, ENV.JWT_SECRET, { expiresIn: '1h' }) };
    }
  });

  afterAll(async () => {
    await prisma.mockTestQuestion.deleteMany({ where: { question: { subtopicId } } });
    await prisma.questionResponse.deleteMany({ where: { assignment: { student: { email: { contains: `rvtest-` } } } } });
    await prisma.testAssignment.deleteMany({ where: { student: { email: { contains: `rvtest-` } } } });
    await prisma.mockTest.deleteMany({ where: { title: { startsWith: 'RV-TEST' } } });
    await prisma.question.deleteMany({ where: { subtopicId } });
    await prisma.subtopic.delete({ where: { id: subtopicId } });
    await prisma.topic.deleteMany({ where: { module: { subjectId } } });
    await prisma.module.deleteMany({ where: { subjectId } });
    await prisma.subject.delete({ where: { id: subjectId } });
    await prisma.user.deleteMany({ where: { email: { contains: 'rvtest-' } } });
    await prisma.$disconnect();
  });

  async function makeExamAndAttempt(key: string, resultVisibility: ResultVisibility, opts: { endInPast?: boolean } = {}) {
    const test = await prisma.mockTest.create({
      data: {
        title: `RV-TEST ${key}`,
        durationMinutes: 30,
        totalMarks: 1,
        startTime: new Date(Date.now() - 3600_000),
        endTime: opts.endInPast ? new Date(Date.now() - 60_000) : new Date(Date.now() + 3600_000),
        targetDepartment: 'CSE',
        isPublished: true,
        status: ExamStatus.PUBLISHED,
        resultVisibility,
        createdById: adminId,
        testQuestions: { create: [{ questionId, order: 1 }] },
      },
    });
    const { token } = students[key];
    const startRes = await request(app).post(`/api/exam/start/${test.id}`).set('Authorization', `Bearer ${token}`);
    const assignmentId = startRes.body.data.assignmentId;
    const submitRes = await request(app).post('/api/exam/submit').set('Authorization', `Bearer ${token}`).send({ assignmentId });
    return { test, assignmentId, submitRes };
  }

  it('IMMEDIATE: student sees score right after submission', async () => {
    const { submitRes } = await makeExamAndAttempt('immediate', ResultVisibility.IMMEDIATE);
    expect(submitRes.body.data.resultVisible).toBe(true);
    expect(submitRes.body.data.score).not.toBeNull();
  });

  it('AFTER_EXAM_ENDS: student does NOT see score in the submit response while the exam is still open', async () => {
    const { submitRes } = await makeExamAndAttempt('afterEnds', ResultVisibility.AFTER_EXAM_ENDS, { endInPast: false });
    expect(submitRes.body.data.resultVisible).toBe(false);
    expect(submitRes.body.data.score).toBeNull();
  });

  it('AFTER_EXAM_ENDS: direct solution-review API call is blocked while the exam is still open (not just hidden in a UI)', async () => {
    const { assignmentId } = await makeExamAndAttempt('afterEnds', ResultVisibility.AFTER_EXAM_ENDS, { endInPast: false });
    const res = await request(app).get(`/api/exam/solution/${assignmentId}`).set('Authorization', `Bearer ${students.afterEnds.token}`);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('RESULT_NOT_YET_VISIBLE');
  });

  it('AFTER_EXAM_ENDS: student CAN see the result once endTime has passed', async () => {
    // The exam window itself must still be open for the student to start and submit at all
    // (startExam correctly rejects starting after endTime — see examTimeWindow.test.ts). To
    // observe the "after it ends" visibility transition without waiting in real time, submit
    // while the window is open, then move endTime into the past to simulate time having passed
    // — visibility is evaluated at read time, not frozen at submission time.
    const { test, assignmentId } = await makeExamAndAttempt('afterEnds', ResultVisibility.AFTER_EXAM_ENDS, { endInPast: false });
    await prisma.mockTest.update({ where: { id: test.id }, data: { endTime: new Date(Date.now() - 1000) } });

    const res = await request(app).get(`/api/exam/solution/${assignmentId}`).set('Authorization', `Bearer ${students.afterEnds.token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.score).not.toBeNull();
  });

  it('MANUAL_PUBLISH: student does not see the result until Faculty/Admin explicitly publishes it', async () => {
    const { test, assignmentId } = await makeExamAndAttempt('manual', ResultVisibility.MANUAL_PUBLISH);
    const before = await request(app).get(`/api/exam/solution/${assignmentId}`).set('Authorization', `Bearer ${students.manual.token}`);
    expect(before.status).toBe(403);

    const adminToken = jwt.sign({ id: adminId }, ENV.JWT_SECRET, { expiresIn: '1h' });
    const publish = await request(app).put(`/api/admin/exams/${test.id}/publish-results`).set('Authorization', `Bearer ${adminToken}`);
    expect(publish.status).toBe(200);

    const after = await request(app).get(`/api/exam/solution/${assignmentId}`).set('Authorization', `Bearer ${students.manual.token}`);
    expect(after.status).toBe(200);
    expect(after.body.data.score).not.toBeNull();
  });

  it('the student-tests dashboard list also withholds score/accuracy while a result is not yet visible', async () => {
    const { test } = await makeExamAndAttempt('afterEnds', ResultVisibility.AFTER_EXAM_ENDS, { endInPast: false });
    // reuse the same student's second exam attempt isn't needed; just re-check the list for the
    // exam created in the earlier "not yet open" case via a fresh lookup on this student's list.
    const res = await request(app).get('/api/exam/student-tests').set('Authorization', `Bearer ${students.afterEnds.token}`);
    const entry = res.body.data.find((a: any) => a.testId === test.id);
    expect(entry).toBeDefined();
    expect(entry.resultVisible).toBe(false);
    expect(entry.score).toBeNull();
  });

  it('Faculty/Admin can always review the result via the staff drill-down, regardless of student-facing visibility', async () => {
    const { test, assignmentId } = await makeExamAndAttempt('manual', ResultVisibility.MANUAL_PUBLISH);
    const adminToken = jwt.sign({ id: adminId }, ENV.JWT_SECRET, { expiresIn: '1h' });
    const res = await request(app).get(`/api/admin/assignments/${assignmentId}/solution`).set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.score).not.toBeNull();
  });

  it('student privacy: student A cannot access student B attempt solution review', async () => {
    const { assignmentId } = await makeExamAndAttempt('immediate', ResultVisibility.IMMEDIATE);
    // Student 'afterEnds' tries to view Student 'immediate' assignment solution
    const res = await request(app).get(`/api/exam/solution/${assignmentId}`).set('Authorization', `Bearer ${students.afterEnds.token}`);
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/Student Privacy Policy/i);
  });

  it('publishing one exam does not publish unrelated examinations', async () => {
    const exam1 = await makeExamAndAttempt('manual', ResultVisibility.MANUAL_PUBLISH);
    const exam2 = await makeExamAndAttempt('manual', ResultVisibility.MANUAL_PUBLISH);

    const adminToken = jwt.sign({ id: adminId }, ENV.JWT_SECRET, { expiresIn: '1h' });

    // Publish exam1 only
    const publishRes = await request(app).put(`/api/admin/exams/${exam1.test.id}/publish-results`).set('Authorization', `Bearer ${adminToken}`);
    expect(publishRes.status).toBe(200);

    // Exam 1 should now be visible
    const res1 = await request(app).get(`/api/exam/solution/${exam1.assignmentId}`).set('Authorization', `Bearer ${students.manual.token}`);
    expect(res1.status).toBe(200);

    // Exam 2 must still remain unpublished and blocked
    const res2 = await request(app).get(`/api/exam/solution/${exam2.assignmentId}`).set('Authorization', `Bearer ${students.manual.token}`);
    expect(res2.status).toBe(403);
    expect(res2.body.code).toBe('RESULT_NOT_YET_VISIBLE');
  }, 60000);
});
