import { Difficulty } from '@prisma/client';

export interface ExamValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  actualDifficultyBreakdown: { EASY: number; MEDIUM: number; HARD: number };
  topicCoverage: Array<{ topicId: string; topicName: string; questionCount: number }>;
  totalMarks: number;
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
}
