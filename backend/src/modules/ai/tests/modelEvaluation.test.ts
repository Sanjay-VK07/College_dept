import { ModelEvaluationService } from '../services/modelEvaluationService';

describe('ModelEvaluationService Multi-Pipeline Evaluation Tests', () => {
  it('should calculate evaluation metrics across all 5 operational pipelines', async () => {
    const evaluation = await ModelEvaluationService.evaluateAllPipelines();

    expect(evaluation).toBeDefined();
    expect(evaluation.overallSystemQualityScore).toBeGreaterThanOrEqual(0);
    expect(evaluation.overallSystemQualityScore).toBeLessThanOrEqual(100);
    expect(Array.isArray(evaluation.pipelines)).toBe(true);
    expect(evaluation.pipelines.length).toBe(5);
  });
});
