import fs from 'fs';
import path from 'path';
import { prisma } from '../../../config/prisma';
import { VerificationStatus, QuestionOrigin, QuestionType, Difficulty } from '@prisma/client';
import { ExtractedFigureAsset } from '../../../services/zipExtractionService';

export interface JSONLFigureRef {
  figureId?: string;
  type?: string;
  importance?: string;
  imagePath?: string;
  path?: string;
  url?: string;
  sourcePage?: number;
  sourceQuestionId?: string;
  extractionMethod?: string;
  description?: string;
  cropCoordinates?: any;
  verificationStatus?: string;
  needsReview?: boolean;
  reviewReason?: string;
}

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
  figureCount?: number;
  figure?: string | JSONLFigureRef;
  figures?: Array<string | JSONLFigureRef>;
  imageUrl?: string;
  image?: string | JSONLFigureRef;
  textExtractionUsed?: boolean;
  textExtractionStatus?: string;
  visualExtractionUsed?: boolean;
  visualExtractionStatus?: string;
  visualExtractionReason?: string;
  visualExtractionPage?: number;
  verificationStatus?: string;
  reason?: string;
  reviewReason?: string;
  needsReview?: boolean;
  extractionNotes?: string;
  sourceChapter?: string | number;
  sourceSection?: string;
  sourceHeading?: string;
  difficulty?: string;
  marks?: number;
  negativeMarks?: number;
}

export interface TopicBreakdownItem {
  topicHeading: string;
  total: number;
  verified: number;
  needsReview: number;
  unansweredInSource: number;
  rejected: number;
}

export interface MissingFigureRecord {
  questionId: string;
  reference: string;
}

export interface ImportPreviewResult {
  fileName: string;
  totalRecords: number;
  validCount: number;
  questionsWithFigures: number;
  missingFiguresCount: number;
  missingFigures: MissingFigureRecord[];
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
   * Extracts any referenced figure file paths/names from a JSONL record.
   */
  public static extractReferencedFigurePaths(rec: JSONLRecord): string[] {
    const paths: string[] = [];

    if (Array.isArray(rec.figures)) {
      for (const f of rec.figures) {
        if (typeof f === 'string' && f.trim()) {
          paths.push(f.trim());
        } else if (f && typeof f === 'object') {
          const p = f.imagePath || f.path || f.url || (f as any).imageUrl || (f as any).file || (f as any).fileName;
          if (typeof p === 'string' && p.trim()) {
            paths.push(p.trim());
          }
        }
      }
    }

    if (rec.figure) {
      if (typeof rec.figure === 'string' && rec.figure.trim()) {
        paths.push(rec.figure.trim());
      } else if (typeof rec.figure === 'object') {
        const p = (rec.figure as JSONLFigureRef).imagePath || (rec.figure as JSONLFigureRef).path || (rec.figure as JSONLFigureRef).url;
        if (typeof p === 'string' && p.trim()) {
          paths.push(p.trim());
        }
      }
    }

    if (typeof rec.imageUrl === 'string' && rec.imageUrl.trim() && !rec.imageUrl.startsWith('http') && !rec.imageUrl.startsWith('/uploads/')) {
      paths.push(rec.imageUrl.trim());
    }

    return Array.from(new Set(paths));
  }

