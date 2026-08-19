import { ENV } from '../../../config/env';

export class AIResponseValidator {
  private static readonly MAX_RESPONSE_LENGTH = 8000;

  /**
   * Validates and sanitizes AI provider responses
   */
  public static validate(rawContent: string | null | undefined): string {
    if (!rawContent || typeof rawContent !== 'string') {
      return 'The AI Assistant is unable to generate a response. Please try rephrasing your question.';
    }

    let cleaned = rawContent.trim();

    if (cleaned.length === 0) {
      return 'The AI Assistant received an empty response. Please rephrase your query.';
    }

    // Secret Sanitization (Prevent accidental leakage of environment secrets or database URIs)
    const secretsToSanitize = [
      ENV.JWT_SECRET,
      ENV.DATABASE_URL,
      ENV.DIRECT_URL,
      process.env.AI_API_KEY,
    ].filter((s): s is string => Boolean(s && s.length > 5));

    secretsToSanitize.forEach((secret) => {
      cleaned = cleaned.replaceAll(secret, '[REDACTED]');
    });

    if (cleaned.length > this.MAX_RESPONSE_LENGTH) {
      cleaned = cleaned.substring(0, this.MAX_RESPONSE_LENGTH) + '\n\n[Response truncated due to length limits]';
    }

    return cleaned;
  }

  /**
   * Formats safe error response when provider fails or is unavailable
   */
  public static formatFallbackError(error: any): string {
    console.error('[AI Provider Error]:', error?.message || error);
    return 'The AI service is currently unavailable. Please try again later.';
  }
}
