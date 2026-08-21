import { StructuredLogger } from '../utils/structuredLogger';

describe('Phase 8 Secret Management & Redaction Audit Tests', () => {
  it('should redact sensitive keys from log output context payloads', () => {
    const rawPayload = {
      userId: 'user_123',
      apiKey: 'sk-proj-secret-key-12345',
      password: 'SuperSecretPassword',
      systemPrompt: 'Internal system prompt details',
      normalField: 'Public Metadata',
    };

    const redacted = StructuredLogger.redact(rawPayload);

    expect(redacted.userId).toBe('user_123');
    expect(redacted.normalField).toBe('Public Metadata');
    expect(redacted.apiKey).toBe('[REDACTED]');
    expect(redacted.password).toBe('[REDACTED]');
    expect(redacted.systemPrompt).toBe('[REDACTED]');
  });
});
