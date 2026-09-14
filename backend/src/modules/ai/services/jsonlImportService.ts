import { prisma } from '../../../config/prisma';
import { VerificationStatus, QuestionOrigin, QuestionType, Difficulty } from '@prisma/client';

export interface JSONLRecord {
  questionId: string;
  originalQuestionId?: string;
  chapter?: number | string;
  question: string;
  options?: Record<string, string> | any[];
  correctAnswer?: any;
  rawAnswer?: string;
  questionType: string;
  sourceDocument?: string;
  sourcePage?: number;
  answerKeyPage?: number;
  containsFigure?: boolean;
  hasFigure?: boolean;
  textExtractionUsed?: boolean;
  visualExtractionUsed?: boolean;
  visualExtractionReason?: string;
  visualExtractionPage?: number;
  verificationStatus?: string;
  reason?: string;
  sourceChapter?: string | number;
  sourceSection?: string;
  sourceHeading?: string;
}

export interface TopicBreakdownItem {
  topicHeading: string;
  total: number;
  verified: number;
  needsReview: number;
  unansweredInSource: number;
  rejected: number;
}

export interface ImportPreviewResult {
  fileName: string;
  totalRecords: number;
  topicsCount: number;
  verifiedCount: number;
  unansweredInSourceCount: number;
  needsReviewCount: number;
  rejectedCount: number;
  duplicateCount: number;
  invalidCount: number;
  topicBreakdown: TopicBreakdownItem[];
  validRecords: JSONLRecord[];
  invalidRecords: Array<{ line: number; error: string; raw: string }>;
}

export class JSONLImportService {
  /**
   * Parses and validates a JSONL file without inserting into the database.
   */
  public static parseAndValidateJSONL(fileContent: string | Buffer, fileName: string = 'Ch1_questions.jsonl'): ImportPreviewResult {
    const text = typeof fileContent === 'string' ? fileContent : fileContent.toString('utf-8');
    const lines = text.split('\n');

    const validRecords: JSONLRecord[] = [];
    const invalidRecords: Array<{ line: number; error: string; raw: string }> = [];
    const seenIds = new Set<string>();
    let duplicateCount = 0;

    let lineIndex = 0;
    for (const rawLine of lines) {
      lineIndex++;
      const trimmed = rawLine.trim();
      if (!trimmed) continue;

      try {
        const obj = JSON.parse(trimmed) as JSONLRecord;

        if (!obj.questionId || typeof obj.questionId !== 'string') {
          invalidRecords.push({ line: lineIndex, error: 'Missing or invalid questionId', raw: trimmed });
          continue;
        }

        if (!obj.question || typeof obj.question !== 'string') {
          invalidRecords.push({ line: lineIndex, error: 'Missing question text', raw: trimmed });
          continue;
        }

        if (seenIds.has(obj.questionId)) {
          duplicateCount++;
          invalidRecords.push({ line: lineIndex, error: `Duplicate questionId '${obj.questionId}' in file`, raw: trimmed });
          continue;
        }

        seenIds.add(obj.questionId);
        validRecords.push(obj);
      } catch (err: any) {
        invalidRecords.push({ line: lineIndex, error: `JSON Parse error: ${err.message}`, raw: trimmed });
      }
    }

    // Calculate metrics and topic breakdown
    let verifiedCount = 0;
    let unansweredInSourceCount = 0;
    let needsReviewCount = 0;
    let rejectedCount = 0;

    const topicMap = new Map<string, TopicBreakdownItem>();

    for (const rec of validRecords) {
      const vStatus = (rec.verificationStatus || 'VERIFIED').toUpperCase();
      if (vStatus === 'VERIFIED') verifiedCount++;
      else if (vStatus === 'UNANSWERED_IN_SOURCE') unansweredInSourceCount++;
      else if (vStatus === 'NEEDS_REVIEW') needsReviewCount++;
      else if (vStatus === 'REJECTED') rejectedCount++;

      const heading = rec.sourceHeading || 'General Topic';
      if (!topicMap.has(heading)) {
        topicMap.set(heading, {
          topicHeading: heading,
          total: 0,
          verified: 0,
          needsReview: 0,
          unansweredInSource: 0,
          rejected: 0,
        });
      }

      const item = topicMap.get(heading)!;
      item.total++;
      if (vStatus === 'VERIFIED') item.verified++;
      else if (vStatus === 'UNANSWERED_IN_SOURCE') item.unansweredInSource++;
      else if (vStatus === 'NEEDS_REVIEW') item.needsReview++;
      else if (vStatus === 'REJECTED') item.rejected++;
    }

    const topicBreakdown = Array.from(topicMap.values()).sort((a, b) => a.topicHeading.localeCompare(b.topicHeading));

    return {
      fileName,
      totalRecords: validRecords.length + invalidRecords.length,
      topicsCount: topicBreakdown.length,
      verifiedCount,
      unansweredInSourceCount,
      needsReviewCount,
      rejectedCount,
      duplicateCount,
      invalidCount: invalidRecords.length,
      topicBreakdown,
      validRecords,
      invalidRecords,
    };
  }

