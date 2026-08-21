import { QuestionQualityService } from '../services/questionQualityService';

describe('QuestionQualityService Evidence-Based Classification Tests', () => {
  it('should return INSUFFICIENT_DATA classification when attempts are fewer than 5', async () => {
    const analysis = await QuestionQualityService.analyzeQuestionQuality('test-low-attempt-q');

    expect(analysis).toBeDefined();
    expect(analysis.qualityClassification).toBe('INSUFFICIENT_DATA');
    expect(analysis.discriminationStatus).toBe('INSUFFICIENT_DATA');
    expect(analysis.evidence[0]).toContain('Fewer than 5 student attempts');
  });
});
