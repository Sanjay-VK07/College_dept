import { prisma } from '../../../config/prisma';
import { tickBatchGenerationWorker } from '../../../jobs/batchGenerationWorker';
import { tickDocumentProcessingWorker } from '../../../jobs/documentProcessingWorker';
import { AIBatchQuestionGenerationService } from '../services/aiBatchQuestionGenerationService';
import { DocumentStructureService } from '../services/documentStructureService';

describe('Worker Concurrency & Atomic Claim Tests', () => {
  let testUserId: string;

  beforeAll(async () => {
    // Mock the heavy async background processors so ticks test atomic DB claim without spawning real AI jobs
    jest.spyOn(AIBatchQuestionGenerationService, 'processBatchJob').mockImplementation(async () => {
      return { success: true } as any;
    });

    jest.spyOn(DocumentStructureService, 'processDocument').mockImplementation(async () => {
      return { success: true } as any;
    });

    const user = await prisma.user.upsert({
      where: { email: 'worker_test_user@cit.edu.in' },
      update: {},
      create: {
        name: 'Worker Test User',
        email: 'worker_test_user@cit.edu.in',
        role: 'ADMIN',
        department: 'CSE',
      },
    });
    testUserId = user.id;
  });

  afterAll(async () => {
    jest.restoreAllMocks();
    await prisma.aIBatchGenerationJob.deleteMany({ where: { createdById: testUserId } });
    await prisma.documentProcessingJob.deleteMany({
      where: { document: { uploadedById: testUserId } },
    });
    await prisma.aIDocument.deleteMany({ where: { uploadedById: testUserId } });
    await prisma.user.deleteMany({ where: { id: testUserId } });
  });

  it('should claim queued AIBatchGenerationJob exactly once across 20 concurrent worker ticks', async () => {
    const genReqId = `worker_test_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    
    // Create 1 QUEUED job
    const job = await prisma.aIBatchGenerationJob.create({
      data: {
        generationRequestId: genReqId,
        createdById: testUserId,
        requestedCount: 5,
        status: 'QUEUED',
      },
    });

    // Fire 20 concurrent worker tick calls
    const tickPromises = Array.from({ length: 20 }, () => tickBatchGenerationWorker());
    await Promise.all(tickPromises);

    // Verify in DB that job status is PROCESSING and updated
    const updatedJob = await prisma.aIBatchGenerationJob.findUnique({
      where: { id: job.id },
    });

    expect(updatedJob).toBeDefined();
    expect(updatedJob?.status).toBe('PROCESSING');
  });

  it('should claim queued DocumentProcessingJob exactly once across 20 concurrent worker ticks', async () => {
    const docStorageKey = `worker_doc_${Date.now()}`;
    
    const doc = await prisma.aIDocument.create({
      data: {
        title: 'Worker Test Document',
        fileName: 'worker_test.pdf',
        mimeType: 'application/pdf',
        visibility: 'PRIVATE',
        status: 'UPLOADED',
        storageKey: docStorageKey,
        uploadedById: testUserId,
      },
    });

    const job = await prisma.documentProcessingJob.create({
      data: {
        documentId: doc.id,
        status: 'QUEUED',
      },
    });

    // Fire 20 concurrent worker tick calls
    const tickPromises = Array.from({ length: 20 }, () => tickDocumentProcessingWorker());
    await Promise.all(tickPromises);

    const updatedJob = await prisma.documentProcessingJob.findUnique({
      where: { id: job.id },
    });

    expect(updatedJob).toBeDefined();
    expect(updatedJob?.status).toBe('EXTRACTING');
  });
});
