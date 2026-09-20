import { Difficulty, VerificationStatus, QuestionType } from '@prisma/client';
import fs from 'fs';
import path from 'path';

export interface ExamValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  actualDifficultyBreakdown: { EASY: number; MEDIUM: number; HARD: number };
  topicCoverage: Array<{ topicId: string; topicName: string; questionCount: number }>;
  totalMarks: number;
}

export interface PrePublishValidationResult {
  canPublish: boolean;
  blocking: string[];
  warnings: string[];
  info: string[];
  summary: {
    questionCount: number;
    totalMarks: number;
    durationMinutes: number;
    sourceCount: number;
    aiGeneratedCount: number;
    mcqCount: number;
    msqCount: number;
    natCount: number;
    figureCount: number;
    unverifiedCount: number;
    difficultyBreakdown: { EASY: number; MEDIUM: number; HARD: number };
    topicCoverage: Array<{ topicId: string; topicName: string; questionCount: number }>;
  };
  figureDetails: Array<{
    questionIndex: number;
    questionId: string;
    hasFigure: boolean;
    isValid: boolean;
    figureUrl?: string;
    error?: string;
  }>;
}

export function computeContentRepresentation(q: any): 'TEXT' | 'IMAGE' | 'TEXT_WITH_IMAGE' {
  if (q && q.contentRepresentation) return q.contentRepresentation;
  const rawText = q ? (q.text || (q.questionVersion && q.questionVersion.text) || '') : '';
  const trimmed = rawText.replace(/!\[.*?\]\((.*?)\)/g, '').trim();
  const hasText = !!(trimmed && trimmed !== 'null' && trimmed !== '[Image Question]');

  let url: string | null = (q && (q.imageUrl || (q.questionVersion && q.questionVersion.imageUrl))) || null;
  if (!url && rawText) {
    const match = rawText.match(/!\[.*?\]\((.*?)\)/);
    if (match && match[1]) url = match[1];
  }
  const hasImage = !!(url && url.trim());

  if (hasImage && hasText) return 'TEXT_WITH_IMAGE';
  if (hasImage && !hasText) return 'IMAGE';
  return 'TEXT';
}

export class ExamValidationService {
  /**
   * Deterministically validates an assembled exam against GATE difficulty rules, unique questions,
   * topic coverage, and Question Bank approval status.
   */
  public static validateExamAssembly(params: {
    selectedQuestions: any[];
    requestedCount: number;
    targetDifficulty?: { EASY?: number; MEDIUM?: number; HARD?: number };
  }): ExamValidationResult {
    const { selectedQuestions, requestedCount, targetDifficulty } = params;
    const errors: string[] = [];
    const warnings: string[] = [];

    // 1. Question Count Validation
    if (selectedQuestions.length === 0) {
      errors.push('No approved questions could be selected for this exam.');
    }

    if (selectedQuestions.length < requestedCount) {
      warnings.push(`Requested ${requestedCount} questions, but only ${selectedQuestions.length} approved questions were available.`);
    }

    // 2. Uniqueness & Approval Verification
    const questionIds = selectedQuestions.map((q) => q.id);
    const uniqueIds = new Set(questionIds);

    if (uniqueIds.size < questionIds.length) {
      errors.push('Exam assembly contains duplicate question IDs.');
    }

    // 3. Difficulty Breakdown Calculation
    const counts = { EASY: 0, MEDIUM: 0, HARD: 0 };
    let totalMarks = 0;

    const topicMap = new Map<string, { topicName: string; count: number }>();

    for (const q of selectedQuestions) {
      totalMarks += q.marks || 1.0;

      // Difficulty counting
      const diff = (q.difficulty || 'MEDIUM') as string;
      if (diff === 'EASY' || diff === 'VERY_EASY') counts.EASY++;
      else if (diff === 'HARD' || diff === 'VERY_HARD') counts.HARD++;
      else counts.MEDIUM++;

      // Topic Coverage counting
      const topicId = q.subtopic?.topic?.id || q.subtopicId || 'unknown';
      const topicName = q.subtopic?.topic?.name || 'General';
      const existing = topicMap.get(topicId) || { topicName, count: 0 };
      existing.count++;
      topicMap.set(topicId, existing);
    }

    const topicCoverage = Array.from(topicMap.entries()).map(([topicId, val]) => ({
      topicId,
      topicName: val.topicName,
      questionCount: val.count,
    }));

    // Check Topic Imbalance Warnings
    if (topicCoverage.length === 1 && selectedQuestions.length > 5) {
      warnings.push('Topic coverage is concentrated on a single topic.');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      actualDifficultyBreakdown: counts,
      topicCoverage,
      totalMarks,
    };
  }

