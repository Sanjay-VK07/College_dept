import { QuestionIntelligenceService, QuestionPerformanceMetrics } from './questionIntelligenceService';

export type QualityClassification = 'HIGH_QUALITY' | 'GOOD' | 'REVIEW_REQUIRED' | 'LOW_PERFORMANCE' | 'INSUFFICIENT_DATA';
export type DiscriminationStatus = 'EFFECTIVE' | 'MODERATE' | 'WEAK_DISCRIMINATION' | 'INSUFFICIENT_DATA';

export interface QuestionQualityAnalysis {
  questionId: string;
  qualityClassification: QualityClassification;
  discriminationStatus: DiscriminationStatus;
  metrics: QuestionPerformanceMetrics;
  evidence: string[];
}

export class QuestionQualityService {
  private static MIN_ATTEMPTS_FOR_CLASSIFICATION = 5;

  /**
   * Evaluates evidence-based quality classification and discrimination power for a question.
   */
  public static async analyzeQuestionQuality(questionId: string): Promise<QuestionQualityAnalysis> {
    const metrics = await QuestionIntelligenceService.getQuestionPerformance(questionId);

    if (!metrics || metrics.attemptCount < this.MIN_ATTEMPTS_FOR_CLASSIFICATION) {
      return {
        questionId,
        qualityClassification: 'INSUFFICIENT_DATA',
        discriminationStatus: 'INSUFFICIENT_DATA',
        metrics: metrics || {
          questionId,
          stem: 'Unknown',
          type: 'MCQ',
          difficulty: 'MEDIUM',
          attemptCount: 0,
          correctCount: 0,
          incorrectCount: 0,
          skippedCount: 0,
          accuracyPercentage: 0,
          averageTimeSpentSec: 0,
          marks: 1.0,
        },
        evidence: ['Fewer than 5 student attempts recorded in database. Insufficient sample size for quality evaluation.'],
      };
    }

    const evidence: string[] = [];
    let qualityClassification: QualityClassification = 'GOOD';
    let discriminationStatus: DiscriminationStatus = 'MODERATE';

    const { attemptCount, accuracyPercentage, averageTimeSpentSec, difficulty, skippedCount } = metrics;

    evidence.push(`Based on ${attemptCount} real student attempts with ${accuracyPercentage}% accuracy.`);

    // Check for high skip rate or extreme response time
    const skipRate = Math.round((skippedCount / (attemptCount + skippedCount)) * 100);
    if (skipRate > 40) {
      evidence.push(`High skip rate detected (${skipRate}% of students skipped). Question stem or options may be ambiguous.`);
      qualityClassification = 'REVIEW_REQUIRED';
    }

    if (difficulty === 'EASY' && accuracyPercentage < 40) {
      evidence.push(`Mismatched difficulty: Question marked EASY but actual accuracy is low (${accuracyPercentage}%).`);
      qualityClassification = 'REVIEW_REQUIRED';
    } else if (difficulty === 'HARD' && accuracyPercentage > 85) {
      evidence.push(`Mismatched difficulty: Question marked HARD but actual accuracy is high (${accuracyPercentage}%).`);
      qualityClassification = 'REVIEW_REQUIRED';
    } else if (accuracyPercentage >= 50 && accuracyPercentage <= 80 && skipRate <= 20) {
      qualityClassification = 'HIGH_QUALITY';
      evidence.push('Optimal accuracy and completion rate for GATE assessment standards.');
    } else if (accuracyPercentage < 25) {
      qualityClassification = 'LOW_PERFORMANCE';
      evidence.push('Very low student accuracy across attempts.');
    }

    // Discrimination Status
    if (accuracyPercentage >= 35 && accuracyPercentage <= 75) {
      discriminationStatus = 'EFFECTIVE';
      evidence.push('Question demonstrates effective performance discrimination between candidate cohorts.');
    } else if (accuracyPercentage < 15 || accuracyPercentage > 95) {
      discriminationStatus = 'WEAK_DISCRIMINATION';
      evidence.push('Extreme accuracy boundary provides weak discrimination value.');
    }

    return {
      questionId,
      qualityClassification,
      discriminationStatus,
      metrics,
      evidence,
    };
  }
}
