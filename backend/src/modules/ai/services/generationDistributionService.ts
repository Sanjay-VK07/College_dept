import { prisma } from '../../../config/prisma';
import { Role, AIDocumentVisibility } from '@prisma/client';
import { ENV } from '../../../config/env';

export interface DistributionParams {
  totalQuestions: number;
  difficultyDistribution: {
    EASY: number; // percentage, e.g. 20
    MEDIUM: number; // percentage, e.g. 50
    HARD: number; // percentage, e.g. 30
  };
  typeDistribution: {
    MCQ: number; // percentage, e.g. 60
    MSQ: number; // percentage, e.g. 10
    NAT: number; // percentage, e.g. 30
  };
  selectedResourceIds?: string[];
  userId: string;
  role: Role;
}

export interface DistributionValidationResult {
  isValid: boolean;
  errorCode?: string;
  errorMessage?: string;
  allocatedDifficultyCounts: { EASY: number; MEDIUM: number; HARD: number };
  allocatedTypeCounts: { MCQ: number; MSQ: number; NAT: number };
  authorizedResourceIds: string[];
}

export class GenerationDistributionService {
  /**
   * Retrieves configured Min and Max question generation counts from SystemSetting or ENV.
   */
  public static async getMinMaxConfig(): Promise<{ minCount: number; maxCount: number }> {
    let minCount = Number((ENV as any).MIN_AI_GENERATION_QUESTIONS) || 50;
    let maxCount = Number((ENV as any).MAX_AI_GENERATION_QUESTIONS || (ENV as any).AI_MAX_GENERATED_QUESTIONS) || 500;

    try {
      const minSetting = await prisma.systemSetting.findUnique({
        where: { key: 'MIN_AI_GENERATION_QUESTIONS' },
      });
      if (minSetting && !isNaN(Number(minSetting.value))) {
        minCount = Number(minSetting.value);
      }

      const maxSetting = await prisma.systemSetting.findUnique({
        where: { key: 'AI_MAX_GENERATED_QUESTIONS' },
      });
      if (maxSetting && !isNaN(Number(maxSetting.value))) {
        maxCount = Number(maxSetting.value);
      }
    } catch (e) {
      // Fallback to ENV or safe defaults
    }

    return {
      minCount: Math.max(50, minCount),
      maxCount: Math.max(minCount, maxCount),
    };
  }

  /**
   * Admin setting update for MAX_AI_GENERATION_QUESTIONS / AI_MAX_GENERATED_QUESTIONS.
   */
  public static async updateAdminMaxConfig(newMax: number): Promise<{ minCount: number; maxCount: number }> {
    if (isNaN(newMax) || newMax < 50) {
      throw new Error('Invalid maximum question count configuration. Must be >= 50.');
    }

    await prisma.systemSetting.upsert({
      where: { key: 'AI_MAX_GENERATED_QUESTIONS' },
      update: { value: String(newMax), updatedAt: new Date() },
      create: { key: 'AI_MAX_GENERATED_QUESTIONS', value: String(newMax), description: 'Admin configurable maximum question generation count.' },
    });

    return this.getMinMaxConfig();
  }

  /**
   * Server-side deterministic Largest Remainder (Hamilton) integer allocation algorithm.
   */
  public static allocateIntegerCounts<T extends string>(
    totalCount: number,
    distribution: Record<T, number>
  ): Record<T, number> {
    const keys = Object.keys(distribution) as T[];
    const totalPercentage = keys.reduce((sum, k) => sum + Number(distribution[k] || 0), 0);

    if (Math.abs(totalPercentage - 100) > 0.01) {
      throw new Error(`Distribution percentages must sum to exactly 100%. Got ${totalPercentage}%.`);
    }

    const exactShares: Record<string, number> = {};
    const integerCounts: Record<string, number> = {};
    const remainders: Array<{ key: T; remainder: number }> = [];

    let currentSum = 0;

    for (const key of keys) {
      const exact = (totalCount * Number(distribution[key])) / 100;
      exactShares[key as string] = exact;
      const floor = Math.floor(exact);
      integerCounts[key as string] = floor;
      currentSum += floor;
      remainders.push({ key, remainder: exact - floor });
    }

    // Sort remainders descending to allocate left-over units
    remainders.sort((a, b) => b.remainder - a.remainder);

    let leftOver = totalCount - currentSum;
    let idx = 0;
    while (leftOver > 0 && idx < remainders.length) {
      integerCounts[remainders[idx].key as string] += 1;
      leftOver--;
      idx++;
    }

    return integerCounts as Record<T, number>;
  }

