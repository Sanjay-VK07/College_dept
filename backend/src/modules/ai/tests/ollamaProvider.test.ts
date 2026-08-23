import { OllamaProvider } from '../services/ollamaProvider';

describe('OllamaProvider', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    process.env.OLLAMA_BASE_URL = 'http://localhost:11434';
    process.env.OLLAMA_CHAT_MODEL = 'llama3.2';
    process.env.OLLAMA_EMBEDDING_MODEL = 'all-minilm';
    process.env.OLLAMA_REQUEST_TIMEOUT_MS = '30000';
    process.env.OLLAMA_MAX_RETRIES = '3';
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  it('1. should verify Ollama local server reachability via healthCheck', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue({
        models: [{ name: 'llama3.2:latest' }, { name: 'all-minilm:latest' }],
      }),
    } as any);

    const provider = new OllamaProvider();
    const health = await provider.healthCheck();

    expect(health.ok).toBe(true);
    expect(health.serverReachable).toBe(true);
    expect(health.chatModelAvailable).toBe(true);
    expect(health.embeddingModelAvailable).toBe(true);
  });

  it('2. should complete a successful chat generation request via /api/chat', async () => {
    const mockResponse = {
      model: 'llama3.2',
      message: {
        role: 'assistant',
        content: 'Data structures in GATE Computer Science include Arrays, Linked Lists, Trees, and Graphs.',
      },
      prompt_eval_count: 24,
      eval_count: 32,
    };

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue(mockResponse),
    } as any);

    const provider = new OllamaProvider();
    const result = await provider.generateResponse('You are a GATE tutor.', [], 'List core CS data structures.');

    expect(result.success).toBe(true);
    expect(result.type).toBe('SUCCESS');
    expect(result.content).toContain('Data structures in GATE');
  });

  it('6. should handle request timeouts gracefully without crashing', async () => {
    process.env.OLLAMA_REQUEST_TIMEOUT_MS = '50';
    process.env.OLLAMA_MAX_RETRIES = '0';

    global.fetch = jest.fn().mockImplementation((_url, options) => {
      return new Promise((_, reject) => {
        const signal = options?.signal;
        if (signal) {
          signal.addEventListener('abort', () => {
            const err: any = new Error('The operation was aborted');
            err.name = 'AbortError';
            reject(err);
          });
        }
      });
    });

    const provider = new OllamaProvider();
    const result = await provider.generateResponse('System prompt', [], 'Test timeout');

    expect(result.success).toBe(false);
    expect(result.type).toBe('AI_PROVIDER_TIMEOUT');
  });

  it('7. should handle Ollama server unavailable / connection failure cleanly', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('fetch failed (ECONNREFUSED)'));

    process.env.OLLAMA_MAX_RETRIES = '0';

    const provider = new OllamaProvider();
    const result = await provider.generateResponse('System prompt', [], 'Test server down');

    expect(result.success).toBe(false);
    expect(result.type).toBe('AI_PROVIDER_UNAVAILABLE');
  });

  it('8. should detect missing model (HTTP 404) and prompt for ollama pull', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 404,
      text: jest.fn().mockResolvedValue("model 'nonexistent-model' not found"),
    } as any);

    const provider = new OllamaProvider();
    const result = await provider.generateResponse('System prompt', [], 'Test missing model');

    expect(result.success).toBe(false);
    expect(result.type).toBe('AI_PROVIDER_UNAVAILABLE');
    expect(result.message).toContain('not installed locally');
  });
});
