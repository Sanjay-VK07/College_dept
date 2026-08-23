import { OllamaProvider } from '../services/ollamaProvider';

describe('OllamaSecurity', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    process.env.AI_PROVIDER = 'ollama';
    process.env.EMBEDDING_PROVIDER = 'ollama';
    process.env.OLLAMA_BASE_URL = 'http://localhost:11434';
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  it('10. should maintain local model governance without leaking external API secrets', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue({
        message: { content: 'Local Ollama answer.' },
      }),
    } as any);

    const provider = new OllamaProvider();
    const result = await provider.generateResponse('System prompt', [], 'User prompt');

    const resultString = JSON.stringify(result);
    expect(resultString).not.toContain('API_KEY');
    expect(resultString).not.toContain('HF_TOKEN');
  });

  it('11. should preserve provider failure handling without persisting fake assistant content', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: jest.fn().mockResolvedValue('Internal Model Server Error'),
    } as any);

    process.env.OLLAMA_MAX_RETRIES = '0';

    const provider = new OllamaProvider();
    const result = await provider.generateResponse('System prompt', [], 'User prompt');

    expect(result.success).toBe(false);
    expect(result.type).toBe('AI_PROVIDER_UNAVAILABLE');
    expect(result.content).toBeUndefined();
  });
});