  /**
   * Validates generation request parameters, percentages, counts, and document authorizations.
   */
  public static async validateGenerationRequest(
    params: DistributionParams
  ): Promise<DistributionValidationResult> {
    const { totalQuestions, difficultyDistribution, typeDistribution, selectedResourceIds, userId, role } = params;

    // 1. Min / Max Question Count Validation
    const { minCount, maxCount } = await this.getMinMaxConfig();

    if (totalQuestions < minCount || totalQuestions > maxCount) {
      return {
        isValid: false,
        errorCode: 'INVALID_GENERATION_COUNT',
        errorMessage: `Requested question count (${totalQuestions}) is outside allowed bounds [${minCount}, ${maxCount}].`,
        allocatedDifficultyCounts: { EASY: 0, MEDIUM: 0, HARD: 0 },
        allocatedTypeCounts: { MCQ: 0, MSQ: 0, NAT: 0 },
        authorizedResourceIds: [],
      };
    }

    // 2. Validate Percentages Sum = 100%
    const diffSum = Number(difficultyDistribution.EASY || 0) + Number(difficultyDistribution.MEDIUM || 0) + Number(difficultyDistribution.HARD || 0);
    if (Math.abs(diffSum - 100) > 0.01) {
      return {
        isValid: false,
        errorCode: 'INVALID_DIFFICULTY_DISTRIBUTION',
        errorMessage: `Difficulty distribution percentages must sum to 100%. Current sum: ${diffSum}%.`,
        allocatedDifficultyCounts: { EASY: 0, MEDIUM: 0, HARD: 0 },
        allocatedTypeCounts: { MCQ: 0, MSQ: 0, NAT: 0 },
        authorizedResourceIds: [],
      };
    }

    const typeSum = Number(typeDistribution.MCQ || 0) + Number(typeDistribution.MSQ || 0) + Number(typeDistribution.NAT || 0);
    if (Math.abs(typeSum - 100) > 0.01) {
      return {
        isValid: false,
        errorCode: 'INVALID_TYPE_DISTRIBUTION',
        errorMessage: `Question type distribution percentages must sum to 100%. Current sum: ${typeSum}%.`,
        allocatedDifficultyCounts: { EASY: 0, MEDIUM: 0, HARD: 0 },
        allocatedTypeCounts: { MCQ: 0, MSQ: 0, NAT: 0 },
        authorizedResourceIds: [],
      };
    }

    // 3. Integer Allocation Calculation
    const allocatedDifficultyCounts = this.allocateIntegerCounts(totalQuestions, difficultyDistribution);
    const allocatedTypeCounts = this.allocateIntegerCounts(totalQuestions, typeDistribution);

    // 4. Resource Authorization Verification
    const authorizedResourceIds: string[] = [];

    if (selectedResourceIds && selectedResourceIds.length > 0) {
      const documents = await prisma.aIDocument.findMany({
        where: { id: { in: selectedResourceIds } },
      });

      for (const doc of documents) {
        // Permission Check: Admin can access all READY docs.
        // Faculty can access their uploaded docs, PUBLIC docs, or FACULTY/ADMIN visibility docs.
        const isOwner = doc.uploadedById === userId;
        const isPublic = doc.visibility === AIDocumentVisibility.PUBLIC;
        const isFacultyAccess = (role === Role.FACULTY || role === Role.ADMIN) && 
          (doc.visibility === AIDocumentVisibility.FACULTY || doc.visibility === AIDocumentVisibility.ADMIN);

        if (!isOwner && !isPublic && !isFacultyAccess && role !== Role.ADMIN) {
          return {
            isValid: false,
            errorCode: 'FORBIDDEN_RESOURCE_ACCESS',
            errorMessage: `Forbidden: User does not have authorization to access document '${doc.title}' (${doc.id}).`,
            allocatedDifficultyCounts: { EASY: 0, MEDIUM: 0, HARD: 0 },
            allocatedTypeCounts: { MCQ: 0, MSQ: 0, NAT: 0 },
            authorizedResourceIds: [],
          };
        }
        authorizedResourceIds.push(doc.id);
      }
    }

    return {
      isValid: true,
      allocatedDifficultyCounts,
      allocatedTypeCounts,
      authorizedResourceIds,
    };
  }
}
