import { prisma } from '../../../config/prisma';
import { Role, QuestionType } from '@prisma/client';
import { DocumentStructureService } from './documentStructureService';
import { QuestionGenerationService } from './questionGenerationService';
import { AuditLogger } from '../../../services/auditLogger';

export interface EnqueuePDFImportParams {
  userId: string;
  role: Role;
  documentId: string;
  subtopicId: string;
  targetCount?: number; // omit/0 = extract every mapped question found, no cap
}

/**
 * Imports real questions from an uploaded PDF into the live Question Bank, honoring a custom
 * target count and safely handling large PDFs (100s of pages). Rather than re-implementing
 * page-batched extraction (which would reintroduce the exact "answer key pages away from its
 * question" problem the Phase 1 pipeline already solves deterministically), this reuses
 * DocumentStructureService's page-batched extraction + ID-based question/answer mapping, then
 * imports only questions with a confidently MAPPED answer through the same
 * validate/dedup/verify/auto-publish pipeline used by AI-generated content
 * (QuestionGenerationService.importExtractedQuestion).
 *
 * Runs as a QUEUED AIBatchGenerationJob (jobType 'PDF_IMPORT') picked up by the same
 * batchGenerationWorker.ts poll loop used for AI batch generation — never blocks the HTTP
 * upload request, and gives real incremental progress for a large document.
 */
export class PDFQuestionImportService {
  public static async enqueueImport(params: EnqueuePDFImportParams) {
    const { userId, role, documentId, subtopicId, targetCount } = params;

    if (role !== Role.FACULTY && role !== Role.ADMIN) {
      throw new Error('Forbidden: Only Faculty and Admin users are authorized to import questions from a PDF.');
    }

    const document = await prisma.aIDocument.findUnique({ where: { id: documentId } });
    if (!document) {
      throw new Error('Source PDF document not found.');
    }

    const generationRequestId = `pdfimport_${documentId}_${Date.now()}`;

    const job = await prisma.aIBatchGenerationJob.create({
      data: {
        generationRequestId,
        jobType: 'PDF_IMPORT',
        createdById: userId,
        requestedCount: targetCount && targetCount > 0 ? targetCount : 0,
        status: 'QUEUED',
        statusMessage: 'Queued for extraction.',
        selectedResourceIds: [documentId],
        subtopicId,
      },
    });

    return { success: true, generationRequestId: job.generationRequestId, status: job.status };
  }

