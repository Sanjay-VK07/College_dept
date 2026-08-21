export interface LogContext {
  service?: string;
  operation?: string;
  userId?: string;
  requestId?: string;
  correlationId?: string;
  durationMs?: number;
  status?: string;
  errorCode?: string;
  [key: string]: any;
}

export class StructuredLogger {
  private static SENSITIVE_KEYS = [
    'password',
    'jwt',
    'jwt_secret',
    'secret',
    'token',
    'apikey',
    'api_key',
    'authorization',
    'systemprompt',
    'embedding',
    'embeddings',
    'private_key',
    'database_url',
  ];

  /**
   * Recursively redacts sensitive keys from log metadata payloads.
   */
  public static redact(data: any): any {
    if (!data || typeof data !== 'object') return data;
    if (Array.isArray(data)) {
      return data.map((item) => this.redact(item));
    }

    const cleaned: Record<string, any> = {};
    for (const [key, value] of Object.entries(data)) {
      const lowerKey = key.toLowerCase();
      if (this.SENSITIVE_KEYS.some((s) => lowerKey.includes(s))) {
        cleaned[key] = '[REDACTED]';
      } else if (typeof value === 'object' && value !== null) {
        cleaned[key] = this.redact(value);
      } else {
        cleaned[key] = value;
      }
    }
    return cleaned;
  }

  public static info(message: string, context: LogContext = {}) {
    const payload = {
      timestamp: new Date().toISOString(),
      level: 'INFO',
      message,
      ...this.redact(context),
    };
    console.log(JSON.stringify(payload));
  }

  public static warn(message: string, context: LogContext = {}) {
    const payload = {
      timestamp: new Date().toISOString(),
      level: 'WARN',
      message,
      ...this.redact(context),
    };
    console.warn(JSON.stringify(payload));
  }

  public static error(message: string, context: LogContext = {}) {
    const payload = {
      timestamp: new Date().toISOString(),
      level: 'ERROR',
      message,
      ...this.redact(context),
    };
    console.error(JSON.stringify(payload));
  }
}
