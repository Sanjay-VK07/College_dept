import { QuestionIntelligenceService } from '../services/questionIntelligenceService';
import { QuestionBankIntelligenceService } from '../services/questionBankIntelligenceService';

describe('QuestionIntelligenceService & QuestionBankIntelligenceService Tests', () => {
  it('should return empty metrics / zero count cleanly for non-existent or unattempted question', async () => {
    const metrics = await QuestionIntelligenceService.getQuestionPerformance('non-existent-question-id');
    expect(metrics).toBeNull();
  });

  it('should return valid Question Bank health overview metrics', async () => {
    const health = await QuestionBankIntelligenceService.getQuestionBankHealth();
    expect(health).toBeDefined();
    expect(typeof health.totalApprovedQuestions).toBe('number');
    expect(typeof health.pendingAiQuestions).toBe('number');
    expect(health.byDifficulty).toHaveProperty('EASY');
  });
});
