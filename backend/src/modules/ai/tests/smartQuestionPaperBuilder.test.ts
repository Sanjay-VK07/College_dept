import { QuestionBankService } from '../services/questionBankService';
import { QuestionPaperService } from '../services/questionPaperService';
import { prisma } from '../../../config/prisma';
import { Role, QuestionType, Difficulty, VerificationStatus, QuestionOrigin, ExamStatus } from '@prisma/client';

jest.setTimeout(60000);

describe('Smart Question Paper Builder Integration Tests', () => {
  const testUserId = 'builder-test-user-' + Date.now();
  const testSubjectId = 'builder-test-subj-' + Date.now();
  const testModuleId = 'builder-test-mod-' + Date.now();
  const testTopicId = 'builder-test-top-' + Date.now();
  const testSubtopicId = 'builder-test-subtop-' + Date.now();

  const createdQuestionIds: string[] = [];
  let testDraftMockTestId: string | null = null;

  beforeAll(async () => {
    // 1. Create test user
    await prisma.user.create({
      data: {
        id: testUserId,
        name: 'Paper Builder Faculty',
        email: `builder_fac_${Date.now()}@cit.edu.in`,
        role: 'FACULTY',
        department: 'CSE',
      },
    });

    // 2. Create taxonomy: Subject -> Module -> Topic -> Subtopic
    const subj = await prisma.subject.create({
      data: {
        id: testSubjectId,
        name: 'Computer Organization & Architecture',
        code: 'CS_COA_' + Date.now(),
        department: 'CSE',
      },
    });

    const mod = await prisma.module.create({
      data: {
        id: testModuleId,
        name: 'Memory System Hierarchy',
        subjectId: subj.id,
      },
    });

    const top = await prisma.topic.create({
      data: {
        id: testTopicId,
        name: 'Average Memory Access Time',
        moduleId: mod.id,
      },
    });

    const subtop = await prisma.subtopic.create({
      data: {
        id: testSubtopicId,
        name: 'Cache Access Time & Hit Ratio',
        topicId: top.id,
      },
    });

    // 3. Create 3 VERIFIED source questions for Average Memory Access Time topic
    for (let i = 0; i < 3; i++) {
      const q = await prisma.question.create({
        data: {
          text: `Average Memory Access Time Calculation Question ${i + 1}`,
          type: QuestionType.MCQ,
          difficulty: i === 0 ? Difficulty.EASY : Difficulty.MEDIUM,
          marks: 1.0,
          negativeMarks: 0.33,
          options: [{ text: '10 ns' }, { text: '15 ns' }, { text: '20 ns' }, { text: '25 ns' }],
          correctAnswer: [1],
          explanation: 'T_avg = h * t_c + (1-h) * t_m',
          subtopicId: subtop.id,
          createdById: testUserId,
          origin: QuestionOrigin.SOURCE,
          verificationStatus: VerificationStatus.VERIFIED,
          sourceHeading: 'Average Memory Access Time',
          sourcePage: 28 + i,
        },
      });
      createdQuestionIds.push(q.id);
    }
  });

  afterAll(async () => {
    try {
      if (testDraftMockTestId) {
        await prisma.mockTestQuestion.deleteMany({ where: { mockTestId: testDraftMockTestId } });
        await prisma.mockTest.delete({ where: { id: testDraftMockTestId } });
      }
      await prisma.question.deleteMany({ where: { id: { in: createdQuestionIds } } });
      await prisma.subtopic.deleteMany({ where: { id: testSubtopicId } });
      await prisma.topic.deleteMany({ where: { id: testTopicId } });
      await prisma.module.deleteMany({ where: { id: testModuleId } });
      await prisma.subject.deleteMany({ where: { id: testSubjectId } });
      await prisma.user.deleteMany({ where: { id: testUserId } });
    } catch (e) {
      console.warn('Cleanup error:', e);
    } finally {
      await prisma.$disconnect();
    }
  });

  it('1. should return real database topic availability metrics for subject', async () => {
    const topics = await QuestionBankService.getTopicAvailability(testSubjectId);
    expect(topics).toHaveLength(1);

    const targetTopic = topics[0];
    expect(targetTopic.topicId).toBe(testTopicId);
    expect(targetTopic.topicName).toBe('Average Memory Access Time');
    expect(targetTopic.total).toBe(3);
    expect(targetTopic.verified).toBe(3);
    expect(targetTopic.sourceQuestions).toBe(3);
    expect(targetTopic.aiGenerated).toBe(0);
    expect(targetTopic.types.MCQ).toBe(3);
  });

  it('2. Scenario: Requested 20 on topic with 3 available -> Selects 3, calculates exact shortfall = 17', async () => {
    const preview = await QuestionPaperService.previewQuestionPaper({
      subjectId: testSubjectId,
      selectedTopicIds: [testTopicId],
      paperMode: 'TOTAL_COUNT',
      totalQuestions: 20,
      difficultyDistribution: { EASY: 20, MEDIUM: 50, HARD: 30 },
      typeDistribution: { MCQ: 100, MSQ: 0, NAT: 0 },
    });

    expect(preview.requestedTotal).toBe(20);
    expect(preview.availableVerifiedCount).toBe(3);
    expect(preview.selectedExistingCount).toBe(3);
    expect(preview.aiRequiredCount).toBe(17);
    expect(preview.selectedQuestions).toHaveLength(3);
  });

  it('3. Scenario: Requested 2 on topic with 3 available -> Selects 2, AI required = 0', async () => {
    const preview = await QuestionPaperService.previewQuestionPaper({
      subjectId: testSubjectId,
      selectedTopicIds: [testTopicId],
      paperMode: 'TOTAL_COUNT',
      totalQuestions: 2,
      difficultyDistribution: { EASY: 50, MEDIUM: 50, HARD: 0 },
      typeDistribution: { MCQ: 100, MSQ: 0, NAT: 0 },
    });

    expect(preview.requestedTotal).toBe(2);
    expect(preview.availableVerifiedCount).toBe(3);
    expect(preview.selectedExistingCount).toBe(2);
    expect(preview.aiRequiredCount).toBe(0);
  });

  it('4. should finalize paper selection into MockTest DRAFT (isPublished = false) with frozen version snapshots', async () => {
    const finalRes = await QuestionPaperService.finalizeQuestionPaper(testUserId, Role.FACULTY, {
      title: 'COA Mid-Semester Test Draft',
      subjectId: testSubjectId,
      selectedQuestionIds: createdQuestionIds.slice(0, 2),
      examSettings: {
        targetDepartment: 'CSE',
        durationMinutes: 90,
        totalMarks: 30,
      },
    });

    expect(finalRes.success).toBe(true);
    expect(finalRes.mockTestId).toBeDefined();
    testDraftMockTestId = finalRes.mockTestId;

    const mockTest = await prisma.mockTest.findUnique({
      where: { id: finalRes.mockTestId },
      include: { testQuestions: true },
    });

    expect(mockTest).not.toBeNull();
    expect(mockTest?.status).toBe(ExamStatus.DRAFT);
    expect(mockTest?.isPublished).toBe(false);
    expect(mockTest?.testQuestions).toHaveLength(2);
    expect(mockTest?.testQuestions[0].questionVersionId).toBeDefined();
  });

  it('5. should perform explicit publication setting status = PUBLISHED and isPublished = true', async () => {
    expect(testDraftMockTestId).toBeDefined();

    const pubRes = await QuestionPaperService.publishExamination(testDraftMockTestId!, testUserId, Role.FACULTY);
    expect(pubRes.success).toBe(true);

    const publishedTest = await prisma.mockTest.findUnique({ where: { id: testDraftMockTestId! } });
    expect(publishedTest?.isPublished).toBe(true);
    expect(publishedTest?.status).toBe(ExamStatus.PUBLISHED);
  });

  it('6. should block deletion of questions used in published examination', async () => {
    const qIdToProtect = createdQuestionIds[0];

    await expect(QuestionBankService.assertQuestionDeletionSafety(qIdToProtect)).rejects.toThrow(
      'Question is currently used in examination "COA Mid-Semester Test Draft" and cannot be deleted.'
    );
  });
});
