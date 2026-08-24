import { prisma } from '../../../config/prisma';
import { LocalStorageProvider } from './documentStorageService';
import { PdfSplitService } from './pdfSplitService';
import { GroqProvider, GeminiProvider, LLMProvider } from './llmProvider';
import { OllamaProvider } from './ollamaProvider';
import { QuestionIdNormalizationService } from './questionIdNormalizationService';

// This pipeline deliberately runs on Groq, not the app's general LLM_PROVIDER setting: Gemini's
// free tier on this project is capped at just 20 requests/day for the available model — nowhere
// near enough for page-batched extraction of a real multi-hundred-page document. Groq's free tier
// (1,000 requests/day) is what actually makes this usable, but its qwen3.6 vision model has a
// tight 8,000-tokens-per-minute budget, and image data is token-expensive — a request with even
// 3 full-resolution page images can exceed 8,000 tokens on its own (confirmed via live 413s).
// One page per request keeps each call safely inside that budget.
const STRUCTURE_EXTRACTION_PROVIDER = (process.env.DOCUMENT_STRUCTURE_PROVIDER || 'groq').toLowerCase();
// Ollama runs locally with no token-per-minute/per-day quota to budget against, so its batch size
// is set by practical local-inference load (a 26B vision model over many images at once is slow
// and memory-heavy) rather than by a rate limit.
const PAGES_PER_BATCH = STRUCTURE_EXTRACTION_PROVIDER === 'groq' ? 1 : STRUCTURE_EXTRACTION_PROVIDER === 'ollama' ? 2 : 8;
// Spacing between requests when using Groq. Earlier measurements on sparser test PDFs suggested
// ~3,200-3,350 tokens/request, and 27s was set from that — but real content-dense pages in an
// actual textbook cost up to ~3,985 tokens (confirmed via live 429 "Requested" values during a
// real 469-page import). Against the 8,000 TPM budget, that page's break-even interval alone is
// 60*3985/8000 ≈ 29.9s — meaning 27s was already mathematically insufficient before accounting
// for any timing jitter, which is exactly what caused a ~30-40% batch-skip rate on that run. 45s
// gives real margin above the worst page cost seen so far, not just the bare break-even point.
// Ollama has no external quota to pace against — the delay there just avoids saturating local
// CPU/GPU with back-to-back requests.
const INTER_BATCH_DELAY_MS = STRUCTURE_EXTRACTION_PROVIDER === 'groq' ? 45000 : STRUCTURE_EXTRACTION_PROVIDER === 'ollama' ? 1000 : 3000;

function getStructureExtractionProvider(): LLMProvider {
  if (STRUCTURE_EXTRACTION_PROVIDER === 'gemini') return new GeminiProvider();
  if (STRUCTURE_EXTRACTION_PROVIDER === 'ollama') return new OllamaProvider();
  return new GroqProvider();
}

interface BatchPageResult {
  pageNumber: number; // 1-based within the batch
  pageType: 'THEORY' | 'QUESTION' | 'ANSWER_KEY' | 'REFERENCE' | 'APPENDIX' | 'UNKNOWN';
  confidence: number;
  text: string;
}

interface BatchQuestionResult {
  questionId: string;
  pageNumber: number; // 1-based within the batch
  text: string;
  options: string[] | null;
  type: 'MCQ' | 'MSQ' | 'NAT' | 'UNKNOWN';
  inlineAnswer: any;
}

interface BatchAnswerResult {
  questionId: string;
  pageNumber: number; // 1-based within the batch
  answer: any;
  explanation: string | null;
}

interface BatchExtractionResult {
  pages: BatchPageResult[];
  questions: BatchQuestionResult[];
  answers: BatchAnswerResult[];
}

/**
 * Orchestrates the real document-structure pipeline: splits a large PDF into page-range
 * batches (never sends the whole document in one request), sends each batch to Gemini's
 * native PDF vision understanding (so scanned/image-only pages are read the same as normal
 * text pages), persists per-page classification + extracted questions/answers incrementally
 * with real job progress, then runs a fully deterministic (non-LLM) pass to match each
 * question to its answer-key entry by normalized identifier — never by page proximity.
 */
