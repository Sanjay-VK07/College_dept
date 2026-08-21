import { QuestionGenerationService } from '../services/questionGenerationService';
import { AIProviderService } from '../services/aiProviderService';
import { RAGService } from '../services/ragService';
import { EmbeddingProvider } from '../services/embeddingProvider';
import { prisma } from '../../../config/prisma';
import { Role, QuestionType, Difficulty, AIGeneratedQuestionStatus, AIDocumentVisibility, AIDocumentStatus } from '@prisma/client';

describe('QuestionGenerationService Integration & Review Pipeline Tests', () => {
  jest.setTimeout(30000);

  const testUserId = 'gen-test-user-' + Date.now();
  const testSubtopicId = 'gen-test-subtop-' + Date.now();
  const testTopicId = 'gen-test-top-' + Date.now();
  const testModuleId = 'gen-test-mod-' + Date.now();
  const testSubjectId = 'gen-test-subj-' + Date.now();
  const testDocId = 'gen-test-doc-' + Date.now();
  const testReqId = 'gen-test-req-' + Date.now();

  let providerSpy: jest.SpyInstance;
  let ragSpy: jest.SpyInstance;

  beforeAll(async () => {
    // Spy on RAGService to return validated chunk
    ragSpy = jest.spyOn(RAGService, 'executeRAGPipeline').mockResolvedValue({
      ragDecision: 'SEARCH_SUCCESS' as any,
      ragUsed: true,
      contextText: 'Bottom-up heap building builds a heap of N elements in O(N) time.',
      sources: [{ documentId: testDocId, title: 'Data Structures Lecture Notes - Heaps' }],
      evaluation: {
        qualityClassification: 'HIGH_CONFIDENCE' as any,
        qualityScore: 0.9,
        averageSimilarity: 0.9,
        authorizedChunksFound: 1,
        relevantChunksUsed: 1,
        sourceDocumentCount: 1,
        duplicateChunkRatio: 0,
        contextUtilization: 1,
        validatedChunks: [
          {
            chunkId: 'chunk-1',
            documentId: testDocId,
            documentTitle: 'Data Structures Lecture Notes - Heaps',
            content: 'Bottom-up heap building builds a heap of N elements in O(N) time.',
            similarityScore: 0.9,
          },
        ],
        validatedSources: [{ documentId: testDocId, title: 'Data Structures Lecture Notes - Heaps' }],
      },
      embeddingDurationMs: 10,
      vectorSearchDurationMs: 10,
      contextAssemblyDurationMs: 10,
    });

    // Spy on AIProviderService to return valid GATE MCQ structured JSON
    providerSpy = jest.spyOn(AIProviderService, 'generateResponse').mockResolvedValue({
      success: true,
      type: 'SUCCESS',
      content: JSON.stringify({
        questions: [
          {
            type: 'MCQ',
            stem: 'What is the time complexity of building a heap from an unsorted array of N elements?',
            options: ['O(N)', 'O(N log N)', 'O(N^2)', 'O(1)'],
            correctAnswer: [0],
            explanation: 'Bottom-up heap construction runs in O(N) linear time.',
            difficulty: 'MEDIUM',
          },
        ],
      }),
    });

    // Create Faculty User in DB
    await prisma.user.create({
      data: {
        id: testUserId,
        name: 'Question Gen Faculty',
        email: `qgen_fac_${Date.now()}@cit.edu.in`,
        role: 'FACULTY',
        department: 'CSE',
      },
    });

    // Create Taxonomy
    const subj = await prisma.subject.create({
      data: { id: testSubjectId, name: 'Data Structures', code: 'CS_DS_' + Date.now(), department: 'CSE' },
    });
    const mod = await prisma.module.create({
      data: { id: testModuleId, name: 'Heaps & Trees', subjectId: subj.id },
    });
    const top = await prisma.topic.create({
      data: { id: testTopicId, name: 'Binary Heaps', moduleId: mod.id },
    });
    const subtop = await prisma.subtopic.create({
      data: { id: testSubtopicId, name: 'Heap Building', topicId: top.id },
    });

    // Create authorized Document and Chunk for RAG retrieval
    const textQuery = 'GATE exam question concepts Data Structures Heap Building time complexity O(N)';
    const embedRes = await EmbeddingProvider.generateQueryEmbedding(textQuery);

    await prisma.aIDocument.create({
      data: {
        id: testDocId,
        title: 'Data Structures Lecture Notes - Heaps',
        fileName: 'heaps.pdf',
        mimeType: 'application/pdf',
        fileSize: 2048,
        visibility: AIDocumentVisibility.PUBLIC,
        status: AIDocumentStatus.READY,
        storageKey: 'heaps-gen-key-' + Date.now(),
        uploadedById: testUserId,
        chunks: {
          create: {
            chunkIndex: 0,
            content: 'Bottom-up heap building builds a heap of N elements in O(N) time.',
            tokenCount: 20,
            embedding: embedRes.embedding,
          },
        },
      },
    });
  });

  afterAll(async () => {
    providerSpy.mockRestore();
    if (ragSpy) ragSpy.mockRestore();
    await prisma.aIGeneratedQuestion.deleteMany({ where: { createdById: testUserId } });
    await prisma.aIQuestionGenerationTrace.deleteMany({ where: { generatedById: testUserId } });
    await prisma.aIDocument.deleteMany({ where: { id: testDocId } });
    await prisma.subtopic.deleteMany({ where: { id: testSubtopicId } });
    await prisma.topic.deleteMany({ where: { id: testTopicId } });
    await prisma.module.deleteMany({ where: { id: testModuleId } });
    await prisma.subject.deleteMany({ where: { id: testSubjectId } });
    await prisma.user.deleteMany({ where: { id: testUserId } });
  });

  it('should generate GATE questions grounded in authorized RAG context', async () => {
    const result = await QuestionGenerationService.generateQuestions(testUserId, Role.FACULTY, {
      subjectId: testSubjectId,
      moduleId: testModuleId,
      topicId: testTopicId,
      subtopicId: testSubtopicId,
      questionType: QuestionType.MCQ,
      difficulty: Difficulty.MEDIUM,
      count: 1,
      generationRequestId: testReqId,
    });

    expect(result).toBeDefined();
    expect(result.success).toBe(true);
    expect(result.generatedCount).toBe(1);
    expect(result.questions.length).toBe(1);

    const genQ = result.questions[0];
    expect(genQ.status).toBe(AIGeneratedQuestionStatus.PENDING_REVIEW);
    expect(genQ.stem).toContain('time complexity of building a heap');
  });

  it('should return idempotent replay when same generationRequestId is provided', async () => {
    const replayResult = await QuestionGenerationService.generateQuestions(testUserId, Role.FACULTY, {
      generationRequestId: testReqId,
    });

    expect(replayResult.success).toBe(true);
    expect(replayResult.message).toContain('idempotent');
    expect(replayResult.questions.length).toBe(1);
  });

  it('should support faculty review: approval creates a live Question in Question Bank', async () => {
    // 1. Get pending question
    const pendingRes = await QuestionGenerationService.getPendingQuestions({
      userId: testUserId,
      role: Role.FACULTY,
      status: AIGeneratedQuestionStatus.PENDING_REVIEW,
    });

    expect(pendingRes.success).toBe(true);
    expect(pendingRes.data.length).toBeGreaterThan(0);

    const pendingQ = pendingRes.data[0];

    // 2. Approve Question
    const approveRes = await QuestionGenerationService.approveQuestion(pendingQ.id, testUserId, Role.FACULTY);

    expect(approveRes.success).toBe(true);
    expect(approveRes.question).toBeDefined();

    const liveQId = approveRes.question!.id;

    // Verify live Question Bank database record exists
    const liveQ = await prisma.question.findUnique({ where: { id: liveQId } });
    expect(liveQ).not.toBeNull();
    expect(liveQ?.text).toBe(pendingQ.stem);

    // Clean up created live Question
    await prisma.question.delete({ where: { id: liveQId } });
  });
});
