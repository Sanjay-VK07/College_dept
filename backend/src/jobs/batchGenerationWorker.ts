import { prisma } from '../config/prisma';
import { AIBatchQuestionGenerationService } from '../modules/ai/services/aiBatchQuestionGenerationService';
import { PDFQuestionImportService } from '../modules/ai/services/pdfQuestionImportService';

const POLL_INTERVAL_MS = 5000;
// 45 minutes — a large PDF_IMPORT job first runs the full page-batched structure-extraction
// pipeline (many sequential vision calls for a large document) before per-question verification.
const STALE_THRESHOLD_MS = 45 * 60 * 1000;

const inFlight = new Set<string>();
let timer: NodeJS.Timeout | null = null;

/**
 * In-process, DB-polled background worker for AIBatchGenerationJob rows — same no-Redis pattern
 * as documentProcessingWorker.ts. Batch question generation used to run synchronously inline on
 * the HTTP request (risking request timeouts on free-tier hosts for large batches); it is now
 * enqueued as QUEUED and picked up here.
 */
async function tick() {
  try {
    const staleCutoff = new Date(Date.now() - STALE_THRESHOLD_MS);
    await prisma.aIBatchGenerationJob.updateMany({
      where: { status: 'PROCESSING', updatedAt: { lt: staleCutoff } },
      data: { status: 'FAILED', statusMessage: 'Processing stalled and was not completed within the expected time window.' },
    });

    const queued = await prisma.aIBatchGenerationJob.findMany({
      where: { status: 'QUEUED' },
      take: 3,
      orderBy: { createdAt: 'asc' },
    });

    for (const job of queued) {
      if (inFlight.has(job.generationRequestId)) continue;
      inFlight.add(job.generationRequestId);

      const processor =
        job.jobType === 'PDF_IMPORT'
          ? PDFQuestionImportService.processImportJob(job.generationRequestId)
          : AIBatchQuestionGenerationService.processBatchJob(job.generationRequestId);

      processor
        .catch((err) => console.error(`[batchGenerationWorker] Unhandled error processing ${job.generationRequestId}:`, err))
        .finally(() => inFlight.delete(job.generationRequestId));
    }
  } catch (err) {
    console.error('[batchGenerationWorker] Poll tick failed:', err);
  }
}

export function startBatchGenerationWorker() {
  if (timer) return;
  timer = setInterval(tick, POLL_INTERVAL_MS);
  console.log('🧪 [batchGenerationWorker] Started (polling every', POLL_INTERVAL_MS, 'ms)');
}

export function stopBatchGenerationWorker() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
