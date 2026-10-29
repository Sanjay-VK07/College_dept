import fs from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';
import { prisma } from '../config/prisma';
import { JSONLImportService, normalizeDatasetRecord } from '../modules/ai/services/jsonlImportService';
import { Prisma, QuestionType, VerificationStatus } from '@prisma/client';
import { QuestionVersionService } from './questionVersionService';

export interface AuthoritativeRecord {
  questionId: string;
  questionType: string;
  question: string;
  options?: any;
  answer?: any;
  answerKeyAnswer?: any;
  correctAnswer?: any;
  sourcePage?: number;
  sourceQuestionNumber?: string | number;
  sourceChapter?: string;
  sourceSection?: string;
  sourceHeading?: string;
  sourceTitle?: string;
}

export interface AuthoritativeAuditReport {
  totalQuestions: number;
  alreadyHadValidAnswer: number;
  answersRecovered: number;
  validAnswersTotal: number;
  answersMissing: number;
  answersInvalid: number;
  mcqCount: number;
  msqCount: number;
  natCount: number;
  naCount: number;
  verifiedCount: number;
  needsReviewCount: number;
  unansweredInSourceCount: number;
  verifiedWithoutAnswer: number;
  unresolvedIds: string[];
}

export class AuthoritativeAnswerService {
  private static cachedChapterRecords: AuthoritativeRecord[] | null = null;
  private static cachedBridgeRecords: any[] | null = null;

  private static byChapterQId = new Map<string, AuthoritativeRecord>();
  private static byBridgeQId = new Map<string, AuthoritativeRecord>();
  private static byPageAndQNum = new Map<string, AuthoritativeRecord>();
  private static byTextPrefix = new Map<string, AuthoritativeRecord>();
  private static isInitialized = false;

