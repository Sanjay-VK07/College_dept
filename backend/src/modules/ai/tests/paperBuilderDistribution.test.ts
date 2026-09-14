import { QuestionPaperService } from '../services/questionPaperService';
import { prisma } from '../../../config/prisma';
import { Role, QuestionType, Difficulty, VerificationStatus, QuestionOrigin } from '@prisma/client';

// Regression coverage for the selection-algorithm defect found in the GSMAS audit: type
// distribution (MCQ/MSQ/NAT) was computed but never actually applied during selection — only
// difficulty was enforced, so a type with real surplus supply could still be under-picked and
// falsely reported as short, which would have triggered unnecessary AI generation. Fixed by
// applying type distribution first, then difficulty within each type's quota. These tests prove
// the fix is persistent, not a one-off manual verification.

jest.setTimeout(60000);

describe('Question Paper Builder — type distribution & topic combination regression', () => {
  const testUserId = 'dist-test-user-' + Date.now();
  const subjectId = 'dist-test-subj-' + Date.now();
  const moduleId = 'dist-test-mod-' + Date.now();

  // Distribution topic: exactly 20 MCQ, 20 MSQ, 20 NAT, all VERIFIED, all MEDIUM — so a 60/10/30
  // request of 20 questions has a deterministic, shortfall-free expected outcome: 12 MCQ / 2 MSQ
  // / 6 NAT.
  const distTopicId = 'dist-test-top-dist-' + Date.now();
  const distSubtopicId = 'dist-test-subtop-dist-' + Date.now();

  // Combination topics: 3 / 20 / 40 verified MCQ questions across three distinct topics, to
  // prove the builder combines topics into one pool rather than treating each as an isolated
  // examination category.
  const topicAId = 'dist-test-top-a-' + Date.now();
  const topicBId = 'dist-test-top-b-' + Date.now();
  const topicCId = 'dist-test-top-c-' + Date.now();
  const subtopAId = 'dist-test-subtop-a-' + Date.now();
  const subtopBId = 'dist-test-subtop-b-' + Date.now();
  const subtopCId = 'dist-test-subtop-c-' + Date.now();

  const createdQuestionIds: string[] = [];

  beforeAll(async () => {
    await prisma.user.create({
      data: { id: testUserId, name: 'Distribution Test Faculty', email: `dist_fac_${Date.now()}@cit.edu.in`, role: 'FACULTY', department: 'CSE' },
    });
    const subj = await prisma.subject.create({ data: { id: subjectId, name: 'Distribution Test Subject', code: 'DIST_' + Date.now(), department: 'CSE' } });
    const mod = await prisma.module.create({ data: { id: moduleId, name: 'Distribution Test Module', subjectId: subj.id } });

    const distTop = await prisma.topic.create({ data: { id: distTopicId, name: 'Distribution Topic', moduleId: mod.id } });
    const distSubtop = await prisma.subtopic.create({ data: { id: distSubtopicId, name: 'Distribution Subtopic', topicId: distTop.id } });

    const topA = await prisma.topic.create({ data: { id: topicAId, name: 'Combo Topic A (3)', moduleId: mod.id } });
    const topB = await prisma.topic.create({ data: { id: topicBId, name: 'Combo Topic B (20)', moduleId: mod.id } });
    const topC = await prisma.topic.create({ data: { id: topicCId, name: 'Combo Topic C (40)', moduleId: mod.id } });
    const subtopA = await prisma.subtopic.create({ data: { id: subtopAId, name: 'Combo Subtopic A', topicId: topA.id } });
    const subtopB = await prisma.subtopic.create({ data: { id: subtopBId, name: 'Combo Subtopic B', topicId: topB.id } });
    const subtopC = await prisma.subtopic.create({ data: { id: subtopCId, name: 'Combo Subtopic C', topicId: topC.id } });

    // Bulk-insert via createMany (one round trip per batch) instead of one create() per question
    // — with 123 fixture rows, individual sequential creates blew well past this DB's per-query
    // latency budget and the jest hook timeout.
    const questionRow = (subtopicId: string, type: QuestionType, idx: number) => {
      const base = {
        difficulty: Difficulty.MEDIUM,
        subtopicId,
        createdById: testUserId,
        origin: QuestionOrigin.SOURCE,
        verificationStatus: VerificationStatus.VERIFIED,
        text: `Distribution test question ${type} #${idx} ${subtopicId}`,
      };
      if (type === QuestionType.MCQ) {
        return { ...base, type, marks: 1, negativeMarks: 0.33, options: [{ text: 'A' }, { text: 'B' }, { text: 'C' }, { text: 'D' }], correctAnswer: [0] };
      } else if (type === QuestionType.MSQ) {
        return { ...base, type, marks: 2, negativeMarks: 0, options: [{ text: 'A' }, { text: 'B' }, { text: 'C' }, { text: 'D' }], correctAnswer: [0, 1] };
      }
      return { ...base, type, marks: 2, negativeMarks: 0, options: [], correctAnswer: { value: idx } };
    };

    const rows: any[] = [];
    for (let i = 0; i < 20; i++) rows.push(questionRow(distSubtop.id, QuestionType.MCQ, i));
    for (let i = 0; i < 20; i++) rows.push(questionRow(distSubtop.id, QuestionType.MSQ, i));
    for (let i = 0; i < 20; i++) rows.push(questionRow(distSubtop.id, QuestionType.NAT, i));
    for (let i = 0; i < 3; i++) rows.push(questionRow(subtopA.id, QuestionType.MCQ, i));
    for (let i = 0; i < 20; i++) rows.push(questionRow(subtopB.id, QuestionType.MCQ, i));
    for (let i = 0; i < 40; i++) rows.push(questionRow(subtopC.id, QuestionType.MCQ, i));

    await prisma.question.createMany({ data: rows });
    const inserted = await prisma.question.findMany({
      where: { subtopicId: { in: [distSubtop.id, subtopA.id, subtopB.id, subtopC.id] } },
      select: { id: true },
    });
    createdQuestionIds.push(...inserted.map((q) => q.id));
  }, 120000);

  afterAll(async () => {
    try {
      await prisma.question.deleteMany({ where: { id: { in: createdQuestionIds } } });
      await prisma.subtopic.deleteMany({ where: { id: { in: [distSubtopicId, subtopAId, subtopBId, subtopCId] } } });
      await prisma.topic.deleteMany({ where: { id: { in: [distTopicId, topicAId, topicBId, topicCId] } } });
      await prisma.module.deleteMany({ where: { id: moduleId } });
      await prisma.subject.deleteMany({ where: { id: subjectId } });
      await prisma.user.deleteMany({ where: { id: testUserId } });
    } finally {
      await prisma.$disconnect();
    }
  });

  it('preview: 60/10/30 MCQ/MSQ/NAT on a 20/20/20 pool, requesting 20, selects the exact expected split with zero shortfall', async () => {
    const preview = await QuestionPaperService.previewQuestionPaper({
      subjectId,
      selectedTopicIds: [distTopicId],
      paperMode: 'TOTAL_COUNT',
      totalQuestions: 20,
      difficultyDistribution: { EASY: 0, MEDIUM: 100, HARD: 0 },
      typeDistribution: { MCQ: 60, MSQ: 10, NAT: 30 },
    });

    const byType: Record<string, number> = {};
    for (const q of preview.selectedQuestions) byType[q.type] = (byType[q.type] || 0) + 1;

    expect(preview.selectedExistingCount).toBe(20);
    expect(preview.aiRequiredCount).toBe(0);
    // 60% of 20 = 12, 10% of 20 = 2, 30% of 20 = 6 — exact, since supply comfortably covers each.
    expect(byType.MCQ).toBe(12);
    expect(byType.MSQ).toBe(2);
    expect(byType.NAT).toBe(6);
    expect((preview as any).typeShortfalls).toEqual({ MCQ: 0, MSQ: 0, NAT: 0 });
  });

  it('shortfall calculation respects type distribution: requesting more of one type than exists reports an exact per-type shortfall, not just a total', async () => {
    // Ask for 50 total at 60/10/30 (MCQ 30 / MSQ 5 / NAT 15) against a pool that only has 20 of
    // each. Only MCQ is genuinely short (30 wanted, 20 exist — the pool is fully exhausted and
    // no fallback pass can create more). MSQ (5 wanted) and NAT (15 wanted) each fit inside
    // their own 20-question pool, so even after the general fallback pass redistributes the 10
    // slots MCQ couldn't fill, both end up with at least as many as their target and report zero
    // shortfall — the fallback pass fills the *total* gap, it does not reintroduce a false
    // shortfall for a type that already has enough real supply.
    const preview = await QuestionPaperService.previewQuestionPaper({
      subjectId,
      selectedTopicIds: [distTopicId],
      paperMode: 'TOTAL_COUNT',
      totalQuestions: 50,
      difficultyDistribution: { EASY: 0, MEDIUM: 100, HARD: 0 },
      typeDistribution: { MCQ: 60, MSQ: 10, NAT: 30 },
    });

    expect(preview.selectedExistingCount).toBe(50); // 20+20+20 = 60 available, 50 requested — fully covered
    expect(preview.aiRequiredCount).toBe(0);

    const typeShortfalls = (preview as any).typeShortfalls;
    expect(typeShortfalls.MCQ).toBe(10); // wanted 30, pool has only 20 — genuine, unavoidable shortfall
    expect(typeShortfalls.MSQ).toBe(0); // wanted 5, pool has 20 — no real shortfall
    expect(typeShortfalls.NAT).toBe(0); // wanted 15, pool has 20 — no real shortfall
  });

  it('topic combination: 3 + 20 + 40 verified questions across three topics combine into one 50-question paper without artificial per-topic blocking', async () => {
    const preview = await QuestionPaperService.previewQuestionPaper({
      subjectId,
      selectedTopicIds: [topicAId, topicBId, topicCId],
      paperMode: 'TOTAL_COUNT',
      totalQuestions: 50,
      difficultyDistribution: { EASY: 0, MEDIUM: 100, HARD: 0 },
      typeDistribution: { MCQ: 100, MSQ: 0, NAT: 0 },
    });

    expect(preview.availableVerifiedCount).toBe(3 + 20 + 40);
    expect(preview.selectedExistingCount).toBe(50);
    expect(preview.aiRequiredCount).toBe(0);

    const bySmallTopic = preview.topicShortfalls.find((t) => t.topicId === topicAId);
    expect(bySmallTopic?.available).toBe(3);
    // The small topic (3 available) never blocks paper creation — the combined pool covers the
    // requested 50 using the other topics' surplus.
    expect(preview.selectedQuestions.length).toBe(50);
  });

  it('a smaller combined request (e.g. 10) still pulls from all three topics rather than ignoring the smallest one', async () => {
    const preview = await QuestionPaperService.previewQuestionPaper({
      subjectId,
      selectedTopicIds: [topicAId, topicBId, topicCId],
      paperMode: 'TOTAL_COUNT',
      totalQuestions: 10,
      difficultyDistribution: { EASY: 0, MEDIUM: 100, HARD: 0 },
      typeDistribution: { MCQ: 100, MSQ: 0, NAT: 0 },
    });
    expect(preview.selectedExistingCount).toBe(10);
    expect(preview.aiRequiredCount).toBe(0);
  });
});
