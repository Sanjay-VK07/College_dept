import { ENV } from '../../../config/env';

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
  }
}
