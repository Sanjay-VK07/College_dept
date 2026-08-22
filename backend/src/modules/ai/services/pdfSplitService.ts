import { PDFDocument } from 'pdf-lib';

export interface PdfPageBatch {
  startPage: number; // 1-based, inclusive
  endPage: number; // 1-based, inclusive
  buffer: Buffer;
}

/**
 * Splits a PDF into fixed-size page-range batches so large documents (400+ pages) are never
 * sent to the LLM in one request. Pure JS (pdf-lib) — no system Ghostscript/Poppler dependency,
 * so this works on constrained/free-tier hosting.
 */
export class PdfSplitService {
  public static async getPageCount(fileBuffer: Buffer): Promise<number> {
    const doc = await PDFDocument.load(fileBuffer, { ignoreEncryption: true });
    return doc.getPageCount();
  }

  public static async splitIntoBatches(fileBuffer: Buffer, pagesPerBatch: number = 20): Promise<PdfPageBatch[]> {
    const sourceDoc = await PDFDocument.load(fileBuffer, { ignoreEncryption: true });
    const totalPages = sourceDoc.getPageCount();
    const batches: PdfPageBatch[] = [];

    for (let start = 0; start < totalPages; start += pagesPerBatch) {
      const end = Math.min(start + pagesPerBatch, totalPages);
      const indices = Array.from({ length: end - start }, (_, i) => start + i);

      const batchDoc = await PDFDocument.create();
      const copiedPages = await batchDoc.copyPages(sourceDoc, indices);
      copiedPages.forEach((p) => batchDoc.addPage(p));

      const bytes = await batchDoc.save();
      batches.push({
        startPage: start + 1,
        endPage: end,
        buffer: Buffer.from(bytes),
      });
    }

    return batches;
  }
}
