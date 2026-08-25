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
   */
  public static async importJSONLToDatabase(fileContent: string | Buffer, userId: string, fileName: string = 'Ch1_questions.jsonl') {
    const preview = this.parseAndValidateJSONL(fileContent, fileName);

    if (preview.validRecords.length === 0) {
      throw new Error('No valid records found in JSONL file.');
    }

    // 1. Resolve or create Subject "Computer Organization & Architecture"
    let subject = await prisma.subject.findFirst({
      where: {
        OR: [
          { name: { equals: 'Computer Organization & Architecture', mode: 'insensitive' } },
          { code: { equals: 'CS_COA', mode: 'insensitive' } },
        ],
      },
    });

    if (!subject) {
      subject = await prisma.subject.create({
        data: {
          name: 'Computer Organization & Architecture',
          code: 'CS_COA',
          department: 'CSE',
        },
      });
    }

    // 2. Pre-create or map Module & Topic & Subtopic taxonomy entities
    const topicHeadingToSubtopicMap = new Map<string, string>();

    for (const item of preview.topicBreakdown) {
      const topicName = item.topicHeading;

      let module = await prisma.module.findFirst({
        where: { subjectId: subject.id, name: 'Chapter 1' },
      });
      if (!module) {
        module = await prisma.module.create({
          data: {
            name: 'Chapter 1',
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

      questionsToCreate.push({
        customId: rec.questionId,
        text: rec.question,
        type: qType,
        difficulty: Difficulty.MEDIUM,
        marks: qType === QuestionType.NAT ? 2.0 : 1.0,
        negativeMarks: qType === QuestionType.MCQ ? 0.33 : 0.0,
        options: rec.options || {},
        correctAnswer: rec.correctAnswer || [],
        rawAnswer: rec.rawAnswer || null,
        explanation: rec.reason || null,
        subtopicId,
        createdById: userId,
        generatedByAI: false,
        origin: QuestionOrigin.SOURCE,
        verificationStatus: vStatus,
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
}
