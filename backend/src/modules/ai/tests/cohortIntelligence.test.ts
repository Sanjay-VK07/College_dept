import { CohortIntelligenceService } from '../services/cohortIntelligenceService';

describe('CohortIntelligenceService Academic Gap Detection Tests', () => {
  it('should return cohort performance overview and academic gaps structure', async () => {
    const overview = await CohortIntelligenceService.getCohortIntelligence('Computer Science and Engineering');

    expect(overview).toBeDefined();
    expect(overview.department).toBe('Computer Science and Engineering');
    expect(Array.isArray(overview.academicGaps)).toBe(true);
  });
});
