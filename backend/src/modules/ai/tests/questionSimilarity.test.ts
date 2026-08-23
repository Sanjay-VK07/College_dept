import { QuestionSimilarityService } from '../services/questionSimilarityService';
import { prisma } from '../../../config/prisma';
import { AIQuestionSimilarityStatus } from '@prisma/client';

describe('QuestionSimilarityService Duplicate Detection Tests', () => {
  const testSubtopicId = 'test-sim-subtopic-' + Date.now();
  const testTopicId = 'test-sim-topic-' + Date.now();
  const testModuleId = 'test-sim-mod-' + Date.now();
  const testSubjectId = 'test-sim-subj-' + Date.now();
  const testUserId = 'test-sim-user-' + Date.now();
  const testQuestionId = 'test-sim-q-' + Date.now();

  beforeAll(async () => {
    await prisma.user.create({
      data: {
        id: testUserId,
        name: 'Similarity Faculty User',
        email: `sim_fac_${Date.now()}@cit.edu.in`,
        role: 'FACULTY',
        department: 'CSE',
      },
    });

    const subj = await prisma.subject.create({
      data: { id: testSubjectId, name: 'Algorithms', code: 'CS_ALG_' + Date.now(), department: 'CSE' },
    });

    const mod = await prisma.module.create({
      data: { id: testModuleId, name: 'Sorting & Searching', subjectId: subj.id },
    });

    const top = await prisma.topic.create({
      data: { id: testTopicId, name: 'Comparison Sorts', moduleId: mod.id },
    });

    const subtop = await prisma.subtopic.create({
      data: { id: testSubtopicId, name: 'Heap Sort Algorithm', topicId: top.id },
    });

    // Create an existing Question in Question Bank
    await prisma.question.create({
      data: {
        id: testQuestionId,
        text: 'What is the time complexity of Heap Sort algorithm?',
        type: 'MCQ',
        difficulty: 'MEDIUM',
        marks: 1.0,
        options: [{ text: 'O(N log N)' }, { text: 'O(N^2)' }, { text: 'O(N)' }, { text: 'O(1)' }],
        correctAnswer: [0],
        explanation: 'Heap Sort builds a max heap in O(N) and performs N extract max operations taking O(N log N).',
        subtopicId: subtop.id,
        createdById: testUserId,
      },
    });
  });

  afterAll(async () => {
    await prisma.question.deleteMany({ where: { id: testQuestionId } });
    await prisma.subtopic.deleteMany({ where: { id: testSubtopicId } });
    await prisma.topic.deleteMany({ where: { id: testTopicId } });
    await prisma.module.deleteMany({ where: { id: testModuleId } });
    await prisma.subject.deleteMany({ where: { id: testSubjectId } });
    await prisma.user.deleteMany({ where: { id: testUserId } });
  });

  it('should detect exact duplicate question stems in the Question Bank', async () => {
    const result = await QuestionSimilarityService.checkSimilarity(
      'What is the time complexity of Heap Sort algorithm?',
      testSubtopicId
    );

    expect(result.status).toBe(AIQuestionSimilarityStatus.DUPLICATE);
    expect(result.similarityScore).toBe(1.0);
    expect(result.similarQuestionId).toBe(testQuestionId);
  });

  it('should classify completely unique question stem as UNIQUE', async () => {
    const result = await QuestionSimilarityService.checkSimilarity(
      'Explain how Dijkstra algorithm uses priority queue for single source shortest paths.',
      testSubtopicId
    );

    expect(result.status).toBe(AIQuestionSimilarityStatus.UNIQUE);
    // Real semantic embeddings rarely produce an exact 0.0 cosine similarity for unrelated text
    // (unlike the old lexical-overlap check this asserted against) — just confirm it's low.
    // 0.75 rather than a tighter bound: live testing has shown genuinely unrelated questions can
    // still score ~0.5 depending on embedding variance, so a tighter cutoff risks flakiness.
    expect(result.similarityScore).toBeLessThan(0.75);
  });
});
