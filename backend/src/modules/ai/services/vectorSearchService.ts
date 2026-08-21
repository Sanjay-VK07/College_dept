import { prisma } from '../../../config/prisma';
import { Role } from '@prisma/client';
import { DocumentAuthorizationService } from './documentAuthorizationService';
import { performance } from 'perf_hooks';
import { RetrievedChunk } from './ragEvaluationService';

export interface VectorSearchResult {
  chunks: RetrievedChunk[];
  authorizedChunksFound: number;
  durationMs: number;
}

export class VectorSearchService {
  /**
   * Searches AIDocumentChunks using Cosine Similarity while strictly enforcing
   * user visibility authorization rules at the database query level.
   */
  public static async searchAuthorizedChunks(params: {
    queryEmbedding: number[];
    userId: string;
    role: Role;
    topK?: number;
  }): Promise<VectorSearchResult> {
    const { queryEmbedding, userId, role, topK = 5 } = params;
    const startTime = performance.now();

    // 1. Get strict visibility Prisma filter for authenticated user
    const visibilityFilter = DocumentAuthorizationService.getVisibilityFilter(userId, role);

    // 2. Fetch authorized chunks from database
    const chunks = await prisma.aIDocumentChunk.findMany({
      where: {
        document: {
          status: 'READY' as any,
          ...visibilityFilter,
        },
      },
      include: {
        document: {
          select: {
            id: true,
            title: true,
            visibility: true,
            uploadedById: true,
          },
        },
      },
      take: 50, // Candidate pool for cosine similarity ranking
    });

    const authorizedChunksFound = chunks.length;

    if (authorizedChunksFound === 0) {
      const durationMs = Math.round(performance.now() - startTime);
      return {
        chunks: [],
        authorizedChunksFound: 0,
        durationMs,
      };
    }

    // 3. Compute cosine similarity for each chunk
    const rankedChunks: RetrievedChunk[] = chunks
      .map((chunk) => {
        const score = this.cosineSimilarity(queryEmbedding, chunk.embedding);
        return {
          chunkId: chunk.id,
          documentId: chunk.documentId,
          documentTitle: chunk.document.title,
          content: chunk.content,
          similarityScore: score,
        };
      })
      .sort((a, b) => b.similarityScore - a.similarityScore)
      .slice(0, topK);

    const durationMs = Math.round(performance.now() - startTime);

    return {
      chunks: rankedChunks,
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
