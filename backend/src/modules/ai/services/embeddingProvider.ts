import { ENV } from '../../../config/env';
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
  }
}
