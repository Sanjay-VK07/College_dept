import { prisma } from '../src/config/prisma';
import { LocalStorageProvider } from '../src/modules/ai/services/documentStorageService';
import { PdfSplitService, PdfPageBatch } from '../src/modules/ai/services/pdfSplitService';
import { DocumentStructureService } from '../src/modules/ai/services/documentStructureService';
import { OllamaProvider } from '../src/modules/ai/services/ollamaProvider';

/**
 * Bounded benchmark for the document-structure extraction pipeline — NEVER processes the whole
 * document. Run manually (not via the queue/worker) so a test never silently turns into a full
 * 469-page ingestion:
 *
 *   PDF_TEST_DOCUMENT_ID=<id> PDF_TEST_START_PAGE=1 PDF_TEST_END_PAGE=5 npx ts-node scripts/testPdfStructurePipeline.ts
 *
 * Requires DOCUMENT_STRUCTURE_PROVIDER=ollama in .env — this script is specifically for
 * benchmarking the local Ollama vision path before committing a large document to it.
 */

const DOCUMENT_ID = process.env.PDF_TEST_DOCUMENT_ID || '';
const START_PAGE = parseInt(process.env.PDF_TEST_START_PAGE || '1', 10);
const END_PAGE = parseInt(process.env.PDF_TEST_END_PAGE || '5', 10);
const BATCH_SIZE = parseInt(process.env.PDF_TEST_BATCH_SIZE || '2', 10);
const CONCURRENCY = parseInt(process.env.PDF_TEST_CONCURRENCY || '1', 10);
const MAX_RETRIES = parseInt(process.env.PDF_TEST_MAX_RETRIES || '1', 10);

interface BatchOutcome {
  startPage: number;
  endPage: number;
  success: boolean;
  rasterMs: number | null;
  requestMs: number | null;
  totalMs: number;
  retriesUsed: number;
  pagesReturned: number;
  visualPagesDetected: number;
  error?: string;
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':');
}

