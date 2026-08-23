import { OllamaProvider } from '../services/ollamaProvider';

describe('OllamaStructuredOutput', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    process.env.OLLAMA_BASE_URL = 'http://localhost:11434';
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  it('3. should generate and parse valid structured JSON output correctly', async () => {
    const jsonOutput = JSON.stringify({
      verifiedCorrect: true,
      verificationConfidence: 0.96,
      explanation: 'Matrix multiplication dimensions verified.',
    });

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue({
        message: { content: `\`\`\`json\n${jsonOutput}\n\`\`\`` },
      }),
    } as any);

    const provider = new OllamaProvider();
    const result = await provider.generateStructuredResponse<{
      verifiedCorrect: boolean;
      verificationConfidence: number;
      explanation: string;
    }>('Verify solution', [], 'User prompt');

    expect(result.verifiedCorrect).toBe(true);
    expect(result.verificationConfidence).toBe(0.96);
    expect(result.explanation).toBe('Matrix multiplication dimensions verified.');
  });

  it('9. should reject invalid structured output and throw STRUCTURED_OUTPUT_VALIDATION_FAILED', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue({
        message: { content: 'Sorry, I am unable to output JSON formatting.' },
      }),
    } as any);

    const provider = new OllamaProvider();
    await expect(
      provider.generateStructuredResponse('System prompt', [], 'User prompt')
    ).rejects.toThrow('STRUCTURED_OUTPUT_VALIDATION_FAILED');
  });
});
