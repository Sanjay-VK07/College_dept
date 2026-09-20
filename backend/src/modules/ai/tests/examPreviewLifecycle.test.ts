import { QuestionPaperService } from '../services/questionPaperService';
import { ExamValidationService, computeContentRepresentation } from '../services/examValidationService';
import { prisma } from '../../../config/prisma';
import { Role, QuestionType, Difficulty, VerificationStatus, QuestionOrigin, ExamStatus } from '@prisma/client';

jest.setTimeout(60000);

describe('Exam Preview Lifecycle & Zero Mutation Tests', () => {
  const testUserId = 'preview-lifecycle-user-' + Date.now();
  const testSubjectId = 'preview-lifecycle-subj-' + Date.now();
  const testModuleId = 'preview-lifecycle-mod-' + Date.now();
  const testTopicId = 'preview-lifecycle-top-' + Date.now();
  const testSubtopicId = 'preview-lifecycle-subtop-' + Date.now();

  const createdQuestionIds: string[] = [];
  let testDraftMockTestId: string | null = null;

  beforeAll(async () => {
    // 1. Create test user with faculty role
    await prisma.user.create({
      data: {
        id: testUserId,
        name: 'Preview Test Faculty',
        email: `preview_fac_${Date.now()}@cit.edu.in`,
        role: 'FACULTY',
        department: 'CSE',
        canCreateExams: true,
      },
    });

    // 2. Create taxonomy
    const subj = await prisma.subject.create({
      data: {
        id: testSubjectId,
        name: 'Digital Logic & Circuit Design',
        code: 'CS_DLD_' + Date.now(),
        department: 'CSE',
      },
    });

    const mod = await prisma.module.create({
      data: {
        id: testModuleId,
        name: 'Combinational Circuits',
        subjectId: subj.id,
      },
    });

    const top = await prisma.topic.create({
      data: {
        id: testTopicId,
        name: 'Multiplexers & Decoders',
        moduleId: mod.id,
      },
    });

    const subtop = await prisma.subtopic.create({
      data: {
        id: testSubtopicId,
        name: '8:1 Multiplexer Implementation',
        topicId: top.id,
      },
    });

    // 3. Create 3 VERIFIED questions (TEXT, TEXT_WITH_IMAGE, IMAGE)
    const q1 = await prisma.question.create({
      data: {
        text: 'What is the boolean function of an 8:1 MUX?',
        type: QuestionType.MCQ,
        difficulty: Difficulty.EASY,
        marks: 1.0,
        negativeMarks: 0.33,
        options: [{ text: 'Sum of products' }, { text: 'Product of sums' }, { text: 'NAND' }, { text: 'NOR' }],
        correctAnswer: [0],
        subtopicId: subtop.id,
        createdById: testUserId,
        origin: QuestionOrigin.SOURCE,
        verificationStatus: VerificationStatus.VERIFIED,
      },
    });
    createdQuestionIds.push(q1.id);

    const q2 = await prisma.question.create({
      data: {
        text: 'Consider the circuit diagram shown below:\n![Circuit](figures/circuit_81.png)',
        type: QuestionType.MCQ,
        difficulty: Difficulty.MEDIUM,
        marks: 2.0,
        negativeMarks: 0.66,
        options: [{ text: 'F = A + B' }, { text: 'F = AB' }, { text: 'F = A XOR B' }, { text: 'F = A XNOR B' }],
        correctAnswer: [2],
        subtopicId: subtop.id,
        createdById: testUserId,
        origin: QuestionOrigin.SOURCE,
        verificationStatus: VerificationStatus.VERIFIED,
        imageUrl: 'figures/circuit_81.png',
        containsFigure: true,
      },
    });
    createdQuestionIds.push(q2.id);

    const q3 = await prisma.question.create({
      data: {
        text: '[Image Question]',
        type: QuestionType.NAT,
        difficulty: Difficulty.HARD,
        marks: 2.0,
        negativeMarks: 0.0,
        options: [],
        correctAnswer: '4.5',
        subtopicId: subtop.id,
        createdById: testUserId,
        origin: QuestionOrigin.SOURCE,
        verificationStatus: VerificationStatus.VERIFIED,
        imageUrl: 'figures/pure_diagram_q3.png',
        containsFigure: true,
      },
    });
    createdQuestionIds.push(q3.id);
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
      /* ignore */
    }
  });

  test('1. computeContentRepresentation correctly classifies TEXT, TEXT_WITH_IMAGE, and IMAGE questions', () => {
    const rep1 = computeContentRepresentation({ text: 'Simple text question', imageUrl: null });
    expect(rep1).toBe('TEXT');

    const rep2 = computeContentRepresentation({ text: 'Consider diagram below', imageUrl: 'fig.png' });
    expect(rep2).toBe('TEXT_WITH_IMAGE');

    const rep3 = computeContentRepresentation({ text: '[Image Question]', imageUrl: 'fig_pure.png' });
    expect(rep3).toBe('IMAGE');
  });

  test('2. previewQuestionPaper operates with zero DB mutation on MockTest and MockTestQuestion tables', async () => {
    const mockTestCountBefore = await prisma.mockTest.count();
    const mockTestQuestionCountBefore = await prisma.mockTestQuestion.count();

    const preview = await QuestionPaperService.previewQuestionPaper({
      subjectId: testSubjectId,
      selectedTopicIds: [testTopicId],
      paperMode: 'TOTAL_COUNT',
      totalQuestions: 3,
      difficultyDistribution: { EASY: 33, MEDIUM: 33, HARD: 34 },
      typeDistribution: { MCQ: 66, MSQ: 0, NAT: 34 },
    });

    expect(preview.selectedQuestions.length).toBeGreaterThan(0);
    expect(preview.selectedQuestions[0].contentRepresentation).toBeDefined();

    const mockTestCountAfter = await prisma.mockTest.count();
    const mockTestQuestionCountAfter = await prisma.mockTestQuestion.count();

    expect(mockTestCountAfter).toBe(mockTestCountBefore);
    expect(mockTestQuestionCountAfter).toBe(mockTestQuestionCountBefore);
  });

  test('3. validatePreviewPayload performs strict in-memory validation without creating exam rows', () => {
    const res = ExamValidationService.validatePreviewPayload({
      title: 'Validation Test Exam',
      durationMinutes: 60,
      totalMarks: 5.0,
      questions: [
        { id: createdQuestionIds[0], text: 'Valid Q1', type: 'MCQ', options: ['A', 'B'], correctAnswer: [0], marks: 1.0, verificationStatus: 'VERIFIED' },
        { id: createdQuestionIds[1], text: 'Valid Q2', type: 'MCQ', options: ['A', 'B'], correctAnswer: [1], marks: 2.0, verificationStatus: 'VERIFIED' },
        { id: createdQuestionIds[2], text: 'Valid Q3', type: 'NAT', options: [], correctAnswer: '4.5', marks: 2.0, verificationStatus: 'VERIFIED' },
      ],
    });

    expect(res.canPublish).toBe(true);
    expect(res.blocking.length).toBe(0);
  });

  test('4. finalizeQuestionPaper creates MockTest as DRAFT only, preserves exact ordering and freezes questionVersionId', async () => {
    // Explicit requested order: Q3, Q1, Q2
    const requestedOrder = [createdQuestionIds[2], createdQuestionIds[0], createdQuestionIds[1]];

    const finalizeRes = await QuestionPaperService.finalizeQuestionPaper(testUserId, Role.FACULTY, {
      title: 'Ordered Exam DRAFT Test',
      description: 'Testing exact order preservation and version freezing',
      subjectId: testSubjectId,
      selectedQuestionIds: requestedOrder,
      examSettings: {
        targetDepartment: 'CSE',
        durationMinutes: 90,
        totalMarks: 5.0,
      },
    });

    expect(finalizeRes.success).toBe(true);
    expect(finalizeRes.mockTestId).toBeDefined();
    testDraftMockTestId = finalizeRes.mockTestId;

    const mockTest = await prisma.mockTest.findUnique({
      where: { id: finalizeRes.mockTestId },
      include: { testQuestions: { orderBy: { order: 'asc' } } },
    });

    expect(mockTest).not.toBeNull();
    expect(mockTest?.status).toBe(ExamStatus.DRAFT);
    expect(mockTest?.isPublished).toBe(false);

    // Check exact question order matching requestedOrder
    const actualOrderIds = mockTest!.testQuestions.map((tq) => tq.questionId);
    expect(actualOrderIds).toEqual(requestedOrder);

    // Check QuestionVersion freezing
    for (const tq of mockTest!.testQuestions) {
      expect(tq.questionVersionId).not.toBeNull();
    }
  });

  test('5. validatePreviewPayload handles legacy strings, text-only objects, and structured option objects without crashing', () => {
    const res = ExamValidationService.validatePreviewPayload({
      title: 'Structured Option Test Exam',
      durationMinutes: 60,
      totalMarks: 4.0,
      questions: [
        {
          id: 'q_legacy',
          text: 'Legacy String Question',
          type: 'MCQ',
          options: ['Legacy String Option A', 'Legacy String Option B'],
          correctAnswer: [0],
          marks: 1.0,
          verificationStatus: 'VERIFIED',
        },
        {
          id: 'q_text_obj',
          text: 'Text Object Question',
          type: 'MCQ',
          options: [{ text: 'Option A' }, { text: 'Option B' }],
          correctAnswer: [0],
          marks: 1.0,
          verificationStatus: 'VERIFIED',
        },
        {
          id: 'q_structured_obj',
          text: 'Structured Option Question',
          type: 'MCQ',
          options: [{ text: 'Option 1 text', imagePath: null }, { text: 'Option 2 text', imagePath: null }],
          correctAnswer: [1],
          marks: 1.0,
          verificationStatus: 'VERIFIED',
        },
        {
          id: 'q_mixed_obj',
          text: 'Mixed Option Question',
          type: 'MCQ',
          options: ['Option A string', { text: 'Option B object', imagePath: null }],
          correctAnswer: [0],
          marks: 1.0,
          verificationStatus: 'VERIFIED',
        },
      ],
    });

    expect(res.canPublish).toBe(true);
    expect(res.blocking.length).toBe(0);
  });
});