  /**
   * Imports validated JSONL records transactionally into PostgreSQL.
   *
   * The target subject/module is caller-supplied, not inferred from the file content — a JSONL
   * file has no reliable subject field, and earlier this always hardcoded "Computer Organization
   * & Architecture" / "Chapter 1" regardless of what was actually in the file, silently dumping
   * unrelated content (e.g. a Data Structures question set) into the wrong subject.
   */
  public static async importJSONLToDatabase(
    fileContent: string | Buffer,
    userId: string,
    fileName: string = 'Ch1_questions.jsonl',
    target: { subjectId?: string; subjectName?: string; subjectCode?: string; department?: string; moduleName?: string } = {}
  ) {
    const preview = this.parseAndValidateJSONL(fileContent, fileName);

    if (preview.validRecords.length === 0) {
      throw new Error('No valid records found in JSONL file.');
    }

    if (!target.subjectId && !target.subjectName) {
      throw new Error('A target subject is required for JSONL import (subjectId of an existing subject, or subjectName to create/reuse one).');
    }

    // 1. Resolve the caller-specified subject — by id if given, else find-or-create by name/code.
    let subject = target.subjectId
      ? await prisma.subject.findUnique({ where: { id: target.subjectId } })
      : await prisma.subject.findFirst({
          where: {
            OR: [
              { name: { equals: target.subjectName!, mode: 'insensitive' } },
              ...(target.subjectCode ? [{ code: { equals: target.subjectCode, mode: 'insensitive' as const } }] : []),
            ],
          },
        });

    if (target.subjectId && !subject) {
      throw new Error(`Subject with id "${target.subjectId}" not found.`);
    }

    if (!subject) {
      subject = await prisma.subject.create({
        data: {
          name: target.subjectName!,
          code: target.subjectCode || `GEN-${target.subjectName!.replace(/[^A-Za-z0-9]/g, '').slice(0, 12).toUpperCase()}-${Date.now() % 1000}`,
          department: target.department || 'CSE',
        },
      });
    }

    const moduleName = target.moduleName || 'Chapter 1';

    // 2. Pre-create or map Module & Topic & Subtopic taxonomy entities
    const topicHeadingToSubtopicMap = new Map<string, string>();

    for (const item of preview.topicBreakdown) {
      const topicName = item.topicHeading;

      let module = await prisma.module.findFirst({
        where: { subjectId: subject.id, name: moduleName },
      });
      if (!module) {
        module = await prisma.module.create({
          data: {
            name: moduleName,
            subjectId: subject.id,
          },
        });
      }

      let topic = await prisma.topic.findFirst({
        where: {
          name: { equals: topicName, mode: 'insensitive' },
          moduleId: module.id,
        },
      });
      if (!topic) {
        topic = await prisma.topic.create({
          data: {
            name: topicName,
            moduleId: module.id,
          },
        });
      }

      let subtopic = await prisma.subtopic.findFirst({
        where: { topicId: topic.id },
      });
      if (!subtopic) {
        subtopic = await prisma.subtopic.create({
          data: {
            name: `${topicName} Subtopic`,
            topicId: topic.id,
          },
        });
      }

      topicHeadingToSubtopicMap.set(topicName, subtopic.id);
    }

    // 3. Pre-fetch existing customIds to detect duplicates in 1 single query
    const validIds = preview.validRecords.map((r) => r.questionId);
    const existingRows = await prisma.question.findMany({
      where: { customId: { in: validIds } },
      select: { customId: true },
    });
    const existingSet = new Set(existingRows.map((q) => q.customId).filter(Boolean));
    const existingDuplicateCount = existingSet.size;

    // 4. Prepare data payload in memory
    const questionsToCreate: any[] = [];

    for (const rec of preview.validRecords) {
      if (existingSet.has(rec.questionId)) {
        continue;
      }

      const subtopicId =
        topicHeadingToSubtopicMap.get(rec.sourceHeading || 'General Topic') ||
        Array.from(topicHeadingToSubtopicMap.values())[0];

      let qType: QuestionType = QuestionType.MCQ;
      const rawType = (rec.questionType || '').toUpperCase();
      if (rawType === 'MCQ') qType = QuestionType.MCQ;
      else if (rawType === 'MSQ') qType = QuestionType.MSQ;
      else if (rawType === 'NAT') qType = QuestionType.NAT;
      else if (rawType === 'FREE_RESPONSE') qType = QuestionType.FREE_RESPONSE;
      else if (rawType === 'UNKNOWN') qType = QuestionType.UNKNOWN;

      let vStatus: VerificationStatus = VerificationStatus.VERIFIED;
      const rawVStatus = (rec.verificationStatus || '').toUpperCase();
      if (rawVStatus === 'VERIFIED') vStatus = VerificationStatus.VERIFIED;
      else if (rawVStatus === 'UNANSWERED_IN_SOURCE') vStatus = VerificationStatus.UNANSWERED_IN_SOURCE;
      else if (rawVStatus === 'NEEDS_REVIEW') vStatus = VerificationStatus.NEEDS_REVIEW;
      else if (rawVStatus === 'REJECTED') vStatus = VerificationStatus.REJECTED;
      else if (rawVStatus === 'EXTRACTED') vStatus = VerificationStatus.EXTRACTED;
      else if (rawVStatus === 'VALIDATING') vStatus = VerificationStatus.VALIDATING;

      const visualMetadata = {
        visualExtractionReason: rec.visualExtractionReason || null,
        visualExtractionPage: rec.visualExtractionPage || null,
        answerKeyPage: rec.answerKeyPage || null,
        originalQuestionId: rec.originalQuestionId || rec.questionId,
        reason: rec.reason || null,
      };

      const { options: normalizedOptions, correctAnswer: normalizedCorrectAnswer, needsReview } = this.normalizeOptionsAndAnswer(rec, qType);
      // A NAT answer that couldn't be fully/unambiguously parsed must never stay tagged VERIFIED —
      // that status is what lets a question straight into a real exam.
      const effectiveVStatus = needsReview && vStatus === VerificationStatus.VERIFIED ? VerificationStatus.NEEDS_REVIEW : vStatus;

      questionsToCreate.push({
        customId: rec.questionId,
        text: rec.question,
        type: qType,
        difficulty: Difficulty.MEDIUM,
        marks: qType === QuestionType.NAT ? 2.0 : 1.0,
        negativeMarks: qType === QuestionType.MCQ ? 0.33 : 0.0,
        options: normalizedOptions,
        correctAnswer: normalizedCorrectAnswer,
        rawAnswer: rec.rawAnswer || null,
        explanation: rec.reason || null,
        subtopicId,
        createdById: userId,
        generatedByAI: false,
        origin: QuestionOrigin.SOURCE,
        verificationStatus: effectiveVStatus,
        sourcePage: rec.sourcePage || null,
        sourceChapter: rec.sourceChapter ? String(rec.sourceChapter) : null,
        sourceSection: rec.sourceSection || null,
        sourceHeading: rec.sourceHeading || null,
        containsFigure: Boolean(rec.containsFigure || rec.hasFigure),
        textExtractionUsed: rec.textExtractionUsed ?? true,
        visualExtractionUsed: rec.visualExtractionUsed ?? false,
        visualMetadata: visualMetadata as any,
      });
    }

    // 5. Execute fast createMany transactional insert (1 single SQL query!)
    let importedCount = 0;
    if (questionsToCreate.length > 0) {
      await prisma.$transaction(
        async (tx) => {
          const createRes = await tx.question.createMany({
            data: questionsToCreate,
            skipDuplicates: true,
          });
          importedCount = createRes.count;
        },
        { timeout: 60000 }
      );
    }

    return {
      fileName,
      totalProcessed: preview.totalRecords,
      importedCount,
      skippedCount: preview.invalidCount + existingDuplicateCount,
      duplicateCount: preview.duplicateCount + existingDuplicateCount,
      invalidCount: preview.invalidCount,
      verifiedCount: preview.verifiedCount,
      unansweredCount: preview.unansweredInSourceCount,
      needsReviewCount: preview.needsReviewCount,
      rejectedCount: preview.rejectedCount,
      topicBreakdown: preview.topicBreakdown,
    };
  }

