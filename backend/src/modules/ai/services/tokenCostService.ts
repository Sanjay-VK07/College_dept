import { prisma } from '../../../config/prisma';

export interface TokenUsageRecord {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
}

export class TokenCostService {
  // Configurable cost rates per 1,000 tokens (e.g. Gemini 1.5 Flash pricing)
  private static INPUT_COST_PER_1K = 0.00015;
  private static OUTPUT_COST_PER_1K = 0.0006;

  // Daily token quotas per role
  private static DAILY_QUOTAS: Record<string, number> = {
    STUDENT: 100_000,
    FACULTY: 500_000,
    ADMIN: 10_000_000,
  };

  /**
   * Approximates token usage based on text length (~4 characters per token).
   */
  public static calculateTokens(promptText: string, completionText: string = ''): TokenUsageRecord {
    const promptTokens = Math.max(1, Math.ceil((promptText || '').length / 4));
    const completionTokens = Math.ceil((completionText || '').length / 4);
    const totalTokens = promptTokens + completionTokens;

    const promptCost = (promptTokens / 1000) * this.INPUT_COST_PER_1K;
    const completionCost = (completionTokens / 1000) * this.OUTPUT_COST_PER_1K;
    const estimatedCostUsd = Math.round((promptCost + completionCost) * 100000) / 100000;

    return {
      promptTokens,
      completionTokens,
      totalTokens,
      estimatedCostUsd,
    };
  }

  /**
   * Checks if user has exceeded their daily token limit.
   */
  public static async checkQuota(userId: string, role: string, requestedTokens: number = 500): Promise<{ allowed: boolean; remainingTokens: number; dailyQuota: number }> {
    const quota = this.DAILY_QUOTAS[role] || this.DAILY_QUOTAS.STUDENT;

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const todayTraces = await prisma.aIRAGTrace.findMany({
      where: {
        userId,
        createdAt: { gte: startOfDay },
      },
      select: { totalDurationMs: true },
    });

    // Approximate historical token count from recorded user traces today
    const estimatedUsedToday = todayTraces.length * 450;
    const remainingTokens = Math.max(0, quota - estimatedUsedToday);

    return {
      allowed: estimatedUsedToday + requestedTokens <= quota,
      remainingTokens,
      dailyQuota: quota,
    };
  }

  /**
   * Summarizes system-wide token and API cost metrics across all RAG and AI traces.
   */
  public static async getSystemCostMetrics() {
    const totalTracesCount = await prisma.aIRAGTrace.count();
    const totalQuestionTracesCount = await prisma.aIQuestionGenerationTrace.count();
    const totalSolutionCount = await prisma.aISolution.count();

    const estimatedTotalTokens = totalTracesCount * 450 + totalQuestionTracesCount * 1200 + totalSolutionCount * 800;
    const estimatedTotalCostUsd = Math.round(((estimatedTotalTokens / 1000) * 0.0003) * 1000) / 1000;

    return {
      totalTracesCount,
      estimatedTotalTokens,
      estimatedTotalCostUsd,
      dailyQuotaMap: this.DAILY_QUOTAS,
    };
  }
}
