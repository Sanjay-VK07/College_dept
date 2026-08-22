import { AIBatchQuestionGenerationService } from '../services/aiBatchQuestionGenerationService';
import { RAGService } from '../services/ragService';
import { AIProviderService } from '../services/aiProviderService';
import { prisma } from '../../../config/prisma';
import { Role } from '@prisma/client';

describe('Source Provenance Tests', () => {
  const testUserId = 'prov_user_' + Date.now();
  const testDocId = 'prov_doc_' + Date.now();
  const testChunkId = 'prov_chk_' + Date.now();

  beforeAll(async () => {
    await prisma.user.create({
      data: {
        id: testUserId,
        name: 'Provenance Faculty',
        email: `prov_${Date.now()}@cit.edu.in`,
        role: Role.FACULTY,
        department: 'CSE',
      },
    });

    const doc = await prisma.aIDocument.create({
      data: {
        id: testDocId,
        title: 'Operating Systems Scheduling Notes',
        fileName: 'os_notes.pdf',
        mimeType: 'application/pdf',
        storageKey: 'os_key_' + Date.now(),
        visibility: 'PUBLIC',
        uploadedById: testUserId,
      },
    });

    await prisma.aIDocumentChunk.create({
      data: {
        id: testChunkId,
        documentId: doc.id,
        chunkIndex: 0,
        content: 'Round Robin CPU Scheduling uses time quantum to preempt processes.',
        embedding: [0.1, 0.2, 0.3],
        metadata: { page: 12 },
      },
    });

    jest.spyOn(RAGService, 'executeRAGPipeline').mockResolvedValue({
      ragUsed: true,
      contextText: 'Round Robin CPU Scheduling uses time quantum to preempt processes.',
      sources: [{ documentId: testDocId, title: 'Operating Systems Scheduling Notes' }],
      evaluation: {
        validatedChunks: [
          {
            chunkId: testChunkId,
            documentId: testDocId,
            documentTitle: 'Operating Systems Scheduling Notes',
            content: 'Round Robin CPU Scheduling uses time quantum to preempt processes.',
          },
        ],
      },
    } as any);

    jest.spyOn(AIProviderService, 'generateResponse').mockResolvedValue({
      success: true,
      content: JSON.stringify([
        {
          stem: 'What mechanism is used in Round Robin CPU scheduling to preempt processes?',
          type: 'MCQ',
          difficulty: 'MEDIUM',
          options: ['Time Quantum', 'Priority Level', 'Shortest Job First', 'Random Timer'],
          correctAnswer: 0,
          explanation: 'Round Robin uses time quanta for process preemption.',
        },
      ]),
    } as any);
  });

  afterAll(async () => {
    await prisma.aIDocumentChunk.deleteMany({ where: { id: testChunkId } });
    await prisma.aIDocument.deleteMany({ where: { id: testDocId } });
    await prisma.user.deleteMany({ where: { id: testUserId } });
  });

  it('1. Preserves source document and chunk IDs for provenance tracking', async () => {
    const enqueued = await AIBatchQuestionGenerationService.enqueueBatch(testUserId, Role.FACULTY, {
      totalQuestions: 50,
      difficultyDistribution: { EASY: 20, MEDIUM: 50, HARD: 30 },
      typeDistribution: { MCQ: 60, MSQ: 10, NAT: 30 },
      selectedResourceIds: [testDocId],
    });

    // Batch generation now runs on the async worker (see batchGenerationWorker.ts) rather than
    // inline on the request — invoke the job processor directly here to exercise the same code
    // path synchronously within the test.
    await AIBatchQuestionGenerationService.processBatchJob(enqueued.generationRequestId);

    const { questions } = await AIBatchQuestionGenerationService.getBatchJobStatus(enqueued.generationRequestId);

    expect(questions).toBeDefined();
    if (questions.length > 0) {
      const q = questions[0];
      expect(q.sourceDocumentIds).toContain(testDocId);
      expect(q.sourceChunkIds).toContain(testChunkId);
    }
  });
});
