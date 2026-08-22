import { prisma } from '../config/prisma';
import { DocumentStructureService } from '../modules/ai/services/documentStructureService';

const POLL_INTERVAL_MS = 5000;
const STALE_THRESHOLD_MS = 15 * 60 * 1000; // 15 minutes

const inFlight = new Set<string>();
let timer: NodeJS.Timeout | null = null;

/**
 * In-process, DB-polled background worker for DocumentProcessingJob rows — no Redis/queue
 * infrastructure required, so this runs within this app's free-tier hosting constraints. Only
 * one Node process is assumed (no horizontal scaling), so an in-memory `inFlight` set is enough
 * to prevent double-dispatch of the same job within this process.
 */
async function tick() {
  try {
    // Reclaim jobs that died mid-processing (e.g. a server restart) instead of leaving them
    // stuck forever — mirrors the intent of the existing (previously-unused) recoverStaleJobs().
    const staleCutoff = new Date(Date.now() - STALE_THRESHOLD_MS);
    await prisma.documentProcessingJob.updateMany({
      where: {
        status: { in: ['EXTRACTING', 'OCR', 'STRUCTURING', 'INDEXING', 'CLASSIFYING', 'MAPPING'] },
        updatedAt: { lt: staleCutoff },
      },
      data: { status: 'FAILED', error: 'Processing stalled and was not completed within the expected time window.' },
    });

    const queued = await prisma.documentProcessingJob.findMany({
      where: { status: 'QUEUED' },
      take: 3,
      orderBy: { createdAt: 'asc' },
    });

    for (const job of queued) {
      if (inFlight.has(job.documentId)) continue;
      inFlight.add(job.documentId);

      DocumentStructureService.processDocument(job.documentId)
        .catch((err) => console.error(`[documentProcessingWorker] Unhandled error processing ${job.documentId}:`, err))
        .finally(() => inFlight.delete(job.documentId));
    }
  } catch (err) {
    console.error('[documentProcessingWorker] Poll tick failed:', err);
  }
}

export function startDocumentProcessingWorker() {
  if (timer) return;
  timer = setInterval(tick, POLL_INTERVAL_MS);
  console.log('📄 [documentProcessingWorker] Started (polling every', POLL_INTERVAL_MS, 'ms)');
}

export function stopDocumentProcessingWorker() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