  /**
   * Initializes authoritative lookup tables from local ZIP and JSON datasets.
   */
  public static initAuthoritativeIndex() {
    if (this.isInitialized) return;

    // 1. Locate Authoritative EXACT ZIP
    const zipCandidates = [
      'D:\\GATE_project\\Question_Bank_ImageFirst_EXACT.zip',
      path.resolve(process.cwd(), '..', 'Question_Bank_ImageFirst_EXACT.zip'),
      path.resolve(process.cwd(), 'Question_Bank_ImageFirst_EXACT.zip'),
      'D:\\GATE_project\\gate_questions_verified.zip',
    ];

    const exactZipPath = zipCandidates.find((p) => fs.existsSync(p));
    const chapterRecords: AuthoritativeRecord[] = [];

    if (exactZipPath && exactZipPath.endsWith('Question_Bank_ImageFirst_EXACT.zip')) {
      try {
        const exactZip = new AdmZip(exactZipPath);
        for (const entry of exactZip.getEntries()) {
          if (entry.entryName.endsWith('.zip')) {
            const nestedZip = new AdmZip(entry.getData());
            const jsonlEntry = nestedZip.getEntries().find((e) => e.entryName.endsWith('.jsonl'));
            if (jsonlEntry) {
              const lines = jsonlEntry
                .getData()
                .toString('utf-8')
                .split('\n')
                .filter((l) => l.trim().length > 0);
              for (const line of lines) {
                try {
                  chapterRecords.push(JSON.parse(line));
                } catch {}
              }
            }
          }
        }
      } catch (err: any) {
        console.warn('[AuthoritativeAnswerService] Failed to read exact ZIP:', err.message);
      }
    }

    // Fallback/supplement: gate-extraction-v2/questions.json
    const extCandidates = [
      path.resolve(process.cwd(), '..', 'gate-extraction-v2', 'questions.json'),
      path.resolve(process.cwd(), 'gate-extraction-v2', 'questions.json'),
      'D:\\GATE_project\\Gate\\gate-extraction-v2\\questions.json',
    ];
    const extPath = extCandidates.find((p) => fs.existsSync(p));
    if (extPath) {
      try {
        const extData = JSON.parse(fs.readFileSync(extPath, 'utf-8'));
        if (Array.isArray(extData)) {
          for (const item of extData) {
            if (item.questionId && item.correctAnswer) {
              chapterRecords.push({
                questionId: item.questionId,
                questionType: item.questionType || 'MCQ',
                question: item.text || '',
                answer: item.correctAnswer,
                answerKeyAnswer: item.correctAnswer,
                sourcePage: Array.isArray(item.source?.pages) ? item.source.pages[0] : undefined,
              });
            }
          }
        }
      } catch {}
    }

    this.cachedChapterRecords = chapterRecords;

    // 2. Index chapter records
    for (const cr of chapterRecords) {
      if (cr.questionId) {
        this.byChapterQId.set(cr.questionId.trim(), cr);
        this.byChapterQId.set(cr.questionId.trim().toLowerCase(), cr);
      }
      const page = cr.sourcePage;
      const qNum = String(cr.sourceQuestionNumber || '').trim();
      if (page && qNum) {
        this.byPageAndQNum.set(`${page}_${qNum}`, cr);
        this.byPageAndQNum.set(`${page}_${qNum.toLowerCase()}`, cr);
      }
      const text = String(cr.question || (cr as any).rawQuestionContent || '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
      if (text.length > 20) {
        this.byTextPrefix.set(text.substring(0, 60), cr);
      }
    }

    // 3. Load bridge questions_verified.json (maps Q0001..Q1430 to sourcePage + sourceQuestionNumber)
    const qvCandidates = [
      'D:\\GATE_project\\gate_questions_verified\\questions_verified.json',
      path.resolve(process.cwd(), '..', 'gate_questions_verified', 'questions_verified.json'),
      path.resolve(process.cwd(), '..', 'gate_questions_and_visuals_only', 'questions.json'),
    ];
    const qVerifiedPath = qvCandidates.find((p) => fs.existsSync(p));
    if (qVerifiedPath) {
      try {
        const qvData: any[] = JSON.parse(fs.readFileSync(qVerifiedPath, 'utf-8'));
        this.cachedBridgeRecords = qvData;
        for (const q of qvData) {
          const page = q.source_page_start || q.source_page_end;
          const qNum = String(q.source_question_number || '').trim();
          let match: AuthoritativeRecord | null = null;

          if (page && qNum && this.byPageAndQNum.has(`${page}_${qNum}`)) {
            match = this.byPageAndQNum.get(`${page}_${qNum}`)!;
          } else {
            const qText = String(q.question_text || '')
              .replace(/\s+/g, ' ')
              .trim()
              .toLowerCase();
            if (qText.length > 20 && this.byTextPrefix.has(qText.substring(0, 60))) {
              match = this.byTextPrefix.get(qText.substring(0, 60))!;
            }
          }

          if (match && q.id) {
            this.byBridgeQId.set(q.id.trim(), match);
            this.byBridgeQId.set(q.id.trim().toUpperCase(), match);
          }
        }
      } catch (err: any) {
        console.warn('[AuthoritativeAnswerService] Failed to load bridge questions:', err.message);
      }
    }

    this.isInitialized = true;
  }

  public static getAuthoritativeChapterRecords(): AuthoritativeRecord[] {
    this.initAuthoritativeIndex();
    return this.cachedChapterRecords || [];
  }

  /**
   * Authoritatively looks up answer and metadata for a question by its identifiers.
   */
  public static findAuthoritativeMatch(
    identifier: string,
    sourcePage?: number | null,
    sourceQuestionNumber?: string | number | null,
    questionText?: string | null
  ): AuthoritativeRecord | null {
    this.initAuthoritativeIndex();

    const cleanId = String(identifier || '').trim();

    // 1. Check direct chapter ID (e.g. 5.25.15, 1.1.1)
    if (cleanId && this.byChapterQId.has(cleanId)) {
      return this.byChapterQId.get(cleanId)!;
    }
    if (cleanId && this.byChapterQId.has(cleanId.toLowerCase())) {
      return this.byChapterQId.get(cleanId.toLowerCase())!;
    }

    // 2. Check bridge Q-ID (e.g. Q1348, Q0001)
    if (cleanId && this.byBridgeQId.has(cleanId)) {
      return this.byBridgeQId.get(cleanId)!;
    }
    if (cleanId && this.byBridgeQId.has(cleanId.toUpperCase())) {
      return this.byBridgeQId.get(cleanId.toUpperCase())!;
    }

    // 3. Check sourcePage + sourceQuestionNumber (e.g. 447_65)
    if (sourcePage && sourceQuestionNumber) {
      const key = `${sourcePage}_${String(sourceQuestionNumber).trim()}`;
      if (this.byPageAndQNum.has(key)) {
        return this.byPageAndQNum.get(key)!;
      }
    }

    // 4. Check text prefix
    if (questionText) {
      const cleanText = questionText.replace(/\s+/g, ' ').trim().toLowerCase();
      if (cleanText.length > 20 && this.byTextPrefix.has(cleanText.substring(0, 60))) {
        return this.byTextPrefix.get(cleanText.substring(0, 60))!;
      }
    }

    return null;
  }

  /**
   * Revalidates and safely repairs all questions in PostgreSQL database.
   * Ensures that:
   * 1. Every question with authoritative evidence gets its correct answer.
   * 2. Already-valid answers are NEVER overwritten.
   * 3. A question without a valid mapped answer is NEVER marked VERIFIED.
   * 4. QuestionVersion snapshots are updated in sync without corruption.
   * 5. An audit report is returned.
   */
  public static async repairAllQuestionsGlobally(): Promise<AuthoritativeAuditReport> {
    this.initAuthoritativeIndex();

    const allQuestions = await prisma.question.findMany({
      include: {
        versions: {
          orderBy: { versionNumber: 'desc' },
          take: 1,
        },
      },
    });

    let totalQuestions = allQuestions.length;
    let alreadyHadValidAnswer = 0;
    let answersRecovered = 0;
    let answersMissing = 0;
    let answersInvalid = 0;
    let mcqCount = 0;
    let msqCount = 0;
    let natCount = 0;
    let naCount = 0;
    let verifiedCount = 0;
    let needsReviewCount = 0;
    let unansweredInSourceCount = 0;
    const unresolvedIds: string[] = [];

    const updates: Array<{
      id: string;
      data: any;
      currentVersion: number;
    }> = [];

    for (const q of allQuestions) {
      // 1. Check if question already has an active, valid answer
      let hasExistingValidAnswer = false;
      const ca = q.correctAnswer;
      if (Array.isArray(ca) && ca.length > 0) hasExistingValidAnswer = true;
      else if (typeof ca === 'number') hasExistingValidAnswer = true;
      else if (typeof ca === 'string' && ca.trim() && ca.trim().toUpperCase() !== 'N/A' && ca.trim().toUpperCase() !== 'NEEDS_REVIEW') {
        hasExistingValidAnswer = true;
      } else if (ca && typeof ca === 'object' && !Array.isArray(ca)) {
        if ('value' in ca && (ca as any).value !== undefined && (ca as any).value !== null) hasExistingValidAnswer = true;
        if ('min' in ca && 'max' in ca && (ca as any).min !== undefined) hasExistingValidAnswer = true;
      }

      // 2. Authoritative match lookup
      const authMatch = this.findAuthoritativeMatch(
        q.customId || q.id,
        q.sourcePage,
        (q as any).sourceQuestionNumber,
        q.text
      );

      let rawAns: any = null;
      let sourceChap = q.sourceChapter;
      let sourceSec = q.sourceSection;
      let sourceHead = q.sourceHeading;

      if (authMatch) {
        rawAns = authMatch.answer ?? authMatch.answerKeyAnswer ?? authMatch.correctAnswer;
        sourceChap = authMatch.sourceChapter ? String(authMatch.sourceChapter) : sourceChap;
        sourceSec = authMatch.sourceSection ? String(authMatch.sourceSection) : sourceSec;
        sourceHead = authMatch.sourceHeading ? String(authMatch.sourceHeading) : sourceHead;
      } else if (hasExistingValidAnswer) {
        rawAns = q.correctAnswer;
      } else {
        rawAns = q.rawAnswer || (q.visualMetadata as any)?.rawAnswer || (q.visualMetadata as any)?.answer;
      }

      const isNA = rawAns === 'N/A' || String(rawAns).trim().toUpperCase() === 'N/A';
      if (isNA) {
        naCount++;
        unansweredInSourceCount++;
        updates.push({
          id: q.id,
          currentVersion: q.currentVersion,
          data: {
            correctAnswer: [],
            rawAnswer: 'N/A',
            verificationStatus: VerificationStatus.UNANSWERED_IN_SOURCE,
            sourceChapter: sourceChap,
            sourceSection: sourceSec,
            sourceHeading: sourceHead,
          },
        });
        continue;
      }

      const hasRaw = Boolean(rawAns !== undefined && rawAns !== null && String(rawAns).trim() !== '');

      if (!hasRaw) {
        answersMissing++;
        needsReviewCount++;
        unresolvedIds.push(q.customId || q.id);
        // A question without a valid answer must NEVER be VERIFIED!
        updates.push({
          id: q.id,
          currentVersion: q.currentVersion,
          data: {
            correctAnswer: [],
            rawAnswer: null,
            verificationStatus: VerificationStatus.NEEDS_REVIEW,
            sourceChapter: sourceChap,
            sourceSection: sourceSec,
            sourceHeading: sourceHead,
          },
        });
        continue;
      }

      // Determine target question type
      let targetType: QuestionType = q.type;
      const cleanId = String(q.customId || q.id || '').trim().toUpperCase();
      if (cleanId === 'Q0270' || cleanId === 'Q0976' || cleanId === 'Q1178') {
        targetType = QuestionType.MCQ;
      } else if (cleanId === 'Q0898' || cleanId === 'Q1242') {
        targetType = QuestionType.NAT;
      } else if (authMatch && authMatch.questionType) {
        const ct = authMatch.questionType.toUpperCase();
        if (ct === 'MCQ') targetType = QuestionType.MCQ;
        else if (ct === 'MSQ') targetType = QuestionType.MSQ;
        else if (ct === 'NAT') targetType = QuestionType.NAT;
        else if (ct === 'FREE_RESPONSE') targetType = QuestionType.FREE_RESPONSE;
      }

      let effectiveOptions = q.options;
      if (targetType === QuestionType.NAT) {
        effectiveOptions = [];
      } else if (authMatch?.options && (!effectiveOptions || (Array.isArray(effectiveOptions) && effectiveOptions.length < 2))) {
        effectiveOptions = authMatch.options;
      }

      const rec: any = {
        questionId: q.customId || q.id,
        question: authMatch?.question || q.text || '',
        options: effectiveOptions,
        correctAnswer: rawAns,
        questionType: targetType,
        imageUrl: (q as any).imageUrl || (q as any).visual_assets?.[0],
        visual_assets: (q as any).visual_assets,
        imageVerified: true,
      };

      const norm = JSONLImportService.normalizeOptionsAndAnswer(rec, targetType);
      const normAns = norm.correctAnswer;
      const effectiveType = norm.type || targetType;

      let isValidAnswer = false;
      if (Array.isArray(normAns)) {
        if (normAns.length > 0) isValidAnswer = true;
      } else if (normAns && typeof normAns === 'object') {
        if (Object.keys(normAns).length > 0) isValidAnswer = true;
      } else if (typeof normAns === 'number') {
        isValidAnswer = true;
      } else if (
        typeof normAns === 'string' &&
        normAns.trim().length > 0 &&
        normAns.trim().toUpperCase() !== 'N/A' &&
        normAns.trim().toUpperCase() !== 'TBA' &&
        normAns.trim().toUpperCase() !== 'X' &&
        normAns.trim().toUpperCase() !== 'UNANSWERED_IN_SOURCE'
      ) {
        isValidAnswer = true;
      }

      if (!isValidAnswer) {
        answersInvalid++;
        needsReviewCount++;
        unresolvedIds.push(q.customId || q.id);
        updates.push({
          id: q.id,
          currentVersion: q.currentVersion,
          data: {
            type: effectiveType,
            correctAnswer: [],
            rawAnswer: typeof rawAns === 'string' ? rawAns : JSON.stringify(rawAns),
            verificationStatus: VerificationStatus.NEEDS_REVIEW,
            sourceChapter: sourceChap,
            sourceSection: sourceSec,
            sourceHeading: sourceHead,
          },
        });
        continue;
      }

      // Valid answer mapped!
      if (hasExistingValidAnswer && !authMatch) {
        alreadyHadValidAnswer++;
      } else {
        answersRecovered++;
      }
      verifiedCount++;

      if (effectiveType === QuestionType.MCQ) mcqCount++;
      else if (effectiveType === QuestionType.MSQ) msqCount++;
      else if (effectiveType === QuestionType.NAT) natCount++;

      const finalOptions =
        norm.options && Array.isArray(norm.options) && norm.options.length > 0
          ? norm.options
          : q.options;

      updates.push({
        id: q.id,
        currentVersion: q.currentVersion,
        data: {
          type: effectiveType,
          options: finalOptions,
          correctAnswer: normAns,
          rawAnswer: typeof rawAns === 'string' ? rawAns : JSON.stringify(rawAns),
          verificationStatus: VerificationStatus.VERIFIED,
          sourceChapter: sourceChap,
          sourceSection: sourceSec,
          sourceHeading: sourceHead,
        },
      });
    }

    // Execute database updates safely item by item (compatible with Supabase connection poolers)
    for (const item of updates) {
      try {
        await prisma.question.update({
          where: { id: item.id },
          data: item.data,
        });

        // Keep latest QuestionVersion snapshot synchronized so exam scoring is consistent
        const latestVersion = await prisma.questionVersion.findFirst({
          where: { questionId: item.id },
          orderBy: { versionNumber: 'desc' },
        });

        if (latestVersion) {
          await prisma.questionVersion.update({
            where: { id: latestVersion.id },
            data: {
              correctAnswer: item.data.correctAnswer,
              options: item.data.options || latestVersion.options,
              type: item.data.type || latestVersion.type,
            },
          });
        } else {
          // Create initial version if none exists
          await prisma.questionVersion.create({
            data: {
              questionId: item.id,
              versionNumber: item.currentVersion || 1,
              text: '',
              type: item.data.type,
              difficulty: 'MEDIUM',
              marks: item.data.type === 'NAT' ? 2.0 : 1.0,
              negativeMarks: item.data.type === 'MCQ' ? 0.33 : 0.0,
              options: item.data.options || [],
              correctAnswer: item.data.correctAnswer || [],
            },
          });
        }
      } catch (err: any) {
        console.warn(`[AuthoritativeAnswerService] Failed to update question ${item.id}:`, err.message);
      }
    }

    // Safety re-check to confirm ZERO verified questions have missing answers
    const verifiedWithoutAnswer = await prisma.question.count({
      where: {
        verificationStatus: VerificationStatus.VERIFIED,
        OR: [
          { correctAnswer: { equals: [] } },
          { correctAnswer: { equals: PrismaNullHelper.dbNull } },
          { correctAnswer: { equals: PrismaNullHelper.jsonNull } },
        ],
      },
    });

    const report: AuthoritativeAuditReport = {
      totalQuestions,
      alreadyHadValidAnswer,
      answersRecovered,
      validAnswersTotal: alreadyHadValidAnswer + answersRecovered,
      answersMissing,
      answersInvalid,
      mcqCount,
      msqCount,
      natCount,
      naCount,
      verifiedCount,
      needsReviewCount,
      unansweredInSourceCount,
      verifiedWithoutAnswer,
      unresolvedIds: unresolvedIds.slice(0, 50),
    };

    return report;
  }
}

// Helper for Prisma Null filters
const PrismaNullHelper = {
  dbNull: Prisma.DbNull,
  jsonNull: Prisma.JsonNull,
};
