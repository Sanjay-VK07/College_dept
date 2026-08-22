import { QuestionType } from '@prisma/client';
import { AIProviderService } from './aiProviderService';
import { MathVerificationService } from './mathVerificationService';

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
${type === QuestionType.NAT ? `5. If this is a numerical/calculation question, show the exact arithmetic expression that derives your independently-verified numeric answer (e.g. "7 * 12 - 3"), so it can be checked deterministically. Use only numbers and standard operators (+ - * / ^ sqrt() etc) — no words.` : ''}

Return ONLY valid JSON matching this structure:
{
  "answerCorrect": true|false,
  "verifiedAnswer": <independently derived answer matching type format>,
  "verifiedExplanation": "<independent explanation>",
  "explanationSupported": true|false,
  "sourceSupported": true|false,
  "ambiguityDetected": true|false,
  "notes": "<brief notes>"${type === QuestionType.NAT ? ',\n  "computation": "<arithmetic expression that evaluates to verifiedAnswer, or null if not applicable>"' : ''}
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
        let notes = resObj.notes || (isConflict ? 'Conflict detected between generated and verified answer.' : 'Verification passed.');

        if (isConflict) {
          verificationStatus = 'ANSWER_CONFLICT';
        } else if (!sourceSupported || ambiguityDetected) {
          verificationStatus = 'REQUIRES_REVIEW';
        } else if (!answerCorrect || !explanationSupported) {
          verificationStatus = 'FAIL';
        }

        // Deterministic cross-check: does the verifier's OWN shown arithmetic actually evaluate
        // to the answer it reported? This catches internal inconsistency in the LLM's reasoning
        // that a second LLM opinion agreeing with the first cannot catch, since both are still
        // just LLM judgment. Only downgrades a status that was otherwise heading to PASS.
        if (type === QuestionType.NAT && verificationStatus === 'PASS') {
          const statedValue = typeof verifiedAnswer === 'object' && verifiedAnswer !== null
            ? Number(verifiedAnswer.value)
            : Number(verifiedAnswer);
          const mathCheck = MathVerificationService.verify(resObj.computation, statedValue);

          if (mathCheck.applicable && mathCheck.matchesStatedAnswer === false) {
            verificationStatus = 'FAIL';
            notes = `Deterministic math check failed: ${mathCheck.notes}`;
          } else if (mathCheck.applicable) {
            notes = `${notes} Deterministic check confirmed: ${mathCheck.notes}`;
          }
        }

        return {
          verificationStatus,
          verifiedAnswer,
          verifiedExplanation,
          answerCorrect,
          explanationSupported,
          sourceSupported,
          ambiguityDetected,
          verificationNotes: notes,
        };
      }
    } catch (err: any) {
      console.error('[AnswerVerificationService] Verification LLM call failed — could not independently verify this answer:', err.message);
    }

    // 3. The independent verifier could not run (network/parse/provider error). This is NOT a
    // pass: we have zero independent evidence the answer is correct, and per the "never guess"
    // rule, an unavailable check must never be treated as a confirmed check. Hold for manual
    // review rather than rubber-stamping — this is the only safe default when verification
    // itself failed, as distinct from verification having actually run and found the answer
    // correct.
    return {
      verificationStatus: 'REQUIRES_REVIEW',
      verifiedAnswer: proposedAnswer,
      verifiedExplanation: explanation,
      answerCorrect: false,
      explanationSupported: false,
      sourceSupported: false,
      ambiguityDetected: true,
      verificationNotes: 'Independent verification could not be completed (verifier call failed) — held for manual review rather than auto-approved.',
    };
  }
}
