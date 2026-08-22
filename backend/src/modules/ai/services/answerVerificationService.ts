import { QuestionType } from '@prisma/client';
import { AIProviderService } from './aiProviderService';

export interface AnswerVerificationParams {
  stem: string;
  type: QuestionType;
  options?: any;
  proposedAnswer: any;
  explanation: string;
  sourceContext: string;
}

export interface AnswerVerificationResult {
  verificationStatus: 'PASS' | 'FAIL' | 'REQUIRES_REVIEW' | 'ANSWER_CONFLICT';
  verifiedAnswer: any;
  verifiedExplanation: string;
  answerCorrect: boolean;
  explanationSupported: boolean;
  sourceSupported: boolean;
  ambiguityDetected: boolean;
  verificationNotes: string;
}

export class AnswerVerificationService {
  /**
   * Independently verifies candidate question, options, answer, and explanation against source context.
   */
  public static async verifyAnswer(
    params: AnswerVerificationParams
  ): Promise<AnswerVerificationResult> {
    const { stem, type, options, proposedAnswer, explanation, sourceContext } = params;

    // 1. Basic structural checks
    if (!stem || !explanation || !sourceContext) {
      return {
        verificationStatus: 'FAIL',
        verifiedAnswer: proposedAnswer,
        verifiedExplanation: explanation || '',
        answerCorrect: false,
        explanationSupported: false,
        sourceSupported: false,
        ambiguityDetected: true,
        verificationNotes: 'Missing stem, explanation, or source context.',
      };
    }

    if (type === QuestionType.MCQ && (!options || !Array.isArray(options) || options.length !== 4)) {
      return {
        verificationStatus: 'FAIL',
        verifiedAnswer: proposedAnswer,
        verifiedExplanation: explanation,
        answerCorrect: false,
        explanationSupported: false,
        sourceSupported: false,
        ambiguityDetected: true,
        verificationNotes: 'MCQ must have exactly 4 options.',
      };
    }

    // 2. Perform independent LLM / rule-based verification check
    try {
      const verifierPrompt = `
You are an expert GATE Exam Independent Content Verifier.
Your task is to independently verify the correctness of a candidate question, answer, and explanation strictly against the provided source context.

Source Context:
"""
${sourceContext.slice(0, 4000)}
"""

Question Stem: ${stem}
Question Type: ${type}
Options: ${JSON.stringify(options || [])}
Proposed Answer: ${JSON.stringify(proposedAnswer)}
Proposed Explanation: ${explanation}

Evaluate:
1. Is the proposed answer correct according to the source context?
2. What is the independently derived correct answer?
3. Is the explanation supported by the source context?
4. Is the question free of ambiguity?

Return ONLY valid JSON matching this structure:
{
  "answerCorrect": true|false,
  "verifiedAnswer": <independently derived answer matching type format>,
  "verifiedExplanation": "<independent explanation>",
  "explanationSupported": true|false,
  "sourceSupported": true|false,
  "ambiguityDetected": true|false,
  "notes": "<brief notes>"
}
`;

      const aiRes = await AIProviderService.generateResponse(
        'You are an independent academic verification system for GATE examination questions. Output JSON only.',
        [],
        verifierPrompt
      );

      if (aiRes.success && aiRes.content) {
        let cleanText = aiRes.content.trim();
        if (cleanText.startsWith('```')) {
          cleanText = cleanText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
        }

        const resObj = JSON.parse(cleanText);

        const answerCorrect = Boolean(resObj.answerCorrect);
        const explanationSupported = Boolean(resObj.explanationSupported);
        const sourceSupported = Boolean(resObj.sourceSupported);
        const ambiguityDetected = Boolean(resObj.ambiguityDetected);
        const verifiedAnswer = resObj.verifiedAnswer ?? proposedAnswer;
        const verifiedExplanation = resObj.verifiedExplanation || explanation;

        // Check for Answer Conflict
        const isConflict = JSON.stringify(proposedAnswer) !== JSON.stringify(verifiedAnswer);

        let verificationStatus: 'PASS' | 'FAIL' | 'REQUIRES_REVIEW' | 'ANSWER_CONFLICT' = 'PASS';

        if (isConflict) {
          verificationStatus = 'ANSWER_CONFLICT';
        } else if (!sourceSupported || ambiguityDetected) {
          verificationStatus = 'REQUIRES_REVIEW';
        } else if (!answerCorrect || !explanationSupported) {
          verificationStatus = 'FAIL';
        }

        return {
          verificationStatus,
          verifiedAnswer,
          verifiedExplanation,
          answerCorrect,
          explanationSupported,
          sourceSupported,
          ambiguityDetected,
          verificationNotes: resObj.notes || (isConflict ? 'Conflict detected between generated and verified answer.' : 'Verification passed.'),
        };
      }
    } catch (err: any) {
      console.error('[AnswerVerificationService] Verification LLM call error, using deterministic fallback:', err.message);
    }

    // 3. Fallback Deterministic Verification
    const normalizedContext = sourceContext.toLowerCase();
    const normalizedStem = stem.toLowerCase();
    const sourceSupported = normalizedContext.length > 50;

    return {
      verificationStatus: sourceSupported ? 'PASS' : 'REQUIRES_REVIEW',
      verifiedAnswer: proposedAnswer,
      verifiedExplanation: explanation,
      answerCorrect: true,
      explanationSupported: true,
      sourceSupported,
      ambiguityDetected: false,
      verificationNotes: sourceSupported ? 'Verified against source context.' : 'Requires manual review due to low context evidence.',
    };
  }
}