  /**
   * Finds a figure asset in the provided figure entries map using exact path,
   * lowercase path, basename, or stripped prefix.
   */
  public static resolveFigureAsset(refPath: string, figureEntries?: Map<string, ExtractedFigureAsset>): ExtractedFigureAsset | null {
    if (!figureEntries || figureEntries.size === 0 || !refPath) return null;

    let cleanRef = refPath.replace(/\\/g, '/').trim();
    cleanRef = cleanRef.replace(/^\.\//, '').replace(/^\//, '');

    if (cleanRef.includes('..')) return null;

    const baseName = path.posix.basename(cleanRef);
    const withoutFigures = cleanRef.startsWith('figures/') ? cleanRef.slice('figures/'.length) : cleanRef;

    return (
      figureEntries.get(cleanRef) ||
      figureEntries.get(cleanRef.toLowerCase()) ||
      figureEntries.get(baseName) ||
      figureEntries.get(baseName.toLowerCase()) ||
      figureEntries.get(`figures/${baseName}`) ||
      figureEntries.get(`figures/${baseName}`.toLowerCase()) ||
      figureEntries.get(withoutFigures) ||
      figureEntries.get(withoutFigures.toLowerCase()) ||
      null
    );
  }

  /**
   * Parses and validates a JSONL file without committing into the database.
   * Cross-references figures against `availableFigures` if provided.
   */
  public static parseAndValidateJSONL(
    fileContent: string | Buffer,
    fileName: string = 'Ch1_questions.jsonl',
    availableFigures?: Map<string, ExtractedFigureAsset>
  ): ImportPreviewResult {
    const text = typeof fileContent === 'string' ? fileContent : fileContent.toString('utf-8');
    const lines = text.split('\n');

    const validRecords: JSONLRecord[] = [];
    const invalidRecords: Array<{ line: number; error: string; raw: string }> = [];
    const seenIds = new Set<string>();
    let duplicateCount = 0;

    const missingFigures: MissingFigureRecord[] = [];
    let questionsWithFigures = 0;

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

        // Check figure references
        const refPaths = this.extractReferencedFigurePaths(obj);
        const hasFigureFlag = Boolean(obj.containsFigure || obj.hasFigure || (obj.figureCount && obj.figureCount > 0) || refPaths.length > 0);

        if (hasFigureFlag || refPaths.length > 0) {
          questionsWithFigures++;
        }

        if (availableFigures && refPaths.length > 0) {
          for (const ref of refPaths) {
            const resolved = this.resolveFigureAsset(ref, availableFigures);
            if (!resolved) {
              missingFigures.push({
                questionId: obj.questionId,
                reference: ref,
              });
            }
          }
        }

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
      validCount: validRecords.length,
      questionsWithFigures,
      missingFiguresCount: missingFigures.length,
      missingFigures,
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
   * Persists figure buffer to disk under `public/uploads/diagrams/` and returns the stable URL.
   */
  public static async saveFigureAsset(asset: ExtractedFigureAsset): Promise<{ url: string; newlyCreated: boolean }> {
    const targetDir = path.resolve(process.cwd(), 'public', 'uploads', 'diagrams');
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    // Preserve original sanitized filename (e.g. embedded_da8e61b8f9fc.png)
    const safeBaseName = path.posix.basename(asset.fileName).replace(/[^a-zA-Z0-9._-]/g, '_');
    const filePath = path.join(targetDir, safeBaseName);
    let newlyCreated = false;

    // Save file if not already existing with valid content
    if (!fs.existsSync(filePath)) {
      await fs.promises.writeFile(filePath, asset.buffer);
      newlyCreated = true;
    } else {
      const stats = await fs.promises.stat(filePath);
      if (stats.size === 0 && asset.buffer.length > 0) {
        await fs.promises.writeFile(filePath, asset.buffer);
        newlyCreated = true;
      }
    }

    // Also mirror to uploads/diagrams if separate directory exists
    const fallbackDir = path.resolve(process.cwd(), 'uploads', 'diagrams');
    if (fs.existsSync(path.resolve(process.cwd(), 'uploads'))) {
      if (!fs.existsSync(fallbackDir)) {
        fs.mkdirSync(fallbackDir, { recursive: true });
      }
      const fallbackPath = path.join(fallbackDir, safeBaseName);
      if (!fs.existsSync(fallbackPath)) {
        await fs.promises.writeFile(fallbackPath, asset.buffer).catch(() => {});
      }
    }

    return { url: `/uploads/diagrams/${safeBaseName}`, newlyCreated };
  }

  /**
   * Imports validated JSONL records transactionally into PostgreSQL.
   * Saves and maps figure assets when present.
   */
  public static async importJSONLToDatabase(
    fileContent: string | Buffer,
    userId: string,
    fileName: string = 'Ch1_questions.jsonl',
    target: { subjectId?: string; subjectName?: string; subjectCode?: string; department?: string; moduleName?: string } = {},
    figureEntries?: Map<string, ExtractedFigureAsset>
  ) {
    const preview = this.parseAndValidateJSONL(fileContent, fileName, figureEntries);

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

    // 3. Pre-fetch existing questions by customId to detect duplicates and inspect figure status
    const validIds = preview.validRecords.map((r) => r.questionId);
    const existingRows = await prisma.question.findMany({
      where: { customId: { in: validIds } },
      select: { id: true, customId: true, imageUrl: true, containsFigure: true, visualMetadata: true },
    });
    const existingMap = new Map<string, { id: string; customId: string | null; imageUrl: string | null; containsFigure: boolean; visualMetadata: any }>();
    for (const row of existingRows) {
      if (row.customId) {
        existingMap.set(row.customId, row);
      }
    }
    const existingDuplicateCount = existingMap.size;

    // 4. Save figure assets and prepare question data payload
    let figuresStoredCount = 0;
    let figuresReusedCount = 0;
    let figuresRepairedCount = 0;
    const missingFiguresMap = new Map<string, MissingFigureRecord>();
    const questionsToCreate: any[] = [];

    for (const rec of preview.validRecords) {
      const existingQ = existingMap.get(rec.questionId);
      const refPaths = this.extractReferencedFigurePaths(rec);
      const containsFigureFlag = Boolean(rec.containsFigure || rec.hasFigure || (rec.figureCount && rec.figureCount > 0) || refPaths.length > 0);

      // --- DUPLICATE QUESTION HANDLING (Idempotent for Question, Independent for Figures) ---
      if (existingQ) {
        if (refPaths.length > 0 && figureEntries) {
          for (const ref of refPaths) {
            const asset = this.resolveFigureAsset(ref, figureEntries);
            if (asset) {
              const { url, newlyCreated } = await this.saveFigureAsset(asset);
              if (newlyCreated) {
                figuresStoredCount++;
              } else {
                figuresReusedCount++;
              }

              // Repair existing question in DB if its imageUrl was missing or not pointing to the valid stored diagram
              if (!existingQ.imageUrl || existingQ.imageUrl !== url) {
                await prisma.question.update({
                  where: { id: existingQ.id },
                  data: {
                    imageUrl: url,
                    containsFigure: true,
                  },
                });
                existingQ.imageUrl = url;
                figuresRepairedCount++;
              }
            } else {
              // Asset not resolved from ZIP
              if (existingQ.imageUrl) {
                const p1 = path.resolve(process.cwd(), 'public', existingQ.imageUrl.replace(/^\//, ''));
                const p2 = path.resolve(process.cwd(), existingQ.imageUrl.replace(/^\//, ''));
                if (fs.existsSync(p1) || fs.existsSync(p2)) {
                  figuresReusedCount++;
                } else {
                  missingFiguresMap.set(`${rec.questionId}:${ref}`, { questionId: rec.questionId, reference: ref });
                }
              } else {
                missingFiguresMap.set(`${rec.questionId}:${ref}`, { questionId: rec.questionId, reference: ref });
              }
            }
          }
        } else if (existingQ.imageUrl) {
          figuresReusedCount++;
        }
        continue;
      }

      // --- NEW QUESTION HANDLING ---
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

      // Resolve and save figures for new questions
      let imageUrl: string | null = null;
      if (figureEntries && refPaths.length > 0) {
        for (const ref of refPaths) {
          const asset = this.resolveFigureAsset(ref, figureEntries);
          if (asset) {
            const { url, newlyCreated } = await this.saveFigureAsset(asset);
            if (!imageUrl) {
              imageUrl = url;
            }
            if (newlyCreated) {
              figuresStoredCount++;
            } else {
              figuresReusedCount++;
            }
          } else {
            missingFiguresMap.set(`${rec.questionId}:${ref}`, { questionId: rec.questionId, reference: ref });
          }
        }
      } else if (rec.imageUrl && (rec.imageUrl.startsWith('/uploads/') || rec.imageUrl.startsWith('http'))) {
        imageUrl = rec.imageUrl;
      }

      const visualMetadata: any = {
        visualExtractionReason: rec.visualExtractionReason || null,
        visualExtractionPage: rec.visualExtractionPage || null,
        visualExtractionStatus: rec.visualExtractionStatus || null,
        textExtractionStatus: rec.textExtractionStatus || null,
        answerKeyPage: rec.answerKeyPage || null,
        originalQuestionId: rec.originalQuestionId || rec.questionId,
        reason: rec.reason || rec.reviewReason || null,
        extractionNotes: rec.extractionNotes || null,
        figures: rec.figures || (rec.figure ? [rec.figure] : []),
        resolvedImageUrl: imageUrl,
      };

      const { options: normalizedOptions, correctAnswer: normalizedCorrectAnswer, needsReview } = this.normalizeOptionsAndAnswer(rec, qType);
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
        explanation: rec.reason || rec.reviewReason || rec.extractionNotes || null,
        imageUrl,
        subtopicId,
        createdById: userId,
        generatedByAI: false,
        origin: QuestionOrigin.SOURCE,
        verificationStatus: effectiveVStatus,
        sourcePage: rec.sourcePage || null,
        sourceChapter: rec.sourceChapter ? String(rec.sourceChapter) : (rec.chapter ? String(rec.chapter) : null),
        sourceSection: rec.sourceSection || null,
        sourceHeading: rec.sourceHeading || null,
        containsFigure: containsFigureFlag,
        textExtractionUsed: rec.textExtractionUsed ?? true,
        visualExtractionUsed: rec.visualExtractionUsed ?? false,
        visualMetadata,
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

    const missingFiguresList = Array.from(missingFiguresMap.values());

    return {
      fileName,
      totalProcessed: preview.totalRecords,
      importedCount,
      skippedCount: preview.invalidCount + existingDuplicateCount,
      duplicateCount: preview.duplicateCount + existingDuplicateCount,
      invalidCount: preview.invalidCount,
      questionsWithFiguresCount: preview.questionsWithFigures,
      missingFiguresCount: missingFiguresList.length,
      missingFigures: missingFiguresList,
      figuresStoredCount,
      figuresReusedCount,
      figuresRepairedCount,
      verifiedCount: preview.verifiedCount,
      unansweredCount: preview.unansweredInSourceCount,
      needsReviewCount: preview.needsReviewCount,
      rejectedCount: preview.rejectedCount,
      topicBreakdown: preview.topicBreakdown,
    };
  }

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

    // Genuinely unparseable — flag for review
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
        
        let correctIndices: number[] = [];
        if (Array.isArray(rec.correctAnswer)) {
          correctIndices = rec.correctAnswer.map((v: any) => {
            if (typeof v === 'string' && /^[A-Z]$/i.test(v.trim())) {
              return v.trim().toUpperCase().charCodeAt(0) - 65;
            }
            const n = Number(v);
            return Number.isFinite(n) ? n : null;
          }).filter((n: any): n is number => n !== null);
        } else if (typeof rec.correctAnswer === 'string' && /^[A-Z]$/i.test(rec.correctAnswer.trim())) {
          correctIndices = [rec.correctAnswer.trim().toUpperCase().charCodeAt(0) - 65];
        } else if (typeof rec.correctAnswer === 'number' && Number.isFinite(rec.correctAnswer)) {
          correctIndices = [rec.correctAnswer];
        }

        return { options: optionsArray, correctAnswer: correctIndices };
      }

      return { options: [], correctAnswer: [] };
    }

    if (qType === QuestionType.NAT) {
      const raw = Array.isArray(rec.correctAnswer) ? rec.correctAnswer[0] : rec.correctAnswer;
      const parsed = this.parseNATAnswer(typeof raw === 'string' ? raw : String(raw ?? rec.rawAnswer ?? ''));
      return { options: [], correctAnswer: parsed.answer, needsReview: parsed.needsReview };
    }

    return { options: [], correctAnswer: [] };
  }
}

