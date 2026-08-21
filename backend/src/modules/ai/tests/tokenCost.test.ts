import { TokenCostService } from '../services/tokenCostService';

describe('TokenCostService & Quota Management Tests', () => {
  it('should calculate estimated token count and USD cost accurately', () => {
    const prompt = 'Explain GATE Computer Science Operating Systems paging algorithm';
    const completion = 'Paging is a memory management scheme by which a computer stores and retrieves data from secondary storage...';

    const usage = TokenCostService.calculateTokens(prompt, completion);

    expect(usage).toBeDefined();
    expect(usage.promptTokens).toBeGreaterThan(0);
    expect(usage.completionTokens).toBeGreaterThan(0);
    expect(usage.totalTokens).toBe(usage.promptTokens + usage.completionTokens);
    expect(usage.estimatedCostUsd).toBeGreaterThan(0);
  });

  it('should enforce role-based daily quota calculation', async () => {
    const quotaCheck = await TokenCostService.checkQuota('test-student-id', 'STUDENT', 500);

    expect(quotaCheck).toBeDefined();
    expect(quotaCheck.dailyQuota).toBe(100_000);
    expect(typeof quotaCheck.allowed).toBe('boolean');
  });
});
