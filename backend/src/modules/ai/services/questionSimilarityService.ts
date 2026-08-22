import { prisma } from '../../../config/prisma';
import { AIQuestionSimilarityStatus } from '@prisma/client';
import { QuestionSimilarityResult } from '../types/questionGenerationTypes';
import { EmbeddingProvider } from './embeddingProvider';

export class QuestionSimilarityService {
  /**
   * Checks a generated question stem against existing Question Bank records for exact
   * duplicates and near-duplicates. Near-duplicate detection is semantic (cosine similarity
   * over real embeddings) when embeddings are available for a candidate, which catches
   * paraphrased/reworded duplicates that lexical word-overlap misses entirely (e.g. "Find the
   * time complexity of binary search" vs "What is the time complexity of the binary search
   * algorithm?" share almost no exact words but are the same question). Falls back to lexical
   * Jaccard overlap only for candidates that predate embedding backfill (embedding is empty).
   */
  public static async checkSimilarity(stem: string, subtopicId?: string): Promise<QuestionSimilarityResult> {
    if (!stem || stem.trim().length === 0) {
      return { status: AIQuestionSimilarityStatus.UNIQUE, similarityScore: 0.0 };
    }

    const normalizedNewStem = this.normalizeText(stem);

    const candidateQuestions = await prisma.question.findMany({
      where: subtopicId ? { subtopicId } : undefined,
      select: { id: true, text: true, embedding: true },
      take: 200,
    });

    // 1. Exact / normalized-text match — cheapest and unambiguous, checked first.
    for (const existingQ of candidateQuestions) {
      if (normalizedNewStem === this.normalizeText(existingQ.text)) {
        return {
          status: AIQuestionSimilarityStatus.DUPLICATE,
          similarityScore: 1.0,
          similarQuestionId: existingQ.id,
        };
      }
    }

    // 2. Semantic near-duplicate check via embeddings, where available.
    let queryEmbedding: number[] | null = null;
    try {
      const { embedding } = await EmbeddingProvider.generateQueryEmbedding(stem);
      queryEmbedding = embedding;
    } catch {
      queryEmbedding = null;
    }

    let bestSemantic: { score: number; id: string } | null = null;
    let bestLexical: { score: number; id: string } | null = null;

    for (const existingQ of candidateQuestions) {
      if (queryEmbedding && Array.isArray(existingQ.embedding) && existingQ.embedding.length === queryEmbedding.length) {
        const score = this.cosineSimilarity(queryEmbedding, existingQ.embedding);
        if (!bestSemantic || score > bestSemantic.score) {
          bestSemantic = { score, id: existingQ.id };
        }
      } else {
        // No usable embedding for this candidate — fall back to lexical overlap for it only.
        const score = this.calculateJaccardSimilarity(normalizedNewStem, this.normalizeText(existingQ.text));
        if (!bestLexical || score > bestLexical.score) {
          bestLexical = { score, id: existingQ.id };
        }
      }
    }

    if (bestSemantic) {
      if (bestSemantic.score >= 0.92) {
        return { status: AIQuestionSimilarityStatus.DUPLICATE, similarityScore: bestSemantic.score, similarQuestionId: bestSemantic.id };
      }
      if (bestSemantic.score >= 0.80) {
        return { status: AIQuestionSimilarityStatus.SIMILAR, similarityScore: bestSemantic.score, similarQuestionId: bestSemantic.id };
      }
    }

    if (bestLexical) {
      if (bestLexical.score >= 0.85) {
        return { status: AIQuestionSimilarityStatus.DUPLICATE, similarityScore: bestLexical.score, similarQuestionId: bestLexical.id };
      }
      if (bestLexical.score >= 0.65) {
        return { status: AIQuestionSimilarityStatus.SIMILAR, similarityScore: bestLexical.score, similarQuestionId: bestLexical.id };
      }
    }

    return {
      status: AIQuestionSimilarityStatus.UNIQUE,
      similarityScore: Math.max(bestSemantic?.score ?? 0, bestLexical?.score ?? 0),
    };
  }

  private static cosineSimilarity(vecA: number[], vecB: number[]): number {
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < vecA.length; i++) {
      dot += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }
    if (normA === 0 || normB === 0) return 0;
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  private static normalizeText(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private static calculateJaccardSimilarity(str1: string, str2: string): number {
    const set1 = new Set(str1.split(' '));
    const set2 = new Set(str2.split(' '));

    if (set1.size === 0 || set2.size === 0) return 0;

    let intersectionCount = 0;
    for (const word of set1) {
      if (set2.has(word)) {
        intersectionCount++;
      }
    }

    const unionCount = new Set([...set1, ...set2]).size;
    return intersectionCount / unionCount;
  }
}
