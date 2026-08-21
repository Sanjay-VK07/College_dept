import { AIChatService } from '../services/aiChatService';
import { AIProviderService } from '../services/aiProviderService';
import { EmbeddingProvider } from '../services/embeddingProvider';
import { prisma } from '../../../config/prisma';
import { AIRequestStatus, AIRAGTraceStatus, AIDocumentVisibility, AIDocumentStatus } from '@prisma/client';

describe('FINAL PHASE 2E RUNTIME ACCEPTANCE VERIFICATION', () => {
  jest.setTimeout(30000);

  const runtimeUserId = 'runtime-audit-user-' + Date.now();
  const runtimeConvId = 'runtime-audit-conv-' + Date.now();
  const runtimeReqId = 'runtime-audit-req-' + Date.now();
  const runtimeDocId = 'runtime-audit-doc-' + Date.now();
  let providerSpy: jest.SpyInstance;

  beforeAll(async () => {
    // Spy on AIProviderService to mock successful LLM provider invocation
    providerSpy = jest.spyOn(AIProviderService, 'generateResponse').mockResolvedValue({
      success: true,
      type: 'SUCCESS',
      content: 'Dijkstra shortest path algorithm time complexity is O((V + E) log V).',
    });

    // Create authentic test user in PostgreSQL database
    await prisma.user.create({
      data: {
        id: runtimeUserId,
        name: 'Runtime Audit Student',
        email: `runtime_audit_${Date.now()}@cit.edu.in`,
        role: 'STUDENT',
        department: 'Computer Science and Engineering',
      },
    });

    await prisma.aIConversation.create({
      data: {
        id: runtimeConvId,
        userId: runtimeUserId,
        title: 'Runtime Acceptance Audit Conversation',
      },
    });

    // Create authorized PUBLIC document and chunk for RAG vector search verification
    const textQuery = 'Dijkstra shortest path algorithm time complexity O((V + E) log V)';
    const embedRes = await EmbeddingProvider.generateQueryEmbedding(textQuery);

    await prisma.aIDocument.create({
      data: {
        id: runtimeDocId,
        title: 'Algorithms Knowledge Base - Dijkstra',
        fileName: 'dijkstra.pdf',
        mimeType: 'application/pdf',
        fileSize: 1024,
        visibility: AIDocumentVisibility.PUBLIC,
        status: AIDocumentStatus.READY,
        storageKey: 'dijkstra-test-key-' + Date.now(),
        uploadedById: runtimeUserId,
        chunks: {
          create: {
            chunkIndex: 0,
            content: textQuery,
            tokenCount: 15,
            embedding: embedRes.embedding,
          },
        },
      },
    });
  });

  afterAll(async () => {
    providerSpy.mockRestore();
    await prisma.aIRAGTrace.deleteMany({ where: { conversationId: runtimeConvId } });
    await prisma.aIMessage.deleteMany({ where: { conversationId: runtimeConvId } });
    await prisma.aIConversation.deleteMany({ where: { id: runtimeConvId } });
    await prisma.aIDocument.deleteMany({ where: { id: runtimeDocId } });
    await prisma.user.deleteMany({ where: { id: runtimeUserId } });
  });

  it('STEP 4 — REAL AI CHAT TEST: verifies processing state machine, trace creation, message linkage, and completion', async () => {
    const promptMessage = 'What is Dijkstra algorithm shortest path complexity?';

    // 1. Process AI Chat Request
    const response = await AIChatService.processChatMessage(
      runtimeUserId,
      'STUDENT',
      promptMessage,
      runtimeConvId,
      runtimeReqId
    );

    expect(response).toBeDefined();
    expect(response.success).toBe(true);
    expect(response.message).toBeDefined();
    expect(response.message?.content).toContain('Dijkstra');

    const assistantMsgId = response.message!.id;

    // 2. Database State Verification — USER Message
    const userMsg = await prisma.aIMessage.findFirst({
      where: { requestId: runtimeReqId },
    });

    expect(userMsg).not.toBeNull();
    expect(userMsg?.requestId).toBe(runtimeReqId);
    expect(userMsg?.status).toBe(AIRequestStatus.COMPLETED);

    // 3. Database State Verification — ASSISTANT Message Linkage
    const assistantMsg = await prisma.aIMessage.findUnique({
      where: { id: assistantMsgId },
    });

    expect(assistantMsg).not.toBeNull();
    expect(assistantMsg?.parentUserMessageId).toBe(userMsg?.id);

    // 4. Database State Verification — AIRAGTrace Linkage & Lifecycle
    const trace = await prisma.aIRAGTrace.findUnique({
      where: { requestId: runtimeReqId },
    });

    expect(trace).not.toBeNull();
    expect(trace?.requestId).toBe(runtimeReqId);
    expect(trace?.conversationId).toBe(runtimeConvId);
    expect(trace?.userId).toBe(runtimeUserId);
    expect(trace?.userMessageId).toBe(userMsg?.id);
    expect(trace?.assistantMessageId).toBe(assistantMsgId);
    expect([AIRAGTraceStatus.COMPLETED, AIRAGTraceStatus.NO_RELEVANT_CONTEXT]).toContain(trace?.status);
    expect(trace?.totalDurationMs).toBeGreaterThan(0);
  });

  it('STEP 5 — REAL COMPLETED IDEMPOTENCY TEST: verifies replay creates zero new messages and zero new traces', async () => {
    const providerCallsBefore = providerSpy.mock.calls.length;

    // Record exact database table counts BEFORE replay
    const userMsgCountBefore = await prisma.aIMessage.count({
      where: { conversationId: runtimeConvId, role: 'USER' },
    });
    const assistantMsgCountBefore = await prisma.aIMessage.count({
      where: { conversationId: runtimeConvId, role: 'ASSISTANT' },
    });
    const traceCountBefore = await prisma.aIRAGTrace.count({
      where: { conversationId: runtimeConvId },
    });

    // Replay the exact SAME requestId for completed request
    const replayResponse = await AIChatService.processChatMessage(
      runtimeUserId,
      'STUDENT',
      'What is Dijkstra algorithm shortest path complexity?',
      runtimeConvId,
      runtimeReqId
    );

    expect(replayResponse).toBeDefined();
    expect(replayResponse.success).toBe(true);

    const providerCallsAfter = providerSpy.mock.calls.length;

    // Record exact database table counts AFTER replay
    const userMsgCountAfter = await prisma.aIMessage.count({
      where: { conversationId: runtimeConvId, role: 'USER' },
    });
    const assistantMsgCountAfter = await prisma.aIMessage.count({
      where: { conversationId: runtimeConvId, role: 'ASSISTANT' },
    });
    const traceCountAfter = await prisma.aIRAGTrace.count({
      where: { conversationId: runtimeConvId },
    });

    // VERIFICATION: Zero provider calls made during completed replay
    expect(providerCallsAfter).toBe(providerCallsBefore);

    // VERIFICATION: Counts must remain 100% UNCHANGED
    expect(userMsgCountAfter).toBe(userMsgCountBefore);
    expect(assistantMsgCountAfter).toBe(assistantMsgCountBefore);
    expect(traceCountAfter).toBe(traceCountBefore);
  });
});