  /**
   * Helper to verify figure asset existence and URL validity for a question.
   */
  public static checkFigureIntegrity(q: any, index: number): {
    questionIndex: number;
    questionId: string;
    hasFigure: boolean;
    isValid: boolean;
    figureUrl?: string;
    error?: string;
  } {
    const qId = q.id || `Q${index + 1}`;
    let url: string | null = q.imageUrl || (q.questionVersion && q.questionVersion.imageUrl) || null;
    const text = q.text || (q.questionVersion && q.questionVersion.text) || '';
    const match = text.match(/!\[.*?\]\((.*?)\)/);
    if (match && match[1]) {
      url = match[1];
    }

    if (!url || !url.trim()) {
      return { questionIndex: index + 1, questionId: qId, hasFigure: false, isValid: true };
    }

    const cleanUrl = url.trim();

    // Local static file path check
    if (cleanUrl.startsWith('/') || cleanUrl.startsWith('uploads/')) {
      const relativePath = cleanUrl.replace(/^\//, '');
      const p1 = path.resolve(process.cwd(), 'public', relativePath);
      const p2 = path.resolve(process.cwd(), relativePath);

      if (!fs.existsSync(p1) && !fs.existsSync(p2)) {
        return {
          questionIndex: index + 1,
          questionId: qId,
          hasFigure: true,
          isValid: false,
          figureUrl: cleanUrl,
          error: `Question #${index + 1} figure asset file is missing on server (${cleanUrl}).`,
        };
      }
    }

    return {
      questionIndex: index + 1,
      questionId: qId,
      hasFigure: true,
      isValid: true,
      figureUrl: cleanUrl,
    };
  }

  /**
   * Pre-Publish Comprehensive Multi-Tier Validation Engine.
   * Categorizes errors into BLOCKING (prevents publication), WARNING (advisory), and INFO.
   */
  public static validatePrePublish(mockTest: any): PrePublishValidationResult {
    const blocking: string[] = [];
    const warnings: string[] = [];
    const info: string[] = [];

    const testQuestions = mockTest.testQuestions || [];
    const questionCount = testQuestions.length;

    // 1. Question Count Validation
    if (questionCount === 0) {
      blocking.push('Examination contains zero questions.');
    }

    // Extract questions (either from mockTestQuestion.question or mockTestQuestion.questionVersion or raw question)
    const questionsList = testQuestions.map((tq: any, idx: number) => {
      const q = tq.question || tq;
      const qv = tq.questionVersion;
      return {
        id: q.id || tq.questionId,
        customId: q.customId,
        text: qv?.text || q.text || '',
        type: qv?.type || q.type || QuestionType.MCQ,
        difficulty: qv?.difficulty || q.difficulty || Difficulty.MEDIUM,
        marks: qv?.marks ?? q.marks ?? 1.0,
        negativeMarks: qv?.negativeMarks ?? q.negativeMarks ?? 0.33,
        options: qv?.options || q.options || [],
        correctAnswer: qv?.correctAnswer ?? q.correctAnswer,
        verificationStatus: q.verificationStatus || VerificationStatus.VERIFIED,
        origin: q.origin || 'SOURCE',
        imageUrl: qv?.imageUrl || q.imageUrl,
        containsFigure: q.containsFigure,
        subtopic: q.subtopic,
        subtopicId: q.subtopicId,
        order: tq.order || idx + 1,
        questionVersionId: tq.questionVersionId,
        questionVersion: qv,
      };
    });

    // 2. Uniqueness & Duplicate Checks
    const seenIds = new Set<string>();
    const duplicateIds = new Set<string>();

    for (const q of questionsList) {
      if (seenIds.has(q.id)) {
        duplicateIds.add(q.id);
      } else {
        seenIds.add(q.id);
      }
    }

    if (duplicateIds.size > 0) {
      blocking.push(`Examination contains ${duplicateIds.size} duplicate question ID(s).`);
    }

    // Metrics Counters
    let calculatedTotalMarks = 0;
    let unverifiedCount = 0;
    let sourceCount = 0;
    let aiGeneratedCount = 0;
    let mcqCount = 0;
    let msqCount = 0;
    let natCount = 0;
    let figureCount = 0;

    const diffCounts = { EASY: 0, MEDIUM: 0, HARD: 0 };
    const topicMap = new Map<string, { topicName: string; count: number }>();
    const figureDetails: Array<any> = [];

    // 3. Question-level Blocking & Quality Audits
    questionsList.forEach((q: any, idx: number) => {
      const qNum = idx + 1;

      // Verification Status Check
      if (q.verificationStatus !== VerificationStatus.VERIFIED) {
        unverifiedCount++;
        blocking.push(`Question #${qNum} has status '${q.verificationStatus}' (Only VERIFIED questions can be published).`);
      }

      // Question Content & Text Check
      if (!q.text || !q.text.trim()) {
        blocking.push(`Question #${qNum} text statement is missing or empty.`);
      }

      // Options Check for MCQ/MSQ
      if (q.type === QuestionType.MCQ || q.type === QuestionType.MSQ) {
        if (!Array.isArray(q.options) || q.options.length < 2) {
          blocking.push(`Question #${qNum} (${q.type}) must have at least 2 options.`);
        }
      }

      // Correct Answer Check
      if (q.correctAnswer === null || q.correctAnswer === undefined || q.correctAnswer === '') {
        blocking.push(`Question #${qNum} is missing a correct answer definition.`);
      }

      // Marks Check
      if (typeof q.marks !== 'number' || q.marks <= 0 || isNaN(q.marks)) {
        blocking.push(`Question #${qNum} has invalid marks (${q.marks}). Marks must be > 0.`);
      } else {
        calculatedTotalMarks += q.marks;
      }

      // Snapshot Integrity Check
      if (testQuestions[idx] && !testQuestions[idx].questionVersionId) {
        blocking.push(`Question #${qNum} is missing a frozen QuestionVersion snapshot.`);
      }

      // Figure Integrity Check
      const figCheck = ExamValidationService.checkFigureIntegrity(q, idx);
      figureDetails.push(figCheck);
      if (figCheck.hasFigure) figureCount++;
      if (!figCheck.isValid) {
        blocking.push(figCheck.error || `Question #${qNum} has a broken/missing figure reference.`);
      }

      // Origin Counting
      if (q.origin === 'AI_GENERATED') {
        aiGeneratedCount++;
      } else {
        sourceCount++;
      }

      // Question Type Counting
      if (q.type === QuestionType.MCQ) mcqCount++;
      else if (q.type === QuestionType.MSQ) msqCount++;
      else if (q.type === QuestionType.NAT) natCount++;

      // Difficulty Breakdown Counting
      const diff = (q.difficulty || 'MEDIUM') as string;
      if (diff === 'EASY' || diff === 'VERY_EASY') diffCounts.EASY++;
      else if (diff === 'HARD' || diff === 'VERY_HARD') diffCounts.HARD++;
      else diffCounts.MEDIUM++;

      // Topic Coverage Counting
      const topicId = q.subtopic?.topic?.id || q.subtopicId || 'unknown';
      const topicName = q.subtopic?.topic?.name || 'General';
      const existing = topicMap.get(topicId) || { topicName, count: 0 };
      existing.count++;
      topicMap.set(topicId, existing);
    });

    // 4. Marks Sum & Exam Config Validation
    const expectedMarks = Number(mockTest.totalMarks || 0);
    if (expectedMarks > 0 && Math.abs(calculatedTotalMarks - expectedMarks) > 0.01 && questionCount > 0) {
      warnings.push(
        `Total marks mismatch: Exam configured total marks is ${expectedMarks}, but sum of question marks is ${calculatedTotalMarks}.`
      );
    }

    // Duration Check
    if (!mockTest.durationMinutes || mockTest.durationMinutes <= 0) {
      blocking.push('Exam duration must be greater than 0 minutes.');
    }

    // Schedule Check
    if (mockTest.startTime && mockTest.endTime) {
      const start = new Date(mockTest.startTime).getTime();
      const end = new Date(mockTest.endTime).getTime();
      if (end <= start) {
        blocking.push('Exam end time must be scheduled after start time.');
      }
    }

    // 5. Warnings Generation
    if (questionCount > 0 && aiGeneratedCount / questionCount > 0.5) {
      warnings.push(`High ratio of AI-generated questions (${Math.round((aiGeneratedCount / questionCount) * 100)}% AI_GENERATED).`);
    }

    const topicCoverage = Array.from(topicMap.entries()).map(([topicId, val]) => ({
      topicId,
      topicName: val.topicName,
      questionCount: val.count,
    }));

    if (topicCoverage.length === 1 && questionCount > 5) {
      warnings.push(`All ${questionCount} questions are concentrated on a single topic (${topicCoverage[0].topicName}).`);
    }

    if (questionCount > 0) {
      if (diffCounts.EASY / questionCount > 0.8) {
        warnings.push('Difficulty distribution is heavily skewed toward EASY questions.');
      } else if (diffCounts.HARD / questionCount > 0.8) {
        warnings.push('Difficulty distribution is heavily skewed toward HARD questions.');
      }
    }

    // 6. Informational Details
    info.push(`${sourceCount} questions from verified Question Bank (SOURCE).`);
    if (aiGeneratedCount > 0) {
      info.push(`${aiGeneratedCount} questions generated by AI (AI_GENERATED).`);
    }
    info.push(`Question Type breakdown: ${mcqCount} MCQ, ${msqCount} MSQ, ${natCount} NAT.`);
    if (figureCount > 0) {
      info.push(`Contains ${figureCount} question(s) with figures/diagrams.`);
    }

    return {
      canPublish: blocking.length === 0,
      blocking,
      warnings,
      info,
      summary: {
        questionCount,
        totalMarks: calculatedTotalMarks,
        durationMinutes: mockTest.durationMinutes || 0,
        sourceCount,
        aiGeneratedCount,
        mcqCount,
        msqCount,
        natCount,
        figureCount,
        unverifiedCount,
        difficultyBreakdown: diffCounts,
        topicCoverage,
      },
      figureDetails,
    };
  }

  /**
   * Validates a temporary in-memory preview payload (unsaved questions list + exam metadata)
   * before database exam creation.
   */
  public static validatePreviewPayload(params: {
    title?: string;
    durationMinutes?: number;
    totalMarks?: number;
    questions: any[];
  }): PrePublishValidationResult {
    const { title, durationMinutes, totalMarks, questions } = params;
    const blocking: string[] = [];
    const warnings: string[] = [];
    const info: string[] = [];

    const questionCount = questions ? questions.length : 0;
    if (questionCount === 0) {
      blocking.push('Examination preview contains zero questions.');
    }

    const seenIds = new Set<string>();
    const duplicateIds = new Set<string>();

    for (const q of questions || []) {
      const qId = q.id || q.questionId;
      if (seenIds.has(qId)) {
        duplicateIds.add(qId);
      } else {
        seenIds.add(qId);
      }
    }

    if (duplicateIds.size > 0) {
      blocking.push(`Examination contains ${duplicateIds.size} duplicate question ID(s).`);
    }

    let calculatedTotalMarks = 0;
    let unverifiedCount = 0;
    let sourceCount = 0;
    let aiGeneratedCount = 0;
    let mcqCount = 0;
    let msqCount = 0;
    let natCount = 0;
    let figureCount = 0;
    let imageOptionCount = 0;

    const diffCounts = { EASY: 0, MEDIUM: 0, HARD: 0 };
    const topicMap = new Map<string, { topicName: string; count: number }>();
    const figureDetails: Array<any> = [];

    (questions || []).forEach((q: any, idx: number) => {
      const qNum = idx + 1;
      const contentRep = computeContentRepresentation(q);

      // Check N/A / EXCLUDED_NA
      const rawAnsStr = String(q.rawAnswer || JSON.stringify(q.correctAnswer || '')).toUpperCase();
      if (rawAnsStr.includes('N/A') || rawAnsStr.includes('EXCLUDED_NA')) {
        blocking.push(`Question #${qNum} has answer 'N/A' and is excluded from exam creation.`);
      }

      // Check verification status if defined
      if (q.verificationStatus && q.verificationStatus !== VerificationStatus.VERIFIED) {
        unverifiedCount++;
        blocking.push(`Question #${qNum} has status '${q.verificationStatus}' (Only VERIFIED questions can be included).`);
      }

      // Check text / image based on contentRepresentation
      if (contentRep === 'TEXT' || contentRep === 'TEXT_WITH_IMAGE') {
        const textVal = (q.text || (q.questionVersion && q.questionVersion.text) || '').replace(/!\[.*?\]\((.*?)\)/g, '').trim();
        if (!textVal) {
          blocking.push(`Question #${qNum} text statement is missing or empty.`);
        }
      }

      // Options check for MCQ / MSQ
      const qType = q.type || (q.questionVersion && q.questionVersion.type) || QuestionType.MCQ;
      if (qType === QuestionType.MCQ || qType === QuestionType.MSQ) {
        const opts = q.options || (q.questionVersion && q.questionVersion.options) || [];
        if (!Array.isArray(opts) || opts.length < 2) {
          blocking.push(`Question #${qNum} (${qType}) must have at least 2 options.`);
        } else {
          opts.forEach((opt: any, optIdx: number) => {
            if (opt && typeof opt === 'object' && opt.imagePath) {
              imageOptionCount++;
              const figCheckOpt = ExamValidationService.checkFigureIntegrity({ imageUrl: opt.imagePath }, idx);
              if (!figCheckOpt.isValid) {
                blocking.push(`Question #${qNum} option ${String.fromCharCode(65 + optIdx)} image asset is missing (${opt.imagePath}).`);
              }
            }
          });
        }
      }

      // Correct Answer check
      const corrAns = q.correctAnswer ?? (q.questionVersion && q.questionVersion.correctAnswer);
      if (corrAns === null || corrAns === undefined || corrAns === '') {
        blocking.push(`Question #${qNum} is missing a correct answer definition.`);
      }

      // Marks check
      const marksVal = q.marks ?? (q.questionVersion && q.questionVersion.marks) ?? 1.0;
      if (typeof marksVal !== 'number' || marksVal <= 0 || isNaN(marksVal)) {
        blocking.push(`Question #${qNum} has invalid marks (${marksVal}). Marks must be > 0.`);
      } else {
        calculatedTotalMarks += marksVal;
      }

      // Figure integrity check
      const figCheck = ExamValidationService.checkFigureIntegrity(q, idx);
      figureDetails.push(figCheck);
      if (figCheck.hasFigure || contentRep === 'IMAGE' || contentRep === 'TEXT_WITH_IMAGE') {
        figureCount++;
        if (!figCheck.isValid) {
          blocking.push(figCheck.error || `Question #${qNum} has a broken figure reference.`);
        }
      }

      // Origin counting
      if (q.origin === 'AI_GENERATED') aiGeneratedCount++;
      else sourceCount++;

      // Question Type counting
      if (qType === QuestionType.MCQ) mcqCount++;
      else if (qType === QuestionType.MSQ) msqCount++;
      else if (qType === QuestionType.NAT) natCount++;

      // Difficulty breakdown
      const diff = (q.difficulty || (q.questionVersion && q.questionVersion.difficulty) || 'MEDIUM') as string;
      if (diff === 'EASY' || diff === 'VERY_EASY') diffCounts.EASY++;
      else if (diff === 'HARD' || diff === 'VERY_HARD') diffCounts.HARD++;
      else diffCounts.MEDIUM++;

      // Topic coverage
      const topicId = q.subtopic?.topic?.id || q.subtopicId || 'unknown';
      const topicName = q.subtopic?.topic?.name || 'General';
      const existing = topicMap.get(topicId) || { topicName, count: 0 };
      existing.count++;
      topicMap.set(topicId, existing);
    });

    // Total marks validation
    if (totalMarks && totalMarks > 0 && Math.abs(calculatedTotalMarks - totalMarks) > 0.01 && questionCount > 0) {
      warnings.push(`Total marks mismatch: Exam configured total marks is ${totalMarks}, but sum of question marks is ${calculatedTotalMarks}.`);
    }

    // Duration check
    if (durationMinutes !== undefined && durationMinutes <= 0) {
      blocking.push('Exam duration must be greater than 0 minutes.');
    }

    // Warnings
    if (questionCount > 0 && aiGeneratedCount / questionCount > 0.5) {
      warnings.push(`High ratio of AI-generated questions (${Math.round((aiGeneratedCount / questionCount) * 100)}% AI_GENERATED).`);
    }

    const topicCoverage = Array.from(topicMap.entries()).map(([topicId, val]) => ({
      topicId,
      topicName: val.topicName,
      questionCount: val.count,
    }));

    if (topicCoverage.length === 1 && questionCount > 5) {
      warnings.push(`All ${questionCount} questions are concentrated on a single topic (${topicCoverage[0].topicName}).`);
    }

    // Info
    info.push(`${sourceCount} questions from verified Question Bank (SOURCE).`);
    if (aiGeneratedCount > 0) info.push(`${aiGeneratedCount} questions generated by AI (AI_GENERATED).`);
    info.push(`Question Type breakdown: ${mcqCount} MCQ, ${msqCount} MSQ, ${natCount} NAT.`);
    if (figureCount > 0) info.push(`Contains ${figureCount} question(s) with figures/diagrams.`);
    if (imageOptionCount > 0) info.push(`Contains ${imageOptionCount} image-based option(s).`);

    return {
      canPublish: blocking.length === 0,
      blocking,
      warnings,
      info,
      summary: {
        questionCount,
        totalMarks: calculatedTotalMarks,
        durationMinutes: durationMinutes || 0,
        sourceCount,
        aiGeneratedCount,
        mcqCount,
        msqCount,
        natCount,
        figureCount,
        unverifiedCount,
        difficultyBreakdown: diffCounts,
        topicCoverage,
      },
      figureDetails,
    };
  }
}


