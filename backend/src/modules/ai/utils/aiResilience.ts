import { ENV } from '../../../config/env';

export interface ResilienceOptions {
  timeoutMs?: number;
  maxRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  operationName?: string;
}

export class AIResilienceError extends Error {
  public code: 'AI_PROVIDER_TIMEOUT' | 'AI_PROVIDER_UNAVAILABLE' | 'NON_RETRYABLE_ERROR';
  public status?: number;

  constructor(message: string, code: 'AI_PROVIDER_TIMEOUT' | 'AI_PROVIDER_UNAVAILABLE' | 'NON_RETRYABLE_ERROR', status?: number) {
    super(message);
    this.name = 'AIResilienceError';
    this.code = code;
    this.status = status;
  }
}

export class AIResilience {
  /**
   * Classifies whether an error is retryable (429, 5xx, timeout, network error).
   */
  public static isRetryableError(error: any): boolean {
    if (!error) return false;
    if (error.name === 'AbortError' || error.code === 'AI_PROVIDER_TIMEOUT') return true;

    const message = (error.message || '').toLowerCase();
    if (message.includes('fetch failed') || message.includes('network') || message.includes('econnreset') || message.includes('etimedout')) {
      return true;
    }

    const status = error.status || error.statusCode;
    if (status === 429 || (status >= 500 && status <= 599)) {
      return true;
    }

    return false;
  }

  /**
   * Executes an async operation with AbortController timeout and exponential backoff jitter retries.
   */
  public static async executeWithResilience<T>(
    fn: (signal: AbortSignal) => Promise<T>,
    options: ResilienceOptions = {}
  ): Promise<T> {
    const timeoutMs = options.timeoutMs || ENV.AI_PROVIDER_TIMEOUT_MS;
    const maxRetries = options.maxRetries ?? ENV.AI_MAX_RETRIES;
    const initialDelayMs = options.initialDelayMs || ENV.AI_INITIAL_RETRY_DELAY_MS;
    const maxDelayMs = options.maxDelayMs || ENV.AI_MAX_RETRY_DELAY_MS;
    const opName = options.operationName || 'AI_OPERATION';

    let lastError: any = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const result = await fn(controller.signal);
        clearTimeout(timer);
        return result;
      } catch (err: any) {
        clearTimeout(timer);
        lastError = err;

        const isTimeout = err.name === 'AbortError' || (err.message && err.message.includes('aborted'));
        const normalizedErr = isTimeout
          ? new AIResilienceError(`AI_PROVIDER_TIMEOUT: Operation timed out after ${timeoutMs}ms`, 'AI_PROVIDER_TIMEOUT', 504)
          : err;

        if (isTimeout) {
          console.error(`[AI ERROR] Stage: ${opName}, Error type: timeout, Configured timeout: ${timeoutMs}ms, Elapsed: ${timeoutMs}ms`);
          throw normalizedErr;
        }

        if (attempt >= maxRetries || !this.isRetryableError(normalizedErr)) {
          throw normalizedErr;
        }

        // Exponential backoff with jitter
        const backoff = Math.min(maxDelayMs, initialDelayMs * Math.pow(2, attempt));
        const jitter = Math.random() * 0.3 * backoff;
        const delay = Math.round(backoff + jitter);

        console.warn(`[AIResilience] ${opName} attempt ${attempt + 1}/${maxRetries + 1} failed (${err.message}). Retrying in ${delay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    throw lastError || new AIResilienceError('AI provider unavailable after maximum retries.', 'AI_PROVIDER_UNAVAILABLE', 503);
  }
}
