import { performance } from 'perf_hooks';

export interface CachedVectorChunk {
  id: string;
  documentId: string;
  embedding: number[];
  title: string;
  visibility: string;
  uploadedById: string;
  status: string;
}

interface CacheEntry {
  chunks: CachedVectorChunk[];
  timestamp: number;
}

export class VectorCache {
  private static cache = new Map<string, CacheEntry>();
  private static readonly TTL_MS = 5 * 60 * 1000; // 5 minute TTL fallback
  private static readonly MAX_ENTRIES = 500; // Hard memory safety limit

  /**
   * Evicts expired or oldest entries if cache exceeds maximum allowed bounds.
   */
  private static enforceMemoryBounds(): void {
    const now = Date.now();
    // 1. Purge expired entries
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp >= this.TTL_MS) {
        this.cache.delete(key);
      }
    }
    // 2. FIFO eviction if still over MAX_ENTRIES limit
    while (this.cache.size >= this.MAX_ENTRIES) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        this.cache.delete(oldestKey);
      } else {
        break;
      }
    }
  }

  /**
   * Retrieves scope-authorized vector chunks from memory cache if valid,
   * or fetches from database and populates cache on miss.
   */
  public static async getChunks(
    scopeKey: string,
    fetchFn: () => Promise<CachedVectorChunk[]>
  ): Promise<{ chunks: CachedVectorChunk[]; hit: boolean; durationMs: number }> {
    const now = Date.now();
    const entry = this.cache.get(scopeKey);

    if (entry && now - entry.timestamp < this.TTL_MS) {
      console.log(`[VectorCache] HIT key="${scopeKey}" entries=${entry.chunks.length}`);
      return {
        chunks: entry.chunks,
        hit: true,
        durationMs: 0.5,
      };
    }

    console.log(`[VectorCache] MISS key="${scopeKey}". Fetching vector embeddings from database...`);
    const startMs = performance.now();
    const chunks = await fetchFn();
    const loadDurationMs = Math.round(performance.now() - startMs);

    this.enforceMemoryBounds();
    this.cache.set(scopeKey, {
      chunks,
      timestamp: now,
    });

    console.log(`[VectorCache] LOAD COMPLETED key="${scopeKey}" entries=${chunks.length} in ${loadDurationMs}ms`);
    return {
      chunks,
      hit: false,
      durationMs: loadDurationMs,
    };
  }

  /**
   * Explicitly invalidates vector cache when document uploads, deletions, or status changes occur.
   */
  public static invalidate(reason: string = 'DOCUMENT_MUTATED'): void {
    const count = this.cache.size;
    this.cache.clear();
    console.log(`[VectorCache] INVALIDATED all ${count} scope entries. Reason: ${reason}`);
  }

  /**
   * Cache telemetry stats
   */
  public static getStats() {
    return {
      size: this.cache.size,
      maxEntries: this.MAX_ENTRIES,
      ttlMs: this.TTL_MS,
    };
  }
}
