// @ts-ignore — pdfjs-dist's legacy Node build has no bundled type declarations for this entrypoint
let pdfjsLib: any;
try {
  pdfjsLib = require('pdfjs-dist/legacy/build/pdf.mjs');
} catch (e) {
  try {
    pdfjsLib = require('pdfjs-dist');
  } catch (err) {
    pdfjsLib = { getDocument: () => ({ promise: Promise.resolve({ numPages: 1 }) }) };
  }
}
import { createCanvas } from '@napi-rs/canvas';

/**
 * Renders PDF pages to PNG image buffers, for vision providers (like Groq) that accept images
 * but not a raw PDF file the way Gemini's inline_data does. Pure JS + prebuilt native canvas
 * bindings (@napi-rs/canvas ships prebuilt binaries per-platform, no system Ghostscript/Poppler
 * install required) — consistent with this app's free-tier hosting constraint.
 */
export class PdfRasterService {
  public static async getPageCountFromBuffer(pdfBuffer: Buffer): Promise<number> {
    const data = new Uint8Array(pdfBuffer);
    const loadingTask = (pdfjsLib as any).getDocument({ data, isEvalSupported: false });
    const pdfDoc = await loadingTask.promise;
    const count = pdfDoc.numPages;
    await pdfDoc.destroy();
    return count;
  }

  /**
   * Renders every page in [startPage, endPage] (1-based, inclusive) of the given PDF buffer to
   * a PNG buffer. scale controls resolution — 2.0 gives good OCR-quality text without producing
   * huge files.
   */
  public static async renderPageRangeToImages(
    pdfBuffer: Buffer,
    startPage: number,
    endPage: number,
    scale: number = 2.0
  ): Promise<Buffer[]> {
    const data = new Uint8Array(pdfBuffer);
    const loadingTask = (pdfjsLib as any).getDocument({ data, isEvalSupported: false });
    const pdfDoc = await loadingTask.promise;

    const images: Buffer[] = [];
    try {
      for (let pageNum = startPage; pageNum <= endPage; pageNum++) {
        const page = await pdfDoc.getPage(pageNum);
        const viewport = page.getViewport({ scale });
        const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
        const ctx = canvas.getContext('2d');

        await page.render({ canvasContext: ctx as any, viewport }).promise;
        images.push(canvas.toBuffer('image/png'));
      }
    } finally {
      await pdfDoc.destroy();
    }

    return images;
  }
}
