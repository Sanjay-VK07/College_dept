export interface SafetyCheckResult {
  safe: boolean;
  violationReason?: string;
  flaggedKeywords?: string[];
}

export class AIGovernanceService {
  private static BLOCKED_PATTERNS = [
    /ignore previous instructions/i,
    /bypass system prompt/i,
    /jailbreak mode/i,
    /drop table/i,
    /delete from users/i,
    /<script>.*<\/script>/i,
  ];

  /**
   * Evaluates input prompt against governance & safety rules.
   */
  public static inspectInputSafety(input: string): SafetyCheckResult {
    if (!input || input.trim().length === 0) {
      return { safe: true };
    }

    const flaggedKeywords: string[] = [];

    for (const pattern of this.BLOCKED_PATTERNS) {
      if (pattern.test(input)) {
        flaggedKeywords.push(pattern.source);
      }
    }

    if (flaggedKeywords.length > 0) {
      return {
        safe: false,
        violationReason: 'Input contains prohibited prompt injection or unsafe commands.',
        flaggedKeywords,
      };
    }

    return { safe: true };
  }

  /**
   * Sanitizes output text for governance compliance.
   */
  public static sanitizeOutput(output: string): string {
    if (!output) return '';
    // Strip any raw html script tags or unexpected script injections
    return output.replace(/<script\b[^<]*>([\s\S]*?)<\/script>/gi, '[REDACTED_SCRIPT]');
  }
}
