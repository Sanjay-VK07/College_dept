import { prisma } from '../../../config/prisma';
import { Role } from '@prisma/client';
import { DocumentAuthorizationService } from './documentAuthorizationService';
import { performance } from 'perf_hooks';
import { RetrievedChunk } from './ragEvaluationService';
import { VectorCache, CachedVectorChunk } from './vectorCache';

export interface VectorSearchResult {
  chunks: RetrievedChunk[];
  authorizedChunksFound: number;
  durationMs: number;
}

export class VectorSearchService {
  /**
   * Searches AIDocumentChunks using Cosine Similarity while strictly enforcing
   * user visibility authorization rules at the database query level with scope-aware in-memory caching.
   */
  public static async searchAuthorizedChunks(params: {
    queryEmbedding: number[];
    userId: string;
    role: Role;
    topK?: number;
  }): Promise<VectorSearchResult> {
    const { queryEmbedding, userId, role, topK = 5 } = params;
    const startTime = performance.now();

    // 1. Scope Key reflecting strict user authorization boundary
    const scopeKey = `role:${role}:user:${userId}`;

    // 2. Fetch scope-authorized vector embeddings via VectorCache
    const visibilityFilter = DocumentAuthorizationService.getVisibilityFilter(userId, role);
    const { chunks: candidateChunks } = await VectorCache.getChunks(scopeKey, async () => {
      const dbRows = await prisma.aIDocumentChunk.findMany({
        where: {
          document: {
            status: 'READY' as any,
            ...visibilityFilter,
          },
        },
        select: {
          id: true,
          documentId: true,
          embedding: true,
          document: {
            select: {
              id: true,
              title: true,
              visibility: true,
              uploadedById: true,
              status: true,
            },
          },
        },
      });

      return dbRows.map((c) => ({
        id: c.id,
        documentId: c.documentId,
        embedding: c.embedding,
        title: c.document.title,
        visibility: c.document.visibility as string,
        uploadedById: c.document.uploadedById as string,
        status: c.document.status as string,
      }));
    });

    const authorizedChunksFound = candidateChunks.length;

    if (authorizedChunksFound === 0) {
      const durationMs = Math.round(performance.now() - startTime);
      return {
        chunks: [],
        authorizedChunksFound: 0,
        durationMs,
      };
    }

    // 3. Compute in-memory cosine similarity ranking over candidate pool (<1ms)
    const rankStart = performance.now();
    const rankedCandidates = candidateChunks
      .map((chunk: CachedVectorChunk) => ({
        chunk,
        similarityScore: this.cosineSimilarity(queryEmbedding, chunk.embedding),
      }))
      .sort((a: { similarityScore: number }, b: { similarityScore: number }) => b.similarityScore - a.similarityScore)
      .slice(0, topK);

    const rankDurationMs = (performance.now() - rankStart).toFixed(2);
    console.log(`[VectorSearchService] In-memory ranking completed over ${candidateChunks.length} candidates in ${rankDurationMs}ms.`);

    // 4. Two-Pass Content Retrieval: Fetch text content ONLY for the top-K matched chunk IDs
    const topChunkIds = rankedCandidates.map((r: { chunk: CachedVectorChunk }) => r.chunk.id);
    const contentRows = await prisma.aIDocumentChunk.findMany({
      where: { id: { in: topChunkIds } },
      select: { id: true, content: true },
    });

    const contentMap = new Map<string, string>();
    contentRows.forEach((row: { id: string; content: string }) => contentMap.set(row.id, row.content));

    const finalChunks: RetrievedChunk[] = rankedCandidates.map((r: { chunk: CachedVectorChunk; similarityScore: number }) => ({
      chunkId: r.chunk.id,
      documentId: r.chunk.documentId,
      documentTitle: r.chunk.title,
      content: contentMap.get(r.chunk.id) || '',
      similarityScore: r.similarityScore,
    }));

    const durationMs = Math.round(performance.now() - startTime);

    return {
      chunks: finalChunks,
      authorizedChunksFound,
      durationMs,
    };
  }

  /**
   * Calculates Cosine Similarity between two numerical vector arrays
   */
  private static cosineSimilarity(vecA: number[], vecB: number[]): number {
    if (!vecA || !vecB || vecA.length === 0 || vecB.length === 0) return 0;

    const minLen = Math.min(vecA.length, vecB.length);
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < minLen; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }

    if (normA === 0 || normB === 0) return 0;
    const similarity = dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
    return Math.round(Math.max(0, Math.min(1, similarity)) * 10000) / 10000;
  }
}
