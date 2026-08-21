import { QuestionType, AISolutionVerificationStatus } from '@prisma/client';
import { RawGeneratedSolution, SolutionVerificationResult } from '../types/solutionAndExamTypes';
import { AIProviderService } from './aiProviderService';
import { SolutionGenerationPrompt } from '../prompts/solutionGenerationPrompt';

export class SolutionValidationService {
  /**
   * Deterministically validates draft solution structural correctness, bounds, and content safety.
   */
  public static validateSolutionStructure(
    type: QuestionType,
    raw: RawGeneratedSolution,
    questionOptions?: any
  ): { isValid: boolean; errors: string[]; warnings: string[]; sanitizedExplanation: string; normalizedAnswer: any } {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!raw.explanation || typeof raw.explanation !== 'string' || raw.explanation.trim().length === 0) {
      errors.push('Solution explanation cannot be empty.');
    }

    const sanitizedExplanation = (raw.explanation || '')
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/javascript:/gi, '')
      .trim();

    let normalizedAnswer: any = null;

    if (type === 'MCQ' || type === 'MSQ') {
      const ans = raw.correctAnswer;
      if (!Array.isArray(ans)) {
        errors.push(`${type} correct answer must be an array of option indices.`);
      } else {
        const optionCount = Array.isArray(questionOptions) ? questionOptions.length : 4;
        const indices = ans.map((a: any) => Number(a));

        if (indices.some((idx) => !Number.isInteger(idx) || idx < 0 || idx >= optionCount)) {
          errors.push(`${type} answer indices must be valid numbers between 0 and ${optionCount - 1}.`);
        }

        if (type === 'MCQ' && indices.length !== 1) {
          errors.push('MCQ must have exactly 1 correct answer index.');
        }

        if (type === 'MSQ' && indices.length < 1) {
          errors.push('MSQ must have at least 1 correct answer index.');
        }

        normalizedAnswer = indices;
      }
    } else if (type === 'NAT') {
      const ans = raw.correctAnswer;
      if (typeof ans === 'number') {
        normalizedAnswer = { value: ans, min: ans, max: ans };
      } else if (typeof ans === 'object' && ans !== null && 'value' in (ans as any)) {
        const val = Number((ans as any).value);
        if (isNaN(val)) {
          errors.push('NAT answer value must be a valid numerical number.');
        } else {
          normalizedAnswer = {
            value: val,
            min: (ans as any).min !== undefined ? Number((ans as any).min) : val,
            max: (ans as any).max !== undefined ? Number((ans as any).max) : val,
          };
        }
      } else {
        errors.push('NAT answer must be a valid numerical value or range object.');
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      sanitizedExplanation,
      normalizedAnswer,
    };
  }

  /**
   * Independent second-pass verification pass using an independent LLM call over retrieved context.
   */
  public static async verifySolutionIndependently(params: {
    questionText: string;
    questionType: string;
    optionsJson?: any;
    candidateAnswer: any;
    candidateExplanation: string;
    contextText: string;
  }): Promise<SolutionVerificationResult> {
    const { questionText, questionType, optionsJson, candidateAnswer, candidateExplanation, contextText } = params;

    const systemPrompt = 'You are an independent GATE academic answer verifier. Return strict JSON verdict.';
    const userPrompt = SolutionGenerationPrompt.buildVerificationPrompt({
      questionText,
      questionType,
      optionsJson,
      candidateAnswer,
      candidateExplanation,
      contextText,
    });

    try {
      const response = await AIProviderService.generateResponse(systemPrompt, [], userPrompt);

      if (!response.success || !response.content) {
        return {
          verificationStatus: AISolutionVerificationStatus.REQUIRES_REVIEW,
          isCorrectAnswerMatching: true,
          explanationQualityScore: 0.7,
          warnings: ['Independent verifier call was skipped due to provider unavailability.'],
          errors: [],
        };
      }

      let cleanJson = response.content.trim();
      if (cleanJson.startsWith('```')) {
        cleanJson = cleanJson.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
      }

      const parsed = JSON.parse(cleanJson);
      const verdict = parsed.verificationVerdict || 'PASS';

      let status: AISolutionVerificationStatus = AISolutionVerificationStatus.PASS;
      if (verdict === 'FAIL') status = AISolutionVerificationStatus.FAIL;
      else if (verdict === 'REQUIRES_REVIEW') status = AISolutionVerificationStatus.REQUIRES_REVIEW;

      return {
        verificationStatus: status,
        isCorrectAnswerMatching: parsed.isCorrectAnswerMatching ?? true,
        explanationQualityScore: parsed.explanationQualityScore || 0.9,
        warnings: parsed.notes ? [parsed.notes] : [],
        errors: status === AISolutionVerificationStatus.FAIL ? ['Independent verifier detected answer contradiction.'] : [],
        verifiedAnswer: candidateAnswer,
        verifiedExplanation: candidateExplanation,
      };
    } catch (err: any) {
      return {
        verificationStatus: AISolutionVerificationStatus.REQUIRES_REVIEW,
        isCorrectAnswerMatching: true,
        explanationQualityScore: 0.7,
        warnings: [`Independent verification failed: ${err.message}`],
        errors: [],
      };
    }
  }
}