  /**
   * JSONL source files store options as a letter-keyed object ({"A": "...", "B": "..."}) and
   * correctAnswer as the matching letter(s) (["C"]) — a human/source-readable format, but not
   * what the rest of the app understands. Every other write path (exam-taking UI, GateScoringService,
   * excelImportService) uses an options ARRAY of {text} with correctAnswer as 0-based INDICES into
   * that array. Importing the raw JSONL shape verbatim would silently corrupt both rendering
   * (currentQ.options.map crashes on a plain object) and scoring (comparing a letter to a numeric
   * index never matches) — this converts once, at import time, so every downstream consumer sees
   * the one real shape.
   */
  /**
   * Parses this dataset's NAT answer-key format, which is GATE's own "min : max" tolerance-range
   * notation, not a plain number — a plain `Number(raw)` on e.g. "17 : 17" or "1.4 : 1.5" is
   * always NaN, which previously fell through to an empty `{}` correctAnswer for every single
   * NAT question in this format (confirmed live: all 62 NAT questions in the Chapter 1 dataset
   * use this notation, so every one of them silently became unscoreable — always graded wrong
   * regardless of what the student entered). A degenerate range (min === max) is stored as an
   * exact `{value}` rather than `{min,max}` to match how the rest of the codebase represents an
   * exact NAT answer. The rare compound case (semicolon-separated alternative ranges, e.g.
   * "13.3:13.3;13.5:13.5" — accept either 13.3 or 13.5) isn't expressible in the current
   * {value}|{min,max} scoring model, so only the first alternative is kept and the question is
   * flagged for manual review instead of silently being marked gradable when it only partially is.
   */
  private static parseNATAnswer(raw: string): { answer: any; needsReview: boolean } {
    const trimmed = (raw || '').trim();
    const isMultiRange = trimmed.includes(';');
    const firstSegment = isMultiRange ? trimmed.split(';')[0].trim() : trimmed;

    const rangeMatch = firstSegment.match(/^(-?\d+(?:\.\d+)?)\s*:\s*(-?\d+(?:\.\d+)?)$/);
    if (rangeMatch) {
      const min = Number(rangeMatch[1]);
      const max = Number(rangeMatch[2]);
      const answer = min === max ? { value: min } : { min, max };
      return { answer, needsReview: isMultiRange };
    }

    const plain = Number(firstSegment);
    if (Number.isFinite(plain)) {
      return { answer: { value: plain }, needsReview: isMultiRange };
    }

    // Genuinely unparseable — no silent fallback to a fabricated value; flag for a human.
    return { answer: {}, needsReview: true };
  }

