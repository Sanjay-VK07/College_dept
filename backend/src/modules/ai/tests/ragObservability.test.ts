import { RAGObservabilityService } from '../services/ragObservabilityService';
import { prisma } from '../../../config/prisma';
import { AIRAGDecision, AIRAGTraceStatus } from '@prisma/client';

describe('RAGObservabilityService Integration & Idempotency Tests', () => {
  const testUserId = 'test-obs-user-' + Date.now();
  const testConvId = 'test-obs-conv-' + Date.now();
  const testReqId = 'test-obs-req-' + Date.now();

  beforeAll(async () => {
    // Create test user and conversation in database
    await prisma.user.create({
      data: {
        id: testUserId,
        name: 'Test Observability Student',
        email: `testobs_${Date.now()}@cit.edu.in`,
        role: 'STUDENT',
        department: 'Computer Science and Engineering',
      },
    });

    await prisma.aIConversation.create({
      data: {
        id: testConvId,
        userId: testUserId,
        title: 'Observability Test Conv',
      },
    });
  });

  afterAll(async () => {
    // Clean up test data
    await prisma.aIConversation.deleteMany({ where: { id: testConvId } });
    await prisma.user.deleteMany({ where: { id: testUserId } });
  });

  it('should create initial trace with status PROCESSING', async () => {
    const trace = await RAGObservabilityService.createInitialTrace({
      requestId: testReqId,
      conversationId: testConvId,
      userId: testUserId,
    });

    expect(trace).toBeDefined();
    expect(trace.requestId).toBe(testReqId);
    expect(trace.status).toBe(AIRAGTraceStatus.PROCESSING);
    expect(trace.ragUsed).toBe(false);
  });

  it('should safely handle requestId retries using upsert without P2002 unique constraint error', async () => {
    // Attempt creating trace with same requestId (retry scenario)
    const retriedTrace = await RAGObservabilityService.createInitialTrace({
      requestId: testReqId,
      conversationId: testConvId,
      userId: testUserId,
    });

    expect(retriedTrace).toBeDefined();
    expect(retriedTrace.requestId).toBe(testReqId);
    expect(retriedTrace.status).toBe(AIRAGTraceStatus.PROCESSING);

    // Verify only ONE trace row exists in DB for this requestId
    const traceCount = await prisma.aIRAGTrace.count({ where: { requestId: testReqId } });
    expect(traceCount).toBe(1);
  });

  it('should incrementally update metrics and finalize trace status to COMPLETED', async () => {
    const updated = await RAGObservabilityService.updateTrace(testReqId, testReqId, {
      ragDecision: AIRAGDecision.USED,
      ragUsed: true,
      status: AIRAGTraceStatus.COMPLETED,
      embeddingDurationMs: 45,
      vectorSearchDurationMs: 120,
      contextAssemblyDurationMs: 15,
      providerDurationMs: 650,
      totalDurationMs: 830,
      authorizedChunksFound: 3,
      relevantChunksUsed: 2,
    });

    expect(updated).toBeDefined();
    expect(updated?.status).toBe(AIRAGTraceStatus.COMPLETED);
    expect(updated?.ragUsed).toBe(true);
    expect(updated?.totalDurationMs).toBe(830);
  });

  it('should support dual-path trace creation when requestId is undefined/null', async () => {
    const nullReqTrace = await RAGObservabilityService.createInitialTrace({
      conversationId: testConvId,
      userId: testUserId,
    });

    expect(nullReqTrace).toBeDefined();
    expect(nullReqTrace.requestId).toBeNull();
    expect(nullReqTrace.status).toBe(AIRAGTraceStatus.PROCESSING);
  });
});
