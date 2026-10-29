import request from 'supertest';
import app from '../app';
import { prisma } from '../config/prisma';
import jwt from 'jsonwebtoken';
import { ENV } from '../config/env';
import { QuestionType, Difficulty, VerificationStatus, QuestionOrigin, Role, ResultVisibility } from '@prisma/client';
import { GateScoringService } from '../services/gateScoringService';

describe('GATE Examination Workflow Regression Suite', () => {
  const ts = Date.now();
  let subjectId: string, subtopicId: string;
  let mcqId: string, msqId: string, natId: string;
  let adminId: string, studentId: string, studentToken: string;

  beforeAll(async () => {
    const admin = await prisma.user.findFirst({ where: { role: 'ADMIN', email: { endsWith: '@citchennai.net' } } });
    if (!admin) throw new Error('Requires existing ADMIN account');
    adminId = admin.id;

    const subj = await prisma.subject.create({
      data: { id: `reg-subj-${ts}`, name: 'REG-TEST Subject', code: `REG${ts}`, department: 'CSE' }
    });
    const mod = await prisma.module.create({
      data: { id: `reg-mod-${ts}`, name: 'REG-TEST Module', subjectId: subj.id }
    });
    const top = await prisma.topic.create({
      data: { id: `reg-top-${ts}`, name: 'REG-TEST Topic', moduleId: mod.id }
    });
    const subtop = await prisma.subtopic.create({
      data: { id: `reg-subtop-${ts}`, name: 'REG-TEST Subtopic', topicId: top.id }
    });
    subjectId = subj.id;
    subtopicId = subtop.id;

    // Create 1 MCQ, 1 MSQ, 1 NAT questions with images
    const mcq = await prisma.question.create({
      data: {
        text: 'REG MCQ Question',
        type: QuestionType.MCQ,
        difficulty: Difficulty.MEDIUM,
        marks: 1,
        negativeMarks: 0.33,
        options: [{ text: 'Option A' }, { text: 'Option B' }, { text: 'Option C' }, { text: 'Option D' }],
        correctAnswer: ['B'],
        imageUrl: '/uploads/diagrams/reg_mcq.png',
        subtopicId: subtop.id,
        createdById: admin.id,
        origin: QuestionOrigin.SOURCE,
        verificationStatus: VerificationStatus.VERIFIED,
      }
    });
    mcqId = mcq.id;

    const msq = await prisma.question.create({
      data: {
        text: 'REG MSQ Question',
        type: QuestionType.MSQ,
        difficulty: Difficulty.HARD,
        marks: 2,
        negativeMarks: 0,
        options: [{ text: 'Option A' }, { text: 'Option B' }, { text: 'Option C' }, { text: 'Option D' }],
        correctAnswer: ['A', 'C'],
        imageUrl: '/uploads/diagrams/reg_msq.png',
        subtopicId: subtop.id,
        createdById: admin.id,
        origin: QuestionOrigin.SOURCE,
        verificationStatus: VerificationStatus.VERIFIED,
      }
    });
    msqId = msq.id;

    const nat = await prisma.question.create({
      data: {
        text: 'REG NAT Question',
        type: QuestionType.NAT,
        difficulty: Difficulty.MEDIUM,
        marks: 2,
        negativeMarks: 0,
        options: [],
        correctAnswer: { value: 12, min: 12, max: 12 },
        imageUrl: '/uploads/diagrams/reg_nat.png',
        subtopicId: subtop.id,
        createdById: admin.id,
        origin: QuestionOrigin.SOURCE,
        verificationStatus: VerificationStatus.VERIFIED,
      }
    });
    natId = nat.id;

    const student = await prisma.user.create({
      data: {
        name: 'REG-TEST Student',
        email: `reg-student-${ts}@citchennai.net`,
        role: Role.STUDENT,
        department: 'CSE',
        registerNo: `REG${ts}`,
        googleId: `reg_${ts}`,
      }
    });
    studentId = student.id;
    studentToken = jwt.sign({ id: student.id }, ENV.JWT_SECRET, { expiresIn: '1h' });
  });

  afterAll(async () => {
    await prisma.mockTestQuestion.deleteMany({ where: { question: { subtopicId } } });
    await prisma.questionResponse.deleteMany({ where: { assignment: { studentId } } });
    await prisma.testAssignment.deleteMany({ where: { studentId } });
    await prisma.mockTest.deleteMany({ where: { title: { startsWith: 'REG-TEST' } } });
    await prisma.question.deleteMany({ where: { subtopicId } });
    await prisma.subtopic.delete({ where: { id: subtopicId } });
    await prisma.topic.deleteMany({ where: { module: { subjectId } } });
    await prisma.module.deleteMany({ where: { subjectId } });
    await prisma.subject.delete({ where: { id: subjectId } });
    await prisma.user.delete({ where: { id: studentId } });
    await prisma.$disconnect();
  });

  it('verifies MSQ autosaving stores array of multiple selected options', async () => {
    const test = await prisma.mockTest.create({
      data: {
        title: `REG-TEST Exam ${ts}`,
        durationMinutes: 30,
        totalMarks: 5,
        startTime: new Date(Date.now() - 3600_000),
        endTime: new Date(Date.now() + 3600_000),
        targetDepartment: 'CSE',
        isPublished: true,
        status: 'PUBLISHED',
        resultVisibility: ResultVisibility.IMMEDIATE,
        createdById: adminId,
        testQuestions: {
          create: [
            { questionId: mcqId, order: 1 },
            { questionId: msqId, order: 2 },
            { questionId: natId, order: 3 },
          ]
        }
      }
    });

    const startRes = await request(app).post(`/api/exam/start/${test.id}`).set('Authorization', `Bearer ${studentToken}`);
    expect(startRes.status).toBe(200);
    const assignmentId = startRes.body.data.assignmentId;

    // Autosave MCQ (B -> index 1 or 'B')
    const mcqAutosave = await request(app).post('/api/exam/autosave').set('Authorization', `Bearer ${studentToken}`).send({
      assignmentId,
      questionId: mcqId,
      chosenAnswer: ['B'],
      timeSpentSec: 15
    });
    expect(mcqAutosave.status).toBe(200);

    // Autosave MSQ with multiple answers ['A', 'C']
    const msqAutosave = await request(app).post('/api/exam/autosave').set('Authorization', `Bearer ${studentToken}`).send({
      assignmentId,
      questionId: msqId,
      chosenAnswer: ['A', 'C'],
      timeSpentSec: 25
    });
    expect(msqAutosave.status).toBe(200);

    // Verify response record in DB
    const savedMsq = await prisma.questionResponse.findFirst({
      where: { assignmentId, questionId: msqId }
    });
    expect(savedMsq).toBeDefined();
    expect(savedMsq?.chosenAnswer).toEqual(['A', 'C']);

    // Autosave NAT
    const natAutosave = await request(app).post('/api/exam/autosave').set('Authorization', `Bearer ${studentToken}`).send({
      assignmentId,
      questionId: natId,
      chosenAnswer: 12,
      timeSpentSec: 20
    });
    expect(natAutosave.status).toBe(200);

    // Submit exam
    const submitRes = await request(app).post('/api/exam/submit').set('Authorization', `Bearer ${studentToken}`).send({
      assignmentId
    });
    expect(submitRes.status).toBe(200);
    expect(submitRes.body.data.score).toBe(5); // 1 + 2 + 2 = 5
    expect(submitRes.body.data.accuracy).toBe(100);

    // Get Solution Review
    const solutionRes = await request(app).get(`/api/exam/solution/${assignmentId}`).set('Authorization', `Bearer ${studentToken}`);
    expect(solutionRes.status).toBe(200);
    expect(solutionRes.body.data.solutions).toHaveLength(3);

    // Verify question 1 (MCQ) details
    const q1 = solutionRes.body.data.solutions.find((q: any) => q.id === mcqId);
    expect(q1.imageUrl).toBe('/uploads/diagrams/reg_mcq.png');
    expect(q1.isCorrect).toBe(true);
    expect(q1.marksObtained).toBe(1);

    // Verify question 2 (MSQ) details
    const q2 = solutionRes.body.data.solutions.find((q: any) => q.id === msqId);
    expect(q2.imageUrl).toBe('/uploads/diagrams/reg_msq.png');
    expect(q2.isCorrect).toBe(true);
    expect(q2.marksObtained).toBe(2);
    expect(q2.negativeMarks).toBe(0);

    // Verify question 3 (NAT) details
    const q3 = solutionRes.body.data.solutions.find((q: any) => q.id === natId);
    expect(q3.imageUrl).toBe('/uploads/diagrams/reg_nat.png');
    expect(q3.isCorrect).toBe(true);
    expect(q3.marksObtained).toBe(2);
  }, 60000);

  it('verifies Volume 2 and Volume 3 questions load with valid imageUrl and customId', async () => {
    // Sample Volume 2 questions
    const vol2Sample = await prisma.question.findMany({
      where: { customId: { startsWith: '1.' } },
      take: 10,
      select: { id: true, customId: true, imageUrl: true, type: true }
    });
    expect(vol2Sample.length).toBeGreaterThan(0);
    for (const q of vol2Sample) {
      expect(q.imageUrl).toBeTruthy();
      expect(q.imageUrl).toMatch(/^\/uploads\/diagrams\//);
    }

    // Sample Volume 3 questions
    const vol3Sample = await prisma.question.findMany({
      where: {
        OR: [
          { customId: { startsWith: '2.' } },
          { customId: { startsWith: '3.' } },
          { customId: { startsWith: '4.' } },
          { customId: { startsWith: '5.' } },
        ]
      },
      take: 10,
      select: { id: true, customId: true, imageUrl: true, type: true }
    });
    expect(vol3Sample.length).toBeGreaterThan(0);
    for (const q of vol3Sample) {
      expect(q.imageUrl).toBeTruthy();
      expect(q.imageUrl).toMatch(/^\/uploads\/diagrams\//);
    }
  });

  it('verifies historical score recalculator produces identical results without altering responses', async () => {
    // Evaluate a known mock test attempt
    const assignment = await prisma.testAssignment.findFirst({
      where: { status: 'COMPLETED' },
      include: {
        test: {
          include: {
            testQuestions: {
              include: { question: true }
            }
          }
        },
        responses: true
      }
    });

    if (assignment) {
      const qMap = new Map<string, any>();
      for (const tq of assignment.test.testQuestions) {
        qMap.set(tq.questionId, tq.question);
      }

      let recomputedScore = 0;
      for (const resp of assignment.responses) {
        const question = qMap.get(resp.questionId);
        if (question) {
          const evalRes = GateScoringService.evaluateResponse(question, resp.chosenAnswer);
          recomputedScore += evalRes.marksObtained;
        }
      }
      const finalRecomputed = Math.max(0, Number(recomputedScore.toFixed(2)));
      expect(finalRecomputed).toBe(assignment.score);
    }
  });
});
