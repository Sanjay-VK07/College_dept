import { AIBatchQuestionGenerationService } from '../services/aiBatchQuestionGenerationService';
import { AIProviderService } from '../services/aiProviderService';
import { RAGService } from '../services/ragService';
import { prisma } from '../../../config/prisma';
import { Role } from '@prisma/client';

describe('Batch Question Generation Tests', () => {
  jest.setTimeout(90000);

  const testUserId = 'batch-user-' + Date.now();

  beforeAll(async () => {
    await prisma.user.create({
      data: {
        id: testUserId,
        name: 'Batch Test Faculty',
        email: `batch_fac_${Date.now()}@cit.edu.in`,
        role: Role.FACULTY,
        department: 'CSE',
      },
    });

    jest.spyOn(RAGService, 'executeRAGPipeline').mockResolvedValue({
      ragUsed: true,
      contextText: 'Virtual Memory Paging replaces pages using LRU strategy.',
      sources: [{ documentId: 'doc-1', title: 'OS Paging' }],
      evaluation: {
        validatedChunks: [
          { chunkId: 'chk-1', documentId: 'doc-1', documentTitle: 'OS Paging', content: 'Virtual Memory Paging replaces pages using LRU strategy.' }
        ]
      }
    } as any);

    jest.spyOn(AIProviderService, 'generateResponse').mockResolvedValue({
      success: true,
      content: JSON.stringify([
        {
          stem: 'What strategy is used in virtual memory paging?',
          type: 'MCQ',
          difficulty: 'EASY',
          options: ['LRU Strategy', 'FIFO Strategy', 'LIFO Strategy', 'Random Strategy'],
          correctAnswer: 0,
          explanation: 'LRU strategy replaces least recently used pages in memory.'
        }
      ])
    } as any);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: testUserId } });
  });

  it('1. Default generation count = 50', async () => {
    const result = await AIBatchQuestionGenerationService.generateBatch(testUserId, Role.FACULTY, {
      totalQuestions: 50,
      difficultyDistribution: { EASY: 20, MEDIUM: 50, HARD: 30 },
      typeDistribution: { MCQ: 60, MSQ: 10, NAT: 30 },
    });

    expect(result).toBeDefined();
    expect(result.requestedCount).toBe(50);
  });

  it('2. Accepts valid 50 questions request', async () => {
    const result = await AIBatchQuestionGenerationService.generateBatch(testUserId, Role.FACULTY, {
      totalQuestions: 50,
      difficultyDistribution: { EASY: 20, MEDIUM: 50, HARD: 30 },
      typeDistribution: { MCQ: 60, MSQ: 10, NAT: 30 },
    });

    expect(result.status).not.toBe('INVALID_GENERATION_COUNT');
  });

  it('3. Rejects count below 50', async () => {
    const result = await AIBatchQuestionGenerationService.generateBatch(testUserId, Role.FACULTY, {
      totalQuestions: 10,
      difficultyDistribution: { EASY: 20, MEDIUM: 50, HARD: 30 },
      typeDistribution: { MCQ: 60, MSQ: 10, NAT: 30 },
    });

    expect(result.status).toBe('INVALID_GENERATION_COUNT');
  });

  it('4. Rejects count above configured maximum', async () => {
    const result = await AIBatchQuestionGenerationService.generateBatch(testUserId, Role.FACULTY, {
      totalQuestions: 2000,
      difficultyDistribution: { EASY: 20, MEDIUM: 50, HARD: 30 },
      typeDistribution: { MCQ: 60, MSQ: 10, NAT: 30 },
    });

    expect(result.status).toBe('INVALID_GENERATION_COUNT');
  });
});