  /**
   * Runs the actual import for a QUEUED PDF_IMPORT job. Called exclusively by
   * batchGenerationWorker.ts — never called directly from a controller.
   */
  public static async processImportJob(generationRequestId: string): Promise<void> {
    const job = await prisma.aIBatchGenerationJob.findUnique({ where: { generationRequestId } });
    if (!job) return;

    const documentId = job.selectedResourceIds[0];
    const subtopicId = job.subtopicId!;
    const targetCount = job.requestedCount > 0 ? job.requestedCount : null;

    await prisma.aIBatchGenerationJob.update({
      where: { generationRequestId },
      data: { status: 'PROCESSING', statusMessage: 'Analyzing document structure (this can take a while for large PDFs)...' },
    });

    try {
      // 1. Ensure the document has been through Phase 1 structure extraction + deterministic
      // question/answer-key mapping. This is what makes "large PDF" and "answer key pages away
      // from its question" safe — the PDF is already split into page batches internally.
      const structureSucceeded = (s: typeof structureJob) => s && (s.status === 'COMPLETED' || s.status === 'COMPLETED_WITH_ERRORS');

      let structureJob = await prisma.documentProcessingJob.findUnique({ where: { documentId } });
      if (!structureSucceeded(structureJob)) {
        await DocumentStructureService.processDocument(documentId);
        structureJob = await prisma.documentProcessingJob.findUnique({ where: { documentId } });
      }

      if (!structureSucceeded(structureJob)) {
        const msg = `Document structure analysis did not complete successfully (${structureJob?.status || 'UNKNOWN'}): ${structureJob?.error || 'unknown error'}.`;
        await prisma.aIBatchGenerationJob.update({
          where: { generationRequestId },
          data: { status: 'FAILED', statusMessage: msg },
        });
        return;
      }

      // Structure extraction may have completed with some page batches skipped (usually the AI
      // provider's own rate limit) — proceed with whatever was successfully extracted, but this
      // degradation must be carried through to the final report, never silently dropped.
      const structureDegradationNote =
        structureJob!.status === 'COMPLETED_WITH_ERRORS' ? ` NOTE: ${structureJob!.statusMessage}` : '';

      // 2. Pull every question that was deterministically mapped to a confident answer. Anything
      // NO_ANSWER_FOUND or ANSWER_MAPPING_UNCERTAIN is never imported as a scored question — that
      // would mean guessing an answer, which is the one thing this whole pipeline exists to avoid.
      const mappedQuestions = await prisma.extractedQuestion.findMany({
        where: { documentId, answerMappingStatus: 'MAPPED' },
        include: { mappedAnswer: true, sourcePage: true },
        orderBy: [{ sourcePage: { pageNumber: 'asc' } }, { rawQuestionId: 'asc' }],
      });

      const totalUnmapped = await prisma.extractedQuestion.count({
        where: { documentId, answerMappingStatus: { in: ['NO_ANSWER_FOUND', 'ANSWER_MAPPING_UNCERTAIN'] } },
      });

      await prisma.aIBatchGenerationJob.update({
        where: { generationRequestId },
        data: { statusMessage: `Found ${mappedQuestions.length} questions with a confidently mapped answer. Importing...` },
      });

      let generatedCount = 0;
      let validatedCount = 0;
      let verifiedCount = 0;
      let pendingReviewCount = 0;
      let autoPublishedCount = 0;
      let duplicateCount = 0;
      let failedCount = 0;

      for (const eq of mappedQuestions) {
        if (targetCount && generatedCount >= targetCount) break;

        const resolvedType = (eq.questionType && ['MCQ', 'MSQ', 'NAT'].includes(eq.questionType) ? eq.questionType : 'MCQ') as QuestionType;
        const resolvedAnswer = this.resolveAnswerValue(eq.mappedAnswer?.answerValue, eq.options as string[] | null, resolvedType);

        if (resolvedAnswer === null) {
          failedCount++;
          console.warn(
            `[PDFQuestionImportService] Could not confidently resolve the extracted answer "${JSON.stringify(
              eq.mappedAnswer?.answerValue
            )}" against this question's options — skipping rather than guessing (question ${eq.rawQuestionId}).`
          );
          await prisma.aIBatchGenerationJob.update({
            where: { generationRequestId },
            data: { generatedCount, validatedCount, verifiedCount, pendingReviewCount, autoPublishedCount, duplicateCount, failedCount },
          });
          continue;
        }

        const rawQ = {
          type: resolvedType,
          stem: eq.questionText,
          options: eq.options,
          correctAnswer: resolvedAnswer,
          explanation: eq.mappedAnswer?.explanation || undefined,
        };

        const result = await QuestionGenerationService.importExtractedQuestion({
          rawQ,
          subtopicId,
          userId: job.createdById,
          generationRequestId,
          sourceDocumentIds: [documentId],
        });

        if (result.outcome === 'SKIPPED') {
          if (result.skipReason?.startsWith('Duplicate')) duplicateCount++;
          else failedCount++;
        } else {
          generatedCount++;
          validatedCount++;
          if (result.record?.verificationStatus === 'PASS') verifiedCount++;
          if (result.autoPublished) autoPublishedCount++;
          else pendingReviewCount++;
        }

        // Real incremental progress, updated per question (question-level LLM calls here are
        // just the verification check, not a fresh extraction — extraction already happened in
        // step 1 — so this loop is much cheaper per-item than batch generation).
        await prisma.aIBatchGenerationJob.update({
          where: { generationRequestId },
          data: { generatedCount, validatedCount, verifiedCount, pendingReviewCount, autoPublishedCount, duplicateCount, failedCount },
        });
      }

      const shortfall = targetCount ? Math.max(0, targetCount - generatedCount) : 0;
      const isPartial = (targetCount !== null && shortfall > 0) || structureJob!.status === 'COMPLETED_WITH_ERRORS';
      const finalStatus = isPartial ? 'GENERATED_PARTIAL_BATCH' : 'COMPLETED';

      const statusMsg =
        (targetCount !== null && shortfall > 0
          ? `Imported ${generatedCount} of the requested ${targetCount} questions. Only ${mappedQuestions.length} questions in this document had a confidently mapped answer (${totalUnmapped} more were found but could not be confidently matched to an answer, so were not imported).`
          : `Imported ${generatedCount} questions with a confidently mapped answer (${autoPublishedCount} auto-published after independent verification, ${pendingReviewCount} awaiting faculty review, ${duplicateCount} skipped as duplicates${
              totalUnmapped > 0 ? `, ${totalUnmapped} more found in the document but skipped — no confidently mapped answer, so not imported` : ''
            }).`) + structureDegradationNote;

      await prisma.aIBatchGenerationJob.update({
        where: { generationRequestId },
        data: { status: finalStatus, statusMessage: statusMsg },
      });

      await AuditLogger.log({
        userId: job.createdById,
        action: 'AI_PDF_QUESTION_IMPORT_COMPLETED',
        resource: 'AIBatchGenerationJob',
        details: `${generationRequestId}: ${statusMsg}`,
      });
    } catch (err: any) {
      console.error('[PDFQuestionImportService] processImportJob failed:', err);
      await prisma.aIBatchGenerationJob.update({
        where: { generationRequestId },
        data: { status: 'FAILED', statusMessage: `PDF import failed: ${err.message}` },
      });
    }
  }

