import { prisma } from '../../../config/prisma';

export interface AIGenerationSettings {
  autoPublishVerified: boolean;
  maxRegenerationAttempts: number;
}

const KEYS = {
  AUTO_PUBLISH: 'AUTO_PUBLISH_VERIFIED_QUESTIONS',
  MAX_REGEN: 'MAX_REGENERATION_ATTEMPTS',
} as const;

const DEFAULTS: AIGenerationSettings = {
  // Per spec: faculty/admin should not be required to manually verify every generated
  // question — a question that independently PASSES verification publishes automatically.
  autoPublishVerified: true,
  maxRegenerationAttempts: 2,
};

/**
 * Admin-configurable knobs for the batch generation pipeline, stored in the existing generic
 * SystemSetting key/value table (same store GenerationDistributionService uses for min/max
 * question counts) rather than hardcoded — reused by AIBatchQuestionGenerationService.
 */
export class AIGenerationSettingsService {
  public static async getSettings(): Promise<AIGenerationSettings> {
    const rows = await prisma.systemSetting.findMany({
      where: { key: { in: [KEYS.AUTO_PUBLISH, KEYS.MAX_REGEN] } },
    });
    const map = new Map(rows.map((r) => [r.key, r.value]));

    const autoPublishRaw = map.get(KEYS.AUTO_PUBLISH);
    const maxRegenRaw = map.get(KEYS.MAX_REGEN);

    return {
      autoPublishVerified: autoPublishRaw !== undefined ? autoPublishRaw === 'true' : DEFAULTS.autoPublishVerified,
      maxRegenerationAttempts:
        maxRegenRaw !== undefined && !isNaN(Number(maxRegenRaw))
          ? Math.max(0, Math.min(5, Number(maxRegenRaw)))
          : DEFAULTS.maxRegenerationAttempts,
    };
  }

  public static async updateSettings(partial: Partial<AIGenerationSettings>): Promise<AIGenerationSettings> {
    if (partial.autoPublishVerified !== undefined) {
      await prisma.systemSetting.upsert({
        where: { key: KEYS.AUTO_PUBLISH },
        update: { value: String(partial.autoPublishVerified) },
        create: {
          key: KEYS.AUTO_PUBLISH,
          value: String(partial.autoPublishVerified),
          description: 'If true, AI-generated questions that independently pass verification publish to the Question Bank automatically without a manual approval click.',
        },
      });
    }

    if (partial.maxRegenerationAttempts !== undefined) {
      const n = Math.max(0, Math.min(5, Number(partial.maxRegenerationAttempts)));
      await prisma.systemSetting.upsert({
        where: { key: KEYS.MAX_REGEN },
        update: { value: String(n) },
        create: {
          key: KEYS.MAX_REGEN,
          value: String(n),
          description: 'How many extra generation rounds the batch pipeline may attempt to make up a shortfall caused by rejected/duplicate/unverifiable questions, before honestly reporting the shortfall.',
        },
      });
    }

    return this.getSettings();
  }
}