  private static normalizeOptionsAndAnswer(
    rec: JSONLRecord,
    qType: QuestionType
  ): { options: any; correctAnswer: any; needsReview?: boolean } {
    if (qType === QuestionType.MCQ || qType === QuestionType.MSQ) {
      if (rec.options && !Array.isArray(rec.options) && typeof rec.options === 'object') {
        const letters = Object.keys(rec.options).sort();
        const optionsArray = letters.map((l) => ({ text: (rec.options as Record<string, string>)[l] }));
        const letterToIndex = new Map(letters.map((l, i) => [l.toUpperCase(), i]));

        const rawCorrect = Array.isArray(rec.correctAnswer)
          ? rec.correctAnswer
          : rec.correctAnswer !== undefined && rec.correctAnswer !== null
          ? [rec.correctAnswer]
          : [];

        const correctIndices = rawCorrect
          .map((v: any) => {
            if (typeof v === 'string' && letterToIndex.has(v.toUpperCase())) return letterToIndex.get(v.toUpperCase());
            const n = Number(v);
            return Number.isFinite(n) ? n : null;
          })
          .filter((v: any): v is number => v !== null);

        return { options: optionsArray, correctAnswer: correctIndices };
      }

      if (Array.isArray(rec.options)) {
        const optionsArray = rec.options.map((o: any) => (typeof o === 'string' ? { text: o } : o));
        const correctAnswer = Array.isArray(rec.correctAnswer)
          ? rec.correctAnswer.map(Number).filter((n: number) => Number.isFinite(n))
          : [];
        return { options: optionsArray, correctAnswer };
      }

      return { options: [], correctAnswer: [] };
    }

    if (qType === QuestionType.NAT) {
      const raw = Array.isArray(rec.correctAnswer) ? rec.correctAnswer[0] : rec.correctAnswer;
      const parsed = this.parseNATAnswer(typeof raw === 'string' ? raw : String(raw ?? rec.rawAnswer ?? ''));
      return { options: [], correctAnswer: parsed.answer, needsReview: parsed.needsReview };
    }

    // FREE_RESPONSE / UNKNOWN have no auto-gradable structured answer.
    return { options: [], correctAnswer: [] };
  }
}