export class DocumentStructureService {
  public static async processDocument(documentId: string): Promise<void> {
    // processDocument() always re-walks the document from page 1 (no resume-from-last-page
    // capability), so the per-run counters must reset here on every call — otherwise a re-queued
    // run keeps incrementing on top of a stale prior total and reports progress far ahead of the
    // real, currently-extracted content.
    const job = await prisma.documentProcessingJob.upsert({
      where: { documentId },
      create: { documentId, status: 'EXTRACTING' },
      update: {
        status: 'EXTRACTING',
        error: null,
        statusMessage: null,
        pagesProcessed: 0,
        questionsFound: 0,
        answersFound: 0,
        mappingsResolved: 0,
        mappingsUncertain: 0,
      },
    });

    try {
      const document = await prisma.aIDocument.findUnique({ where: { id: documentId } });
      if (!document) {
        throw new Error('Source document not found.');
      }

      const storageProvider = new LocalStorageProvider();
      const absolutePath = await storageProvider.getAuthorizedAccess(document.storageKey);
      const fs = require('fs');
      const fileBuffer: Buffer = await fs.promises.readFile(absolutePath);

      const totalPages = await PdfSplitService.getPageCount(fileBuffer);
      await prisma.documentProcessingJob.update({
        where: { id: job.id },
        data: { totalPages, status: 'OCR' },
      });

      const batches = await PdfSplitService.splitIntoBatches(fileBuffer, PAGES_PER_BATCH);
      const provider = getStructureExtractionProvider();

      await prisma.documentProcessingJob.update({ where: { id: job.id }, data: { status: 'STRUCTURING' } });

      const failedBatches: string[] = [];

      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];

        // Proactive spacing between requests, not just reactive retry-after-failure — firing
        // many vision calls back-to-back for a large document has been observed to trip the
        // provider's own per-minute rate limit well before any single call's retry logic kicks in.
        if (i > 0) {
          await new Promise((resolve) => setTimeout(resolve, INTER_BATCH_DELAY_MS));
        }

        let result: BatchExtractionResult;
        try {
          result = await this.extractBatch(provider, batch.buffer, batch.startPage, batch.endPage);
        } catch (err: any) {
          // A single batch failing (e.g. a transient Gemini 503 that survived its own internal
          // retries) should not discard everything already extracted from a large document —
          // skip it, keep going, and report it honestly in the final status rather than losing
          // hours of prior progress over one bad batch.
          console.error(`[DocumentStructureService] Batch pages ${batch.startPage}-${batch.endPage} failed and will be skipped:`, err.message);
          failedBatches.push(`${batch.startPage}-${batch.endPage}`);
          continue;
        }

        await this.persistBatchResult(documentId, batch, result);

        await prisma.documentProcessingJob.update({
          where: { id: job.id },
          data: {
            pagesProcessed: { increment: result.pages.length },
            questionsFound: { increment: result.questions.length },
            answersFound: { increment: result.answers.length },
          },
        });
      }

      // Deterministic mapping pass — code, not LLM. Never matches by page proximity.
      await prisma.documentProcessingJob.update({ where: { id: job.id }, data: { status: 'MAPPING' } });
      const { resolved, uncertain } = await this.mapQuestionsToAnswers(documentId);

