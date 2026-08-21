import { SolutionService } from '../services/solutionService';
import { AIProviderService } from '../services/aiProviderService';
import { EmbeddingProvider } from '../services/embeddingProvider';
import { prisma } from '../../../config/prisma';
import { Role, QuestionType, Difficulty, AISolutionStatus, AIDocumentVisibility, AIDocumentStatus } from '@prisma/client';

describe('SolutionService Integration & Faculty Review Tests', () => {
  jest.setTimeout(30000);

  const testUserId = 'sol-test-user-' + Date.now();
  const testSubtopicId = 'sol-test-subtop-' + Date.now();
  const testTopicId = 'sol-test-top-' + Date.now();
  const testModuleId = 'sol-test-mod-' + Date.now();
  const testSubjectId = 'sol-test-subj-' + Date.now();
  const testDocId = 'sol-test-doc-' + Date.now();
  const testQuestionId = 'sol-test-q-' + Date.now();
  const testReqId = 'sol-test-req-' + Date.now();

  let providerSpy: jest.SpyInstance;

  beforeAll(async () => {
    providerSpy = jest.spyOn(AIProviderService, 'generateResponse').mockImplementation(async (sys, hist, userMsg) => {
      if (userMsg.includes('INDEPENDENT SECOND-PASS')) {
        return {
          success: true,
          content: JSON.stringify({
            isCorrectAnswerMatching: true,
            explanationQualityScore: 0.95,
            verificationVerdict: 'PASS',
            notes: 'Verified against RAG context.',
          }),
        };
      }

      return {
        success: true,
        content: JSON.stringify({
          correctAnswer: [1],
          explanation: 'Kruskal algorithm builds MST in O(E log V) using disjoint set union data structure.',
          reasoningSteps: ['Step 1: Sort edges.', 'Step 2: Add non-cycle edges.'],
        }),
      };
    });

    await prisma.user.create({
      data: {
        id: testUserId,
        name: 'Solution Faculty',
        email: `sol_fac_${Date.now()}@cit.edu.in`,
        role: 'FACULTY',
        department: 'CSE',
      },
    });

    const subj = await prisma.subject.create({
      data: { id: testSubjectId, name: 'Graph Algorithms', code: 'CS_GA_' + Date.now(), department: 'CSE' },
    });
    const mod = await prisma.module.create({
      data: { id: testModuleId, name: 'MST Algorithms', subjectId: subj.id },
    });
    const top = await prisma.topic.create({
      data: { id: testTopicId, name: 'Kruskal Algorithm', moduleId: mod.id },
    });
    const subtop = await prisma.subtopic.create({
      data: { id: testSubtopicId, name: 'Disjoint Sets', topicId: top.id },
    });

    const embedRes = await EmbeddingProvider.generateQueryEmbedding('Graph Algorithms Kruskal Algorithm MST Disjoint Sets O(E log V)');

    await prisma.aIDocument.create({
      data: {
        id: testDocId,
        title: 'Kruskal Algorithm Lecture Notes',
        fileName: 'kruskal.pdf',
        mimeType: 'application/pdf',
        fileSize: 1024,
        visibility: AIDocumentVisibility.PUBLIC,
        status: AIDocumentStatus.READY,
        storageKey: 'kruskal-gen-key-' + Date.now(),
        uploadedById: testUserId,
        chunks: {
          create: {
            chunkIndex: 0,
            content: 'Kruskal algorithm calculates Minimum Spanning Tree using Disjoint Set Union in O(E log V) time.',
            tokenCount: 15,
            embedding: embedRes.embedding,
          },
        },
      },
    });

    await prisma.question.create({
      data: {
        id: testQuestionId,
        text: 'What is the time complexity of Kruskal Algorithm for Minimum Spanning Tree?',
        type: QuestionType.MCQ,
        difficulty: Difficulty.MEDIUM,
        marks: 1.0,
        options: [{ text: 'O(V^2)' }, { text: 'O(E log V)' }, { text: 'O(V)' }, { text: 'O(1)' }],
        correctAnswer: [1],
        subtopicId: subtop.id,
        createdById: testUserId,
      },
    });
  });

  afterAll(async () => {
    providerSpy.mockRestore();
    await prisma.aISolution.deleteMany({ where: { generatedById: testUserId } });
    await prisma.question.deleteMany({ where: { id: testQuestionId } });
    await prisma.aIDocument.deleteMany({ where: { id: testDocId } });
    await prisma.subtopic.deleteMany({ where: { id: testSubtopicId } });
    await prisma.topic.deleteMany({ where: { id: testTopicId } });
    await prisma.module.deleteMany({ where: { id: testModuleId } });
    await prisma.subject.deleteMany({ where: { id: testSubjectId } });
    await prisma.user.deleteMany({ where: { id: testUserId } });
  });

  it('should generate grounded AI solution for an approved Question and pass independent verification', async () => {
    const result = await SolutionService.generateSolution(testUserId, Role.FACULTY, {
      questionId: testQuestionId,
      generationRequestId: testReqId,
    });

    expect(result.success).toBe(true);
    expect(result.solution).toBeDefined();

    const sol = result.solution!;
    expect(sol.status).toBe(AISolutionStatus.PENDING_REVIEW);
    expect(sol.draftExplanation).toContain('Kruskal algorithm builds MST');
  });

  it('should return idempotent replay when same generationRequestId is sent', async () => {
    const replay = await SolutionService.generateSolution(testUserId, Role.FACULTY, {
      questionId: testQuestionId,
      generationRequestId: testReqId,
    });

    expect(replay.success).toBe(true);
    expect(replay.message).toContain('idempotent');
  });

  it('should support faculty approval: updates official Question explanation in database', async () => {
    const pendingRes = await SolutionService.getPendingSolutions({
      userId: testUserId,
      role: Role.FACULTY,
    });

    expect(pendingRes.success).toBe(true);
    expect(pendingRes.data.length).toBeGreaterThan(0);

    const pendingSol = pendingRes.data[0];
    const approveRes = await SolutionService.approveSolution(pendingSol.id, testUserId, Role.FACULTY);

    expect(approveRes.success).toBe(true);
    expect(approveRes.question.explanation).toBe(pendingSol.draftExplanation);

    const updatedQ = await prisma.question.findUnique({ where: { id: testQuestionId } });
    expect(updatedQ?.explanation).toContain('Kruskal algorithm builds MST');
  });
});
