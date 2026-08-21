import { ENV } from '../../../config/env';
<<<<<<< HEAD
import { performance } from 'perf_hooks';

export interface EmbeddingResult {
  embedding: number[];
  durationMs: number;
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
      };
    }

    try {
      // Generate deterministic feature vector
      const vector = this.generateDeterministicVector(text, dimension);
      const durationMs = Math.round(performance.now() - startTime);

      return {
        embedding: vector,
        durationMs,
      };
    } catch (err: any) {
      console.error('[EmbeddingProvider Error]:', err.message || err);
      throw new Error(`Embedding generation failed: ${err.message}`);
    }
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
      hash |= 0; // Convert to 32bit integer

      const index = Math.abs(hash) % dimension;
      vector[index] += (char % 10) / 10.0;
    }

    // L2 Normalize vector
    const norm = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
    if (norm > 0) {
      for (let i = 0; i < dimension; i++) {
        vector[i] = Math.round((vector[i] / norm) * 10000) / 10000;
      }
    }

    return vector;
=======

export interface EmbeddingProvider {
  getEmbedding(text: string): Promise<number[]>;
}

export class GeminiEmbeddingProvider implements EmbeddingProvider {
  private apiKey: string;
  private model: string;
  private dimension: number;

  constructor() {
    this.apiKey = process.env.EMBEDDING_API_KEY || process.env.GEMINI_API_KEY || process.env.AI_API_KEY || '';
    this.model = process.env.EMBEDDING_MODEL || 'text-embedding-004';
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
      }),
    });

    if (!response.ok) {
      throw new Error(`Gemini Embedding API returned HTTP status ${response.status}`);
    }

    const data: any = await response.json();
    const embedding = data?.embedding?.values;
    if (embedding && Array.isArray(embedding)) {
      return embedding.slice(0, this.dimension);
    }

    throw new Error('Invalid response structure from Gemini Embedding API');
  }
}

export class OpenAIEmbeddingProvider implements EmbeddingProvider {
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

export class LocalEmbeddingProvider implements EmbeddingProvider {
  private dimension: number;

  constructor() {
    this.dimension = ENV.EMBEDDING_DIMENSION || 384;
  }

  public async getEmbedding(text: string): Promise<number[]> {
    // Generate a deterministic unit-length vector based on text content hash.
    // This is strictly for OFFLINE/DEVELOPMENT/TESTING mode.
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      hash = text.charCodeAt(i) + ((hash << 5) - hash);
    }

    const result: number[] = [];
    let seed = Math.abs(hash) || 1;

    // Linear Congruential Generator (LCG) to generate pseudo-random dimensions deterministically
    const a = 1664525;
    const c = 1013904223;
    const m = Math.pow(2, 32);

    for (let i = 0; i < this.dimension; i++) {
      seed = (a * seed + c) % m;
      result.push((seed / m) * 2 - 1); // Range: [-1, 1]
    }

    // Normalize vector to unit length
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

export class EmbeddingFactory {
  public static getProvider(): EmbeddingProvider {
    const provider = (process.env.EMBEDDING_PROVIDER || 'local').toLowerCase();

    if (provider === 'openai') {
      return new OpenAIEmbeddingProvider();
    }
    if (provider === 'gemini') {
      return new GeminiEmbeddingProvider();
    }
    return new LocalEmbeddingProvider();
>>>>>>> 3f760070b07f9bf338f83776cadbc80c79b61d54
  }
}
