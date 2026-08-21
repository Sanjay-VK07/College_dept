import { QuestionType, Difficulty, AIQuestionQualityStatus } from '@prisma/client';
import { RawGeneratedQuestion, QuestionValidationResult } from '../types/questionGenerationTypes';

export class QuestionValidationService {
  /**
   * Deterministically validates structural compliance, content safety, options bounds,
   * answer representation, and explanation quality of an AI-generated question.
   */
  public static validateQuestion(raw: RawGeneratedQuestion): QuestionValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // 1. Basic Content Verification
    if (!raw.stem || typeof raw.stem !== 'string' || raw.stem.trim().length === 0) {
      errors.push('Question stem cannot be empty.');
    }

    if (raw.stem && raw.stem.length > 5000) {
      errors.push('Question stem exceeds maximum allowable length of 5000 characters.');
    }

    if (!raw.explanation || typeof raw.explanation !== 'string' || raw.explanation.trim().length === 0) {
      errors.push('Question explanation cannot be empty.');
    }

    // 2. Sanitization against XSS & Script Injection
    const sanitizedStem = this.sanitizeText(raw.stem || '');
    const sanitizedExplanation = this.sanitizeText(raw.explanation || '');

    if (sanitizedStem !== (raw.stem || '')) {
      warnings.push('Potentially unsafe HTML/script content was stripped from question stem.');
    }

    // 3. Question Type Validation
    const type = raw.type;
    if (!['MCQ', 'MSQ', 'NAT'].includes(type)) {
      errors.push(`Unsupported question type '${type}'. Must be MCQ, MSQ, or NAT.`);
    }

    let normalizedOptions: Array<{ text: string }> | null = null;
    let normalizedCorrectAnswer: any = null;

    // 4. Type-Specific Structural Validation
    if (type === 'MCQ' || type === 'MSQ') {
      // Options Array Validation
      if (!raw.options || !Array.isArray(raw.options)) {
        errors.push(`${type} question must include an options array.`);
      } else {
        const optionStrings: string[] = raw.options.map((opt: any) =>
          typeof opt === 'string' ? opt.trim() : typeof opt === 'object' && opt.text ? opt.text.trim() : ''
        );

        if (optionStrings.length !== 4) {
          errors.push(`${type} question must have exactly 4 options. Found ${optionStrings.length}.`);
        }

        // Check for empty or duplicate options
        const uniqueOptions = new Set(optionStrings.map((o) => o.toLowerCase()));
        if (optionStrings.some((o) => o.length === 0)) {
          errors.push('Options cannot contain empty text strings.');
        }

        if (uniqueOptions.size < optionStrings.length) {
          errors.push('Options contain duplicate choices.');
        }

        normalizedOptions = optionStrings.map((t) => ({ text: t }));

        // Correct Answer Validation
        if (!Array.isArray(raw.correctAnswer)) {
          errors.push(`${type} correct answer must be an array of option indices.`);
        } else {
          const answerIndices = raw.correctAnswer.map((a: any) => Number(a));
          const validBounds = answerIndices.every((idx) => Number.isInteger(idx) && idx >= 0 && idx < optionStrings.length);

          if (!validBounds) {
            errors.push(`${type} correct answer indices must be valid numbers between 0 and 3.`);
          }

          if (type === 'MCQ' && answerIndices.length !== 1) {
            errors.push(`MCQ must have exactly 1 correct answer index. Found ${answerIndices.length}.`);
          }

          if (type === 'MSQ' && answerIndices.length < 1) {
            errors.push(`MSQ must have at least 1 correct answer index.`);
          }

          normalizedCorrectAnswer = answerIndices;
        }
      }
    } else if (type === 'NAT') {
      // NAT Answer Validation
      const ans = raw.correctAnswer;
      if (typeof ans === 'number') {
        normalizedCorrectAnswer = { value: ans, min: ans, max: ans };
      } else if (typeof ans === 'object' && ans !== null && 'value' in (ans as any)) {
        const val = Number((ans as any).value);
        const min = (ans as any).min !== undefined ? Number((ans as any).min) : val - ((ans as any).tolerance || 0);
        const max = (ans as any).max !== undefined ? Number((ans as any).max) : val + ((ans as any).tolerance || 0);

        if (isNaN(val)) {
          errors.push('NAT question value must be a valid numerical number.');
        } else {
          normalizedCorrectAnswer = { value: val, min, max };
        }
      } else {
        errors.push('NAT correct answer must be a valid numerical value or object with value, min, and max properties.');
      }
    }

    // 5. Quality Score Calculation (Deterministic)
    let structuralScore = 1.0;
    if (errors.length > 0) structuralScore = 0.0;
    else if (warnings.length > 0) structuralScore = 0.85;

    let qualityStatus: AIQuestionQualityStatus = AIQuestionQualityStatus.PASS;
    if (errors.length > 0) qualityStatus = AIQuestionQualityStatus.REJECT;
    else if (warnings.length > 0 || (sanitizedExplanation && sanitizedExplanation.length < 30)) {
      qualityStatus = AIQuestionQualityStatus.REVIEW;
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      structuralScore,
      qualityStatus,
      qualityScore: structuralScore,
      sanitizedStem,
      sanitizedExplanation,
      normalizedOptions,
      normalizedCorrectAnswer,
    };
  }

  private static sanitizeText(text: string): string {
    if (!text) return '';
    return text
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/on\w+="[^"]*"/gi, '')
      .replace(/javascript:/gi, '');
  }
}