async function runBatchWithRetries(provider: OllamaProvider, batch: PdfPageBatch): Promise<BatchOutcome> {
  let attempt = 0;
  let lastError = '';

  while (attempt <= MAX_RETRIES) {
    const batchStart = Date.now();
    let timing: { rasterMs: number; requestMs: number } | null = null;

    try {
      const result = await DocumentStructureService.extractBatch(
        provider,
        batch.buffer,
        batch.startPage,
        batch.endPage,
        (t) => {
          timing = t;
        }
      );

      await DocumentStructureService.persistBatchResult(DOCUMENT_ID, batch, result);

      const visualPagesDetected = result.pages.filter((p) => /\[FIGURE:/i.test(p.text || '')).length;

      return {
        startPage: batch.startPage,
        endPage: batch.endPage,
        success: true,
        rasterMs: timing ? (timing as any).rasterMs : null,
        requestMs: timing ? (timing as any).requestMs : null,
        totalMs: Date.now() - batchStart,
        retriesUsed: attempt,
        pagesReturned: result.pages.length,
        visualPagesDetected,
      };
    } catch (err: any) {
      lastError = err.message || String(err);
      console.error(`[Benchmark] Batch pages ${batch.startPage}-${batch.endPage} attempt ${attempt + 1} failed: ${lastError}`);
      attempt++;
    }
  }

  return {
    startPage: batch.startPage,
    endPage: batch.endPage,
    success: false,
    rasterMs: null,
    requestMs: null,
    totalMs: 0,
    retriesUsed: MAX_RETRIES,
    pagesReturned: 0,
    visualPagesDetected: 0,
    error: lastError,
  };
}

async function runPool(provider: OllamaProvider, batches: PdfPageBatch[], concurrency: number): Promise<BatchOutcome[]> {
  const results: BatchOutcome[] = new Array(batches.length);
  let nextIndex = 0;

  async function worker() {
    while (true) {
      const i = nextIndex++;
      if (i >= batches.length) return;
      console.log(`[Benchmark] Starting batch pages ${batches[i].startPage}-${batches[i].endPage}...`);
      results[i] = await runBatchWithRetries(provider, batches[i]);
      const r = results[i];
      console.log(
        r.success
          ? `[Benchmark] Done pages ${r.startPage}-${r.endPage}: raster=${r.rasterMs}ms request=${r.requestMs}ms total=${r.totalMs}ms retries=${r.retriesUsed} visualPages=${r.visualPagesDetected}`
          : `[Benchmark] FAILED pages ${r.startPage}-${r.endPage} after ${r.retriesUsed} retries: ${r.error}`
      );
    }
  }

  const workers = Array.from({ length: Math.max(1, concurrency) }, () => worker());
  await Promise.all(workers);
  return results;
}

async function main() {
  console.log('=== PDF Structure Extraction Benchmark (Ollama) ===');
  console.log(`documentId=${DOCUMENT_ID || '(none)'} range=${START_PAGE}-${END_PAGE} batchSize=${BATCH_SIZE} concurrency=${CONCURRENCY} maxRetries=${MAX_RETRIES}`);

  if (!DOCUMENT_ID) {
    console.error('FAILED: PDF_TEST_DOCUMENT_ID is required (no default — refusing to guess which document to test against).');
    process.exit(1);
  }

  const provider = process.env.DOCUMENT_STRUCTURE_PROVIDER?.toLowerCase() === 'ollama' ? new OllamaProvider() : null;
  if (!provider) {
    console.error('FAILED: DOCUMENT_STRUCTURE_PROVIDER must be set to "ollama" in .env to run this benchmark.');
    process.exit(1);
  }

  console.log('Checking Ollama connectivity...');
  const health = await provider.healthCheck();
  console.log(JSON.stringify(health, null, 2));
  if (!health.ok) {
    console.error('FAILED: Ollama is not ready. Fix the issue above before benchmarking.');
    process.exit(1);
  }

  const document = await prisma.aIDocument.findUnique({ where: { id: DOCUMENT_ID } });
  if (!document) {
    console.error(`FAILED: No AIDocument found with id ${DOCUMENT_ID}.`);
    process.exit(1);
  }

  const storageProvider = new LocalStorageProvider();
  const absolutePath = await storageProvider.getAuthorizedAccess(document.storageKey);
  const fs = require('fs');
  const fileBuffer: Buffer = await fs.promises.readFile(absolutePath);

  const totalPages = await PdfSplitService.getPageCount(fileBuffer);
  console.log(`Document has ${totalPages} total pages. Testing only pages ${START_PAGE}-${Math.min(END_PAGE, totalPages)}.`);

  const batches = await PdfSplitService.splitRangeIntoBatches(fileBuffer, START_PAGE, END_PAGE, BATCH_SIZE);
  console.log(`Split into ${batches.length} batch(es) of up to ${BATCH_SIZE} page(s) each.`);

  const suiteStart = Date.now();
  const outcomes = await runPool(provider, batches, CONCURRENCY);
  const totalMs = Date.now() - suiteStart;

  const successful = outcomes.filter((o) => o.success);
  const failed = outcomes.filter((o) => !o.success);
  const totalPagesProcessed = successful.reduce((sum, o) => sum + o.pagesReturned, 0);
  const totalRetries = outcomes.reduce((sum, o) => sum + o.retriesUsed, 0);
  const visualPagesDetected = successful.reduce((sum, o) => sum + o.visualPagesDetected, 0);
  const avgSecPerPage = totalPagesProcessed > 0 ? totalMs / 1000 / totalPagesProcessed : 0;
  const pagesPerMinute = totalMs > 0 ? (totalPagesProcessed / (totalMs / 1000)) * 60 : 0;

  console.log('');
  console.log('=== TEST RESULT ===');
  console.log(`Pages: ${START_PAGE}-${Math.min(END_PAGE, totalPages)}`);
  console.log(`Total time: ${formatDuration(totalMs)}`);
  console.log(`Average: ${avgSecPerPage.toFixed(1)} sec/page`);
  console.log(`Throughput: ${pagesPerMinute.toFixed(2)} pages/min`);
  console.log(`Successful batches: ${successful.length} / ${outcomes.length}`);
  console.log(`Failed batches: ${failed.length}`);
  console.log(`Total pages processed: ${totalPagesProcessed}`);
  console.log(`Total retries used: ${totalRetries}`);
  console.log(`Pages with visual content ([FIGURE: ...] detected): ${visualPagesDetected} / ${totalPagesProcessed}`);

  if (failed.length > 0) {
    console.log('');
    console.log('Failed batches:');
    for (const f of failed) {
      console.log(`  - pages ${f.startPage}-${f.endPage}: ${f.error}`);
    }
  }

  console.log('');
  console.log(`Test stopped after page ${Math.min(END_PAGE, totalPages)} as configured. Full-document ingestion was NOT started.`);
}

main()
  .catch((e) => {
    console.error('Benchmark failed with an unexpected error:', e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
