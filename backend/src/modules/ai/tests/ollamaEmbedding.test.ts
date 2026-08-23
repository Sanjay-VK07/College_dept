import { OllamaProvider } from '../services/ollamaProvider';
import { OllamaEmbeddingProvider } from '../services/embeddingProvider';

describe('OllamaEmbedding', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    process.env.OLLAMA_BASE_URL = 'http://localhost:11434';
    process.env.OLLAMA_EMBEDDING_MODEL = 'all-minilm';
    process.env.EMBEDDING_DIMENSION = '384';
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  it('4. should generate exact 384-dimensional embedding vectors matching pgvector dimension', async () => {
    const mockVector384 = new Array(384).fill(0.025);
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue({
        embedding: mockVector384,
      }),
    } as any);

    const embeddingProvider = new OllamaEmbeddingProvider();
    const vector = await embeddingProvider.getEmbedding('GATE Operating Systems process synchronization question');

    expect(vector.length).toBe(384);
    expect(vector[0]).toBe(0.025);
  });

  it('5. should reject incompatible vector lengths and throw EMBEDDING_DIMENSION_MISMATCH', async () => {
    // Model returns 768 dimensions when pgvector column expects 384
    const mockVector768 = new Array(768).fill(0.01);
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue({
        embedding: mockVector768,
      }),
    } as any);

    const provider = new OllamaProvider();
    await expect(provider.generateEmbedding('Mismatch vector test query')).rejects.toThrow(
      'EMBEDDING_DIMENSION_MISMATCH'
    );
  });
});