  /**
   * The extracted answer key gives a letter designator or raw value (e.g. "(B)", "B", "42.5"),
   * but the live Question Bank (and its structural validator) expects MCQ/MSQ answers as 0-based
   * option indices and NAT answers as a {value, min, max} object. Converts between the two,
   * returning null (never guessing) when the mapping can't be confidently resolved — e.g. a
   * letter with no matching option, or a value that isn't a valid number for NAT.
   */
  private static resolveAnswerValue(answerValue: any, options: string[] | null, type: QuestionType): any {
    if (type === 'NAT') {
      if (typeof answerValue === 'number' && isFinite(answerValue)) {
        return { value: answerValue, min: answerValue, max: answerValue };
      }
      if (typeof answerValue === 'object' && answerValue !== null && 'value' in answerValue) {
        const val = Number((answerValue as any).value);
        if (!isFinite(val)) return null;
        const min = (answerValue as any).min !== undefined ? Number((answerValue as any).min) : val;
        const max = (answerValue as any).max !== undefined ? Number((answerValue as any).max) : val;
        return { value: val, min, max };
      }
      if (typeof answerValue === 'string' && /^-?\d+(\.\d+)?$/.test(answerValue.trim())) {
        const parsed = parseFloat(answerValue.trim());
        return { value: parsed, min: parsed, max: parsed };
      }
      return null;
    }

    // MCQ / MSQ
    if (!options || options.length === 0) return null;

    const rawTokens: string[] = Array.isArray(answerValue)
      ? answerValue.map((v) => String(v))
      : String(answerValue)
          .split(/[,/&]| and /i)
          .map((s) => s.trim())
          .filter(Boolean);

    const indices: number[] = [];
    for (const raw of rawTokens) {
      const letterMatch = raw.match(/^\(?([A-Da-d])\)?\.?$/);
      if (letterMatch) {
        const idx = letterMatch[1].toUpperCase().charCodeAt(0) - 65;
        if (idx >= 0 && idx < options.length) {
          indices.push(idx);
          continue;
        }
      }

      // Fall back to matching a leading "(X)"/"X." letter prefix already embedded in the
      // option's own text (common in verbatim-extracted MCQ options).
      const matchIdx = options.findIndex((opt) => {
        const optLetterMatch = opt.match(/^\(?([A-Da-d])\)?[.)]?\s/);
        return optLetterMatch && optLetterMatch[1].toUpperCase() === raw.toUpperCase().replace(/[().\s]/g, '');
      });
      if (matchIdx >= 0) {
        indices.push(matchIdx);
        continue;
      }

      // Could not confidently resolve this token — abort rather than guess which option it means.
      return null;
    }

    if (indices.length === 0) return null;
    const unique = Array.from(new Set(indices));
    if (type === 'MCQ' && unique.length !== 1) return null; // ambiguous single-answer resolution — never guess
    return unique;
  }
}
