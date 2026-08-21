import { prisma } from '../../../config/prisma';
import { AIQuestionSimilarityStatus } from '@prisma/client';
import { QuestionSimilarityResult } from '../types/questionGenerationTypes';

export class QuestionSimilarityService {
  /**
   * Checks a generated question stem against existing Question Bank records in PostgreSQL
   * for exact duplicates, normalized text matches, or high word-overlap similarity.
   */
  public static async checkSimilarity(stem: string, subtopicId?: string): Promise<QuestionSimilarityResult> {
    if (!stem || stem.trim().length === 0) {
      return { status: AIQuestionSimilarityStatus.UNIQUE, similarityScore: 0.0 };
    }

    const normalizedNewStem = this.normalizeText(stem);

    // 1. Check exact or normalized match in live Question Bank
    const candidateQuestions = await prisma.question.findMany({
      where: subtopicId ? { subtopicId } : undefined,
      select: { id: true, text: true },
      take: 200,
    });

    for (const existingQ of candidateQuestions) {
      const normalizedExisting = this.normalizeText(existingQ.text);

      if (normalizedNewStem === normalizedExisting) {
        return {
          status: AIQuestionSimilarityStatus.DUPLICATE,
          similarityScore: 1.0,
          similarQuestionId: existingQ.id,
        };
      }

      // Jaccard similarity threshold check
      const score = this.calculateJaccardSimilarity(normalizedNewStem, normalizedExisting);
      if (score >= 0.85) {
        return {
          status: AIQuestionSimilarityStatus.DUPLICATE,
          similarityScore: score,
          similarQuestionId: existingQ.id,
        };
      } else if (score >= 0.65) {
        return {
          status: AIQuestionSimilarityStatus.SIMILAR,
          similarityScore: score,
          similarQuestionId: existingQ.id,
        };
      }
    }

    return {
      status: AIQuestionSimilarityStatus.UNIQUE,
      similarityScore: 0.0,
    };
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
