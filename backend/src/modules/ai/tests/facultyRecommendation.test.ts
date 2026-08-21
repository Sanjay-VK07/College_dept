import { FacultyRecommendationService } from '../services/facultyRecommendationService';

describe('FacultyRecommendationService Evidence-Based Recommendation Tests', () => {
  it('should generate evidence-backed faculty recommendations array', async () => {
    const recs = await FacultyRecommendationService.generateRecommendations('Computer Science and Engineering');

    expect(Array.isArray(recs)).toBe(true);
    expect(recs.length).toBeGreaterThan(0);
    expect(recs[0]).toHaveProperty('evidence');
    expect(recs[0]).toHaveProperty('recommendedAction');
  });
});
