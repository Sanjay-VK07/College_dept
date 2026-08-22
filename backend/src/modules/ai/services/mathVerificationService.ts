import { evaluate } from 'mathjs';

export interface MathVerificationResult {
  applicable: boolean;
  computedValue: number | null;
  matchesStatedAnswer: boolean | null;
  notes: string;
}

/**
 * Deterministic (non-LLM) numerical cross-check for NAT/calculation-heavy answers. mathjs's
 * `evaluate` is a safe expression evaluator (no filesystem/process access, unlike a raw eval()) —
 * it computes the numeric result of an arithmetic expression and compares it against the stated
 * answer with a small tolerance. This catches the AI verifier being internally inconsistent
 * (its own shown computation disagrees with the answer it reported), which a second LLM
 * comparison alone cannot catch, since both are still just LLM opinions agreeing with each other.
 */
export class MathVerificationService {
  private static RELATIVE_TOLERANCE = 0.01; // 1%
  private static MIN_ABSOLUTE_TOLERANCE = 0.01;

  public static verify(computationExpression: string | undefined | null, statedAnswer: number): MathVerificationResult {
    if (!computationExpression || typeof computationExpression !== 'string' || !computationExpression.trim()) {
      return {
        applicable: false,
        computedValue: null,
        matchesStatedAnswer: null,
        notes: 'No explicit computation expression was provided — deterministic check skipped (not every NAT question reduces to a simple expression).',
      };
    }

    if (typeof statedAnswer !== 'number' || !isFinite(statedAnswer)) {
      return {
        applicable: false,
        computedValue: null,
        matchesStatedAnswer: null,
        notes: 'Stated answer is not a finite number — deterministic check skipped.',
      };
    }

    try {
      const result = evaluate(computationExpression);
      if (typeof result !== 'number' || !isFinite(result)) {
        return {
          applicable: false,
          computedValue: null,
          matchesStatedAnswer: null,
          notes: `Computation expression "${computationExpression}" did not evaluate to a finite number.`,
        };
      }

      const tolerance = Math.max(this.MIN_ABSOLUTE_TOLERANCE, Math.abs(statedAnswer) * this.RELATIVE_TOLERANCE);
      const matches = Math.abs(result - statedAnswer) <= tolerance;

      return {
        applicable: true,
        computedValue: result,
        matchesStatedAnswer: matches,
        notes: matches
          ? `Deterministically evaluated "${computationExpression}" = ${result}, matches stated answer ${statedAnswer}.`
          : `Deterministic mismatch: "${computationExpression}" evaluates to ${result}, but the stated answer is ${statedAnswer}.`,
      };
    } catch (err: any) {
      return {
        applicable: false,
        computedValue: null,
        matchesStatedAnswer: null,
        notes: `Computation expression "${computationExpression}" could not be evaluated: ${err.message}`,
      };
    }
  }
}