      // Any skipped batch means real pages of the document were never analyzed — that must never
      // be reported as a plain, unqualified "COMPLETED". Use a distinct status so callers (and
      // the UI) can't mistake a badly-degraded run for a clean one.
      const hasSkippedBatches = failedBatches.length > 0;
      await prisma.documentProcessingJob.update({
        where: { id: job.id },
        data: {
          status: hasSkippedBatches ? 'COMPLETED_WITH_ERRORS' : 'COMPLETED',
          mappingsResolved: resolved,
          mappingsUncertain: uncertain,
          statusMessage: hasSkippedBatches
            ? `${failedBatches.length} of ${batches.length} page batch(es) could not be processed after repeated failures (pages ${failedBatches.join(', ')}) — questions on those pages were not extracted. This is usually the AI provider's own rate limit; retrying the import later may recover the skipped pages.`
            : null,
        },
      });
    } catch (err: any) {
      console.error(`[DocumentStructureService] Processing failed for document ${documentId}:`, err);
      await prisma.documentProcessingJob.update({
        where: { id: job.id },
        data: { status: 'FAILED', error: err.message || 'Unknown processing error' },
      });
    }
  }

  /**
   * Persists one batch's extraction result into the real schema (DocumentPage/ExtractedQuestion/
   * ExtractedAnswer) — shared by the full processDocument() run and the bounded benchmark script,
   * so both write through the exact same logic and format.
   */
  public static async persistBatchResult(
    documentId: string,
    batch: { startPage: number; endPage: number },
    result: BatchExtractionResult
  ): Promise<void> {
    // Deliberately not wrapped in a single Prisma interactive transaction: a batch's worth
    // of pages/questions/answers is too much sequential DB work to reliably fit inside
    // Prisma's default 5s transaction window (each write to this remote DB has consistently
    // taken 1s+ this session), and this process is idempotent/re-runnable per batch anyway —
    // page upserts and bulk createMany calls below don't need cross-row atomicity.
    const pageIdByNumber = new Map<number, string>();

    for (const p of result.pages) {
      const absolutePageNumber = batch.startPage + (p.pageNumber - 1);
      const page = await prisma.documentPage.upsert({
        where: { documentId_pageNumber: { documentId, pageNumber: absolutePageNumber } },
        create: {
          documentId,
          pageNumber: absolutePageNumber,
          rawText: p.text || null,
          extractionMethod: 'VISION_OCR',
          pageType: p.pageType,
          classificationConfidence: p.confidence,
        },
        update: {
          rawText: p.text || null,
          pageType: p.pageType,
          classificationConfidence: p.confidence,
        },
      });
      pageIdByNumber.set(absolutePageNumber, page.id);
    }

    const questionRows: any[] = [];
    const answerRows: any[] = [];

    for (const q of result.questions) {
      const absolutePageNumber = batch.startPage + (q.pageNumber - 1);
      const pageId = pageIdByNumber.get(absolutePageNumber);
      if (!pageId) continue; // model referenced a page it didn't classify — skip rather than guess

      const normalized = QuestionIdNormalizationService.normalize(q.questionId);
      if (!normalized) continue;

      questionRows.push({
        documentId,
        rawQuestionId: q.questionId,
        normalizedQuestionId: normalized,
        questionText: q.text,
        options: q.options as any,
        questionType: q.type,
        sourcePageId: pageId,
        imageRefs: [],
      });

      // An answer given immediately after the question on the same page (common in short
      // quizzes/compact question sets) — persist it as a real ExtractedAnswer on the same
      // page so the deterministic mapping pass below can match it, instead of silently
      // discarding it. Separate multi-page ANSWER_KEY sections (the common case for real
      // exam papers, tested earlier) are still captured via result.answers below.
      if (q.inlineAnswer !== null && q.inlineAnswer !== undefined) {
        answerRows.push({
          documentId,
          rawQuestionId: q.questionId,
          normalizedQuestionId: normalized,
          answerValue: q.inlineAnswer as any,
          explanation: null,
          sourcePageId: pageId,
        });
      }
    }

    for (const a of result.answers) {
      const absolutePageNumber = batch.startPage + (a.pageNumber - 1);
      const pageId = pageIdByNumber.get(absolutePageNumber);
      if (!pageId) continue;

      const normalized = QuestionIdNormalizationService.normalize(a.questionId);
      if (!normalized) continue;

      answerRows.push({
        documentId,
        rawQuestionId: a.questionId,
        normalizedQuestionId: normalized,
        answerValue: a.answer as any,
        explanation: a.explanation,
        sourcePageId: pageId,
      });
    }

    if (questionRows.length > 0) {
      await prisma.extractedQuestion.createMany({ data: questionRows });
    }
    if (answerRows.length > 0) {
      await prisma.extractedAnswer.createMany({ data: answerRows });
    }
  }

  /**
   * Sends one page-range batch to the configured vision provider and parses its structured
   * output. Public so the bounded benchmark script (see scripts/testPdfStructurePipeline.ts) can
   * reuse the exact same prompt/schema/parsing as the real pipeline — never a separate format.
   *
   * `onOllamaTiming` is honored only when `provider` is an OllamaProvider instance (checked via
   * instanceof below); it's how the benchmark script gets a real rasterization-vs-inference time
   * split without duplicating OllamaProvider's request logic. Groq/Gemini are unaffected.
   */
  public static async extractBatch(
    provider: LLMProvider,
    batchPdfBuffer: Buffer,
    startPage: number,
    endPage: number,
    onOllamaTiming?: (t: { rasterMs: number; requestMs: number }) => void
  ): Promise<BatchExtractionResult> {
    const systemPrompt = `You are a document structure analyzer for academic/exam PDFs (textbooks, question banks, previous-year exam papers). You will be given a short excerpt (a contiguous page range) of a larger PDF, page by page, including scanned/image pages with no selectable text — read those visually.

For EACH page in this excerpt, classify it as one of: THEORY (explanatory/instructional content), QUESTION (contains one or more exam questions), ANSWER_KEY (a table/list mapping question numbers to answers, with no question text), REFERENCE (bibliography/citations), APPENDIX, or UNKNOWN. Give a confidence 0-1.

For every question you find on a QUESTION page, extract: its identifier EXACTLY as printed (e.g. "1.1.10", "1.1.10(a)", "Q28", "28"), its full text, its options if MCQ/MSQ (else null), its type (MCQ/MSQ/NAT/UNKNOWN), and any answer given immediately after the question in this same excerpt (else null) — do not go looking elsewhere for it.

For every entry you find on an ANSWER_KEY page (a table like "1.1.9 -> A, 1.1.10 -> B"), extract: the question identifier EXACTLY as printed, the answer value, and any explanation shown (else null). Do not guess or infer entries that aren't explicitly printed.

Do not invent questions, answers, or page classifications that aren't actually present. If a page is genuinely ambiguous, classify it UNKNOWN rather than guessing.

Each page's "text" field must preserve the page's real structure and content, not just a flat text dump:
- Keep headings, paragraphs, and lists recognizable (e.g. prefix headings with "# ", list items with "- ").
- Reproduce tables as markdown tables.
- Reproduce equations/formulas as LaTeX where possible, inline where they appear.
- For every image, diagram, chart, figure, or illustration on the page, insert an inline marker at
  the position it appears: "[FIGURE: <what it shows, including any data/labels/trend visible>]".
  Never silently skip a visual element — if something is present but illegible, still mark
  "[FIGURE: illegible/unclear content]" rather than omitting it.
  Include any caption text verbatim next to its marker.
- If a figure or image itself contains meaningful text (a labeled diagram, a screenshot with text,
  an infographic), transcribe that text inside the marker too.

Do not invent visual content that isn't there — only describe what is actually visible on the page.

Output ONLY a strict JSON object, no markdown, no commentary, matching exactly:
{
  "pages": [{ "pageNumber": <1-based page number WITHIN THIS EXCERPT, first page = 1>, "pageType": "THEORY"|"QUESTION"|"ANSWER_KEY"|"REFERENCE"|"APPENDIX"|"UNKNOWN", "confidence": 0.0-1.0, "text": "<full structured text of the page, per the rules above>" }],
  "questions": [{ "questionId": "1.1.10(a)", "pageNumber": <1-based within this excerpt>, "text": "...", "options": ["A","B","C","D"] or null, "type": "MCQ"|"MSQ"|"NAT"|"UNKNOWN", "inlineAnswer": <value or null> }],
  "answers": [{ "questionId": "1.1.10", "pageNumber": <1-based within this excerpt>, "answer": <value>, "explanation": "..." or null }]
}`;

    const userPrompt = `This excerpt covers original document pages ${startPage}-${endPage} (${endPage - startPage + 1} pages). Analyze every page in this excerpt and return the JSON described above. Use page numbers relative to THIS EXCERPT ONLY (first page of the excerpt = 1), not the original document's page numbers.`;

    const base64Pdf = batchPdfBuffer.toString('base64');
    const responseText =
      provider instanceof OllamaProvider
        ? await provider.generateWithFile(systemPrompt, userPrompt, base64Pdf, 'application/pdf', onOllamaTiming)
        : await provider.generateWithFile(systemPrompt, userPrompt, base64Pdf, 'application/pdf');

    // Defensive: some vision models (e.g. Groq's qwen3.6) support a "thinking" mode that wraps
    // reasoning in <think> tags before the actual answer — reasoning_effort:'none' is set to
    // disable this, but strip it here too in case that ever stops being honored.
    let cleanJson = responseText.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    if (cleanJson.startsWith('```')) {
      cleanJson = cleanJson.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
    }

    let parsed: any;
    try {
      parsed = JSON.parse(cleanJson);
    } catch (err: any) {
      throw new Error(`Failed to parse structure-extraction output for pages ${startPage}-${endPage}: ${err.message}`);
    }

    return {
      pages: Array.isArray(parsed.pages) ? parsed.pages : [],
      questions: Array.isArray(parsed.questions) ? parsed.questions : [],
      answers: Array.isArray(parsed.answers) ? parsed.answers : [],
    };
  }

  /**
   * Deterministically maps every PENDING ExtractedQuestion in a document to its ExtractedAnswer
   * by exact normalized-identifier match. Never uses page proximity or LLM judgment.
   */
  private static async mapQuestionsToAnswers(documentId: string): Promise<{ resolved: number; uncertain: number }> {
    const [questions, answers] = await Promise.all([
      prisma.extractedQuestion.findMany({ where: { documentId, answerMappingStatus: 'PENDING' } }),
      prisma.extractedAnswer.findMany({ where: { documentId } }),
    ]);

    const answersByNormalizedId = new Map<string, typeof answers>();
    for (const a of answers) {
      const list = answersByNormalizedId.get(a.normalizedQuestionId) || [];
      list.push(a);
      answersByNormalizedId.set(a.normalizedQuestionId, list);
    }

    let resolved = 0;
    let uncertain = 0;

    for (const q of questions) {
      const rawCandidates = answersByNormalizedId.get(q.normalizedQuestionId) || [];

      // Two extraction passes can independently surface the same answer for the same question
      // (e.g. an inline answer right after the question, and that same entry also appearing in
      // a same-page "Answer Key" block) — that's not a conflict, it's corroboration. Only treat
      // this as genuinely uncertain when the candidates actually disagree on the answer value.
      const distinctValues = new Map<string, (typeof rawCandidates)[number]>();
      for (const c of rawCandidates) {
        distinctValues.set(JSON.stringify(c.answerValue), c);
      }
      const candidates = Array.from(distinctValues.values());

      if (candidates.length === 1) {
        await prisma.extractedQuestion.update({
          where: { id: q.id },
          data: { answerMappingStatus: 'MAPPED', mappedAnswerId: candidates[0].id },
        });
        resolved++;
      } else if (candidates.length === 0) {
        await prisma.extractedQuestion.update({
          where: { id: q.id },
          data: { answerMappingStatus: 'NO_ANSWER_FOUND' },
        });
      } else {
        // Multiple DIFFERING answer-key entries claim the same normalized id within this
        // document — genuinely ambiguous, never guess which one is correct.
        await prisma.extractedQuestion.update({
          where: { id: q.id },
          data: { answerMappingStatus: 'ANSWER_MAPPING_UNCERTAIN' },
        });
        uncertain++;
      }
    }

    return { resolved, uncertain };
  }
}
