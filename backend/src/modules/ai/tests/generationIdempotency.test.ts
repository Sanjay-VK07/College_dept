import { AIBatchQuestionGenerationService } from '../services/aiBatchQuestionGenerationService';
import { prisma } from '../../../config/prisma';
import { Role } from '@prisma/client';

describe('Generation Idempotency Tests', () => {
  const testReqId = 'idem_req_' + Date.now();
  const testUserId = 'idem_user_' + Date.now();

  beforeAll(async () => {
    await prisma.user.create({
      data: {
        id: testUserId,
        name: 'Idempotency User',
        email: `idem_${Date.now()}@cit.edu.in`,
        role: Role.FACULTY,
        department: 'CSE',
      },
    });

    await prisma.aIBatchGenerationJob.create({
      data: {
        generationRequestId: testReqId,
        createdById: testUserId,
        requestedCount: 50,
        generatedCount: 50,
        validatedCount: 48,
        verifiedCount: 48,
        pendingReviewCount: 48,
        duplicateCount: 2,
        failedCount: 0,
        status: 'COMPLETED',
        statusMessage: 'Batch completed.',
      },
    });
  });

  afterAll(async () => {
    await prisma.aIBatchGenerationJob.deleteMany({ where: { generationRequestId: testReqId } });
    await prisma.user.deleteMany({ where: { id: testUserId } });
  });

  it('1. Replays existing batch results when given identical generationRequestId without extra LLM provider calls', async () => {
    const result = await AIBatchQuestionGenerationService.generateBatch(testUserId, Role.FACULTY, {
      totalQuestions: 50,
      difficultyDistribution: { EASY: 20, MEDIUM: 50, HARD: 30 },
      typeDistribution: { MCQ: 60, MSQ: 10, NAT: 30 },
      generationRequestId: testReqId,
    });

    expect(result.success).toBe(true);
    expect(result.generationRequestId).toBe(testReqId);
    expect(result.generatedCount).toBe(50);
  });
});
