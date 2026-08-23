import { ENV } from '../../../config/env';
import { performance } from 'perf_hooks';

export interface EmbeddingResult {
  embedding: number[];
  durationMs: number;
  /**
   * True when the configured provider failed and a deterministic hash-based placeholder vector
   * was substituted. Such a vector carries NO semantic meaning — it is only safe for code paths
   * that need *a* vector of the right shape (e.g. a cosine ranking that will be re-checked
   * elsewhere). Any correctness-sensitive consumer (duplicate detection above all) must treat
   * `degraded: true` as "no embedding available" rather than silently comparing noise.
   */
  degraded: boolean;
  /** Identifier of the model that produced the vector, or 'fallback-hash' when degraded. */
  model: string;
}

export interface IEmbeddingProvider {
  getEmbedding(text: string): Promise<number[]>;
}

export class EmbeddingProvider {
  /**
   * Generates a vector embedding for input query text using configured dimension.
   * Returns embedding array and high-resolution timing measurement in milliseconds.
   */
  public static async generateQueryEmbedding(text: string): Promise<EmbeddingResult> {
    const startTime = performance.now();
    const dimension = ENV.EMBEDDING_DIMENSION || 384;

    if (!text || text.trim().length === 0) {
      const durationMs = Math.round(performance.now() - startTime);
      return {
        embedding: new Array(dimension).fill(0),
        durationMs,
        degraded: true,
        model: 'empty-input',
      };
    }

    try {
      const provider = EmbeddingFactory.getProvider();
      const embedding = await provider.getEmbedding(text);
      const durationMs = Math.round(performance.now() - startTime);
      return {
        embedding,
        durationMs,
        degraded: false,
        model: EmbeddingProvider.activeModelId(),
      };
    } catch (err: any) {
      // Loud on purpose: a misconfigured or unreachable embedding provider used to fail
      // silently here, handing back a hash-based vector that looks valid (right length, unit
      // norm) but encodes nothing. Downstream that turns into meaningless similarity scores,
      // so the failure must be visible in logs AND flagged in the return value.
      console.error(
        `[EmbeddingProvider] Embedding generation FAILED via provider "${(process.env.EMBEDDING_PROVIDER || 'local').toLowerCase()}" ` +
          `(model "${EmbeddingProvider.activeModelId()}"): ${err?.message || err}. ` +
          `Returning a non-semantic placeholder vector — semantic comparisons must be skipped.`
      );
      const vector = this.generateDeterministicVector(text, dimension);
      const durationMs = Math.round(performance.now() - startTime);
      return {
        embedding: vector,
        durationMs,
        degraded: true,
        model: 'fallback-hash',
      };
    }
  }

  /** The model id the currently-configured provider will use, for logging and provenance. */
  public static activeModelId(): string {
    const provider = (process.env.EMBEDDING_PROVIDER || 'local').toLowerCase();
    if (provider === 'gemini') return process.env.EMBEDDING_MODEL || 'gemini-embedding-001';
    if (provider === 'openai') return process.env.EMBEDDING_MODEL || 'text-embedding-3-small';
    if (provider === 'ollama') return process.env.OLLAMA_EMBEDDING_MODEL || 'all-minilm';
    return 'local-prng';
  }

  /**
   * Embedding for persisting alongside a Question row, used for semantic duplicate detection
   * later (see questionSimilarityService.ts).
   *
   * Returns an EMPTY array when a real embedding could not be produced. Storing nothing is
   * strictly better than storing a placeholder: an empty embedding is already understood
   * downstream as "no vector available, fall back to lexical comparison", whereas a persisted
   * hash vector would silently poison every future duplicate check against that row.
   */
  public static async getEmbeddingOrEmpty(text: string): Promise<number[]> {
    const { embedding, degraded } = await this.generateQueryEmbedding(text);
    return degraded ? [] : embedding;
  }

  /**
   * Prisma-ready embedding fields for a Question write. Always persist BOTH together — an
   * embedding without its model tag cannot be safely compared later (see
   * questionSimilarityService.ts), so spread this whole object rather than setting
   * `embedding` alone.
   */
  public static async getEmbeddingFields(text: string): Promise<{ embedding: number[]; embeddingModel: string | null }> {
    const { embedding, degraded, model } = await this.generateQueryEmbedding(text);
    return degraded ? { embedding: [], embeddingModel: null } : { embedding, embeddingModel: model };
  }

  /**
   * Deterministic 384-dimensional vector embedding generator
   */
  private static generateDeterministicVector(text: string, dimension: number): number[] {
    const normalized = text.toLowerCase().trim();
    const vector = new Array(dimension).fill(0);

    let hash = 0;
    for (let i = 0; i < normalized.length; i++) {
      const char = normalized.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash |= 0;

      const index = Math.abs(hash) % dimension;
      vector[index] += (char % 10) / 10.0;
    }

    const norm = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
    if (norm > 0) {
      for (let i = 0; i < dimension; i++) {
        vector[i] = Math.round((vector[i] / norm) * 10000) / 10000;
      }
    }

    return vector;
  }
}

