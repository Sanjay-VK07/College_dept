import { prisma } from '../config/prisma';
import { AIBatchQuestionGenerationService } from '../modules/ai/services/aiBatchQuestionGenerationService';
import { PDFQuestionImportService } from '../modules/ai/services/pdfQuestionImportService';

declare global {
  // Prevent duplicate worker timer instantiation in development with hot reload
  // eslint-disable-next-line no-var
  var __batchWorkerStarted: boolean | undefined;
}

const POLL_INTERVAL_MS = 5000;
const STALE_THRESHOLD_MS = 45 * 60 * 1000; // 45 minutes

const inFlight = new Set<string>();
let timer: NodeJS.Timeout | null = null;
let isTicking = false;

/**
 * In-process, DB-polled background worker for AIBatchGenerationJob rows.
 * Features tick-overlap protection, in-process singleton startup guard, and atomic DB claims.
 */
export async function tickBatchGenerationWorker() {
  if (isTicking) return;
  isTicking = true;

  const startTime = Date.now();
  try {
    if (!prisma?.aIBatchGenerationJob) return;

    // Recover stale batch jobs
    const staleCutoff = new Date(Date.now() - STALE_THRESHOLD_MS);
    const staleResult = await prisma.aIBatchGenerationJob.updateMany({
      where: { status: 'PROCESSING', updatedAt: { lt: staleCutoff } },
      data: { status: 'FAILED', statusMessage: 'Processing stalled and was not completed within the expected time window.' },
    });

    if (staleResult.count > 0) {
      console.warn(`[batchGenerationWorker] Reclaimed ${staleResult.count} stale batch generation jobs.`);
    }

    const queued = await prisma.aIBatchGenerationJob.findMany({
      where: { status: 'QUEUED' },
      take: 3,
      orderBy: { createdAt: 'asc' },
      select: { id: true, generationRequestId: true, jobType: true },
    });

    for (const job of queued) {
      if (inFlight.has(job.generationRequestId)) continue;

      // Atomically claim job in DB using updateMany to prevent duplicate pickup across workers
      const claimed = await prisma.aIBatchGenerationJob.updateMany({
        where: { id: job.id, status: 'QUEUED' },
        data: { status: 'PROCESSING' },
      });

      if (claimed.count === 0) {
        continue;
      }

      inFlight.add(job.generationRequestId);
      console.log(`[batchGenerationWorker] Claimed job ${job.id} (request: ${job.generationRequestId}, type: ${job.jobType})`);

      const processor =
        job.jobType === 'PDF_IMPORT'
          ? PDFQuestionImportService.processImportJob(job.generationRequestId)
          : AIBatchQuestionGenerationService.processBatchJob(job.generationRequestId);

      processor
        .catch((err) => console.error(`[batchGenerationWorker] Error processing job ${job.generationRequestId}:`, err))
        .finally(() => {
          inFlight.delete(job.generationRequestId);
          console.log(`[batchGenerationWorker] Completed batch job ${job.generationRequestId} in ${Date.now() - startTime}ms`);
        });
    }
  } catch (err: any) {
    console.error('[batchGenerationWorker] Poll tick failed:', err?.message || err);
  } finally {
    isTicking = false;
  }
}

export function startBatchGenerationWorker() {
  if (timer || globalThis.__batchWorkerStarted) return;
  globalThis.__batchWorkerStarted = true;
  timer = setInterval(tickBatchGenerationWorker, POLL_INTERVAL_MS);
  console.log('🧪 [batchGenerationWorker] Started (polling every', POLL_INTERVAL_MS, 'ms)');
}

export function stopBatchGenerationWorker() {
  if (timer) {
    clearInterval(timer);
    timer = null;
    globalThis.__batchWorkerStarted = false;
  }
}
