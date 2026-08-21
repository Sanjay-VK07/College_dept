import { ExamIntelligenceService } from '../services/examIntelligenceService';

describe('ExamIntelligenceService Integration Tests', () => {
  it('should return null metrics gracefully for non-existent exam ID', async () => {
    const metrics = await ExamIntelligenceService.getExamIntelligence('non-existent-exam-id');
    expect(metrics).toBeNull();
  });

  it('should return all exams intelligence array', async () => {
    const list = await ExamIntelligenceService.getAllExamsIntelligence();
    expect(Array.isArray(list)).toBe(true);
  });
});