export class GeminiEmbeddingProvider implements IEmbeddingProvider {
  private apiKey: string;
  private model: string;
  private dimension: number;

  constructor() {
    this.apiKey = process.env.EMBEDDING_API_KEY || process.env.GEMINI_API_KEY || process.env.AI_API_KEY || '';
    // 'text-embedding-004' is not available on this project's API key (confirmed 404 via
    // live ListModels call); 'gemini-embedding-001' is the current model that supports
    // embedContent for this account.
    this.model = process.env.EMBEDDING_MODEL || 'gemini-embedding-001';
    this.dimension = ENV.EMBEDDING_DIMENSION || 384;
  }

  public async getEmbedding(text: string): Promise<number[]> {
    if (!this.apiKey) {
      throw new Error('EMBEDDING_PROVIDER_UNAVAILABLE: Gemini Embedding API key is not configured.');
    }

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:embedContent?key=${this.apiKey}`;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: {
          parts: [{ text }],
        },
        outputDimensionality: this.dimension,
      }),
    });

    if (!response.ok) {
      throw new Error(`Gemini Embedding API returned HTTP status ${response.status}`);
    }

    const data: any = await response.json();
    const embedding = data?.embedding?.values;
    if (embedding && Array.isArray(embedding)) {
      // gemini-embedding-001 produces Matryoshka-truncatable vectors; Google's guidance is to
      // re-normalize to unit length after truncating to a smaller outputDimensionality.
      const truncated = embedding.slice(0, this.dimension);
      const norm = Math.sqrt(truncated.reduce((sum: number, v: number) => sum + v * v, 0));
      return norm > 0 ? truncated.map((v: number) => v / norm) : truncated;
    }

    throw new Error('Invalid response structure from Gemini Embedding API');
  }
}

export class OpenAIEmbeddingProvider implements IEmbeddingProvider {
  private apiKey: string;
  private model: string;
  private dimension: number;

  constructor() {
    this.apiKey = process.env.EMBEDDING_API_KEY || process.env.OPENAI_API_KEY || '';
    this.model = process.env.EMBEDDING_MODEL || 'text-embedding-3-small';
    this.dimension = ENV.EMBEDDING_DIMENSION || 384;
  }

  public async getEmbedding(text: string): Promise<number[]> {
    if (!this.apiKey) {
      throw new Error('EMBEDDING_PROVIDER_UNAVAILABLE: OpenAI Embedding API key is not configured.');
    }

    const endpoint = 'https://api.openai.com/v1/embeddings';
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        input: text,
        model: this.model,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI Embedding API returned HTTP status ${response.status}`);
    }

    const data: any = await response.json();
    const embedding = data?.data?.[0]?.embedding;
    if (embedding && Array.isArray(embedding)) {
      return embedding.slice(0, this.dimension);
    }

    throw new Error('Invalid response structure from OpenAI Embedding API');
  }
}

export class LocalEmbeddingProvider implements IEmbeddingProvider {
  private dimension: number;

  constructor() {
    this.dimension = ENV.EMBEDDING_DIMENSION || 384;
  }

  public async getEmbedding(text: string): Promise<number[]> {
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      hash = text.charCodeAt(i) + ((hash << 5) - hash);
    }

    const result: number[] = [];
    let seed = Math.abs(hash) || 1;

    const a = 1664525;
    const c = 1013904223;
    const m = Math.pow(2, 32);

    for (let i = 0; i < this.dimension; i++) {
      seed = (a * seed + c) % m;
      result.push((seed / m) * 2 - 1);
    }

    let norm = 0;
    for (const val of result) {
      norm += val * val;
    }
    norm = Math.sqrt(norm);
    if (norm > 0) {
      for (let i = 0; i < this.dimension; i++) {
        result[i] = result[i] / norm;
      }
    }

    return result;
  }
}

export class OllamaEmbeddingProvider implements IEmbeddingProvider {
  private ollamaProvider: OllamaProvider;

  constructor() {
    this.ollamaProvider = new OllamaProvider();
  }

  public async getEmbedding(text: string): Promise<number[]> {
    return await this.ollamaProvider.generateEmbedding(text);
  }
}

import { OllamaProvider } from './ollamaProvider';

export class EmbeddingFactory {
  public static getProvider(): IEmbeddingProvider {
    const provider = (process.env.EMBEDDING_PROVIDER || 'local').toLowerCase();

    if (provider === 'ollama') {
      return new OllamaEmbeddingProvider();
    }
    if (provider === 'openai') {
      return new OpenAIEmbeddingProvider();
    }
    if (provider === 'gemini') {
      return new GeminiEmbeddingProvider();
    }
    return new LocalEmbeddingProvider();
  }
}
