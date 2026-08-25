import { prisma } from '../config/prisma';
import { ENV } from '../config/env';
import { DocumentStructureService } from '../modules/ai/services/documentStructureService';

declare global {
  // Prevent duplicate worker timer instantiation in development with hot reload
  // eslint-disable-next-line no-var
  var __docWorkerStarted: boolean | undefined;
}

const POLL_INTERVAL_MS = 5000;
const STALE_THRESHOLD_MS = 15 * 60 * 1000; // 15 minutes

const inFlight = new Set<string>();
let timer: NodeJS.Timeout | null = null;
let isTicking = false;

/**
 * In-process, DB-polled background worker for DocumentProcessingJob rows.
 * Features tick-overlap protection, in-process singleton startup guard, and atomic DB claims.
 */
export async function tickDocumentProcessingWorker() {
  if (isTicking) return;
  isTicking = true;

  const startTime = Date.now();
  try {
    if (!prisma?.documentProcessingJob) {
      return;
    }

    // Recover stale jobs that stalled mid-processing
    const staleCutoff = new Date(Date.now() - STALE_THRESHOLD_MS);
    const staleResult = await prisma.documentProcessingJob.updateMany({
      where: {
        status: { in: ['EXTRACTING', 'OCR', 'STRUCTURING', 'INDEXING', 'CLASSIFYING', 'MAPPING'] },
        updatedAt: { lt: staleCutoff },
      },
      data: { status: 'FAILED', error: 'Processing stalled and was not completed within the expected time window.' },
    });

    if (staleResult.count > 0) {
      console.warn(`[documentProcessingWorker] Reclaimed ${staleResult.count} stale document processing jobs.`);
    }

    const maxConcurrent = ENV.MAX_CONCURRENT_DOCUMENT_UPLOADS || 3;
    const availableSlots = maxConcurrent - inFlight.size;
    if (availableSlots <= 0) return;

    const queued = await prisma.documentProcessingJob.findMany({
      where: { status: 'QUEUED' },
      take: availableSlots,
      orderBy: { createdAt: 'asc' },
      select: { id: true, documentId: true },
    });

    for (const job of queued) {
      if (inFlight.has(job.documentId)) continue;

      // Atomically claim job in DB using updateMany to ensure single processor execution
      const claimed = await prisma.documentProcessingJob.updateMany({
        where: { id: job.id, status: 'QUEUED' },
        data: { status: 'EXTRACTING' },
      });

      if (claimed.count === 0) {
        continue;
      }

      inFlight.add(job.documentId);
      console.log(`[documentProcessingWorker] Claimed job ${job.id} for document ${job.documentId}`);

      DocumentStructureService.processDocument(job.documentId)
        .catch((err) => console.error(`[documentProcessingWorker] Error processing document ${job.documentId}:`, err))
        .finally(() => {
          inFlight.delete(job.documentId);
          console.log(`[documentProcessingWorker] Completed document ${job.documentId} in ${Date.now() - startTime}ms`);
        });
    }
  } catch (err: any) {
    console.error('[documentProcessingWorker] Poll tick failed:', err?.message || err);
  } finally {
    isTicking = false;
  }
}

export function startDocumentProcessingWorker() {
  if (timer || globalThis.__docWorkerStarted) return;
  globalThis.__docWorkerStarted = true;
  timer = setInterval(tickDocumentProcessingWorker, POLL_INTERVAL_MS);
  console.log('📄 [documentProcessingWorker] Started (polling every', POLL_INTERVAL_MS, 'ms)');
}

export function stopDocumentProcessingWorker() {
  if (timer) {
    clearInterval(timer);
    timer = null;
    globalThis.__docWorkerStarted = false;
  }
}

export async function getDocumentProcessingWorkerStats() {
  const queuedCount = await prisma?.documentProcessingJob?.count({
    where: { status: 'QUEUED' },
  }).catch(() => 0) || 0;

  return {
    status: 'healthy',
    active: inFlight.size,
    queued: queuedCount,
    maxConcurrency: ENV.MAX_CONCURRENT_DOCUMENT_UPLOADS || 3,
    maxQueueSize: 20,
  };
}
