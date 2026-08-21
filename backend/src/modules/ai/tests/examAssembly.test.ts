import { ExamAssemblyService } from '../services/examAssemblyService';
import { prisma } from '../../../config/prisma';
import { Role, QuestionType, Difficulty, AIExamDraftStatus } from '@prisma/client';

describe('ExamAssemblyService Integration Tests', () => {
  const testUserId = 'exam-test-user-' + Date.now();
  const testSubtopicId = 'exam-test-subtop-' + Date.now();
  const testTopicId = 'exam-test-top-' + Date.now();
  const testModuleId = 'exam-test-mod-' + Date.now();
  const testSubjectId = 'exam-test-subj-' + Date.now();
  const testReqId = 'exam-test-req-' + Date.now();

  const createdQuestionIds: string[] = [];

  beforeAll(async () => {
    await prisma.user.create({
      data: {
        id: testUserId,
        name: 'Exam Faculty',
        email: `exam_fac_${Date.now()}@cit.edu.in`,
        role: 'FACULTY',
        department: 'CSE',
      },
    });

    const subj = await prisma.subject.create({
      data: { id: testSubjectId, name: 'Operating Systems', code: 'CS_OS_' + Date.now(), department: 'CSE' },
    });
    const mod = await prisma.module.create({
      data: { id: testModuleId, name: 'Process Scheduling', subjectId: subj.id },
    });
    const top = await prisma.topic.create({
      data: { id: testTopicId, name: 'CPU Schedulers', moduleId: mod.id },
    });
    const subtop = await prisma.subtopic.create({
      data: { id: testSubtopicId, name: 'Round Robin', topicId: top.id },
    });

    // Create 3 approved questions in Question Bank
    const difficulties = [Difficulty.EASY, Difficulty.MEDIUM, Difficulty.HARD];
    for (let i = 0; i < 3; i++) {
      const q = await prisma.question.create({
        data: {
          text: `OS Scheduling Question ${i + 1}`,
          type: QuestionType.MCQ,
          difficulty: difficulties[i],
          marks: 1.0,
          options: [{ text: 'A' }, { text: 'B' }, { text: 'C' }, { text: 'D' }],
          correctAnswer: [0],
          subtopicId: subtop.id,
          createdById: testUserId,
        },
      });
      createdQuestionIds.push(q.id);
    }
  });

  afterAll(async () => {
    // Delete test traces & mock tests
    const traces = await prisma.aIExamAssemblyTrace.findMany({ where: { generatedById: testUserId } });
    for (const t of traces) {
      if (t.mockTestId) {
        await prisma.mockTestQuestion.deleteMany({ where: { mockTestId: t.mockTestId } });
        await prisma.mockTest.delete({ where: { id: t.mockTestId } });
      }
    }
    await prisma.aIExamAssemblyTrace.deleteMany({ where: { generatedById: testUserId } });
    await prisma.question.deleteMany({ where: { id: { in: createdQuestionIds } } });
    await prisma.subtopic.deleteMany({ where: { id: testSubtopicId } });
    await prisma.topic.deleteMany({ where: { id: testTopicId } });
    await prisma.module.deleteMany({ where: { id: testModuleId } });
    await prisma.subject.deleteMany({ where: { id: testSubjectId } });
    await prisma.user.deleteMany({ where: { id: testUserId } });
  });

  it('should assemble a GATE exam draft using ONLY approved Question Bank questions', async () => {
    const result = await ExamAssemblyService.assembleExam(testUserId, Role.FACULTY, {
      examGenerationRequestId: testReqId,
      title: 'Operating Systems Practice Test',
      subjectId: testSubjectId,
      questionCount: 3,
    });

    expect(result.success).toBe(true);
    expect(result.status).toBe(AIExamDraftStatus.DRAFT);
    expect(result.selectedQuestionCount).toBe(3);
    expect(result.mockTestId).toBeDefined();

    // Verify MockTest starts as unpublished (isPublished = false)
    const mockTest = await prisma.mockTest.findUnique({ where: { id: result.mockTestId } });
    expect(mockTest).not.toBeNull();
    expect(mockTest?.isPublished).toBe(false);
  });

  it('should support exam generation idempotency via examGenerationRequestId', async () => {
    const replay = await ExamAssemblyService.assembleExam(testUserId, Role.FACULTY, {
      examGenerationRequestId: testReqId,
      questionCount: 3,
    });

    expect(replay.success).toBe(true);
    expect(replay.message).toContain('idempotent');
    expect(replay.selectedQuestionCount).toBe(3);
  });

  it('should strictly reject Student role from assembling exams with 403 Forbidden', async () => {
    await expect(
      ExamAssemblyService.assembleExam('student-123', Role.STUDENT, {
        examGenerationRequestId: 'req-student-fail',
        questionCount: 3,
      })
    ).rejects.toThrow('Forbidden: Only Faculty and Admin users can assemble exams.');
  });
});
