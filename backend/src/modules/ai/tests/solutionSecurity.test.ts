import { SolutionService } from '../services/solutionService';
import { Role } from '@prisma/client';

describe('Solution Security & Authorization Guard Tests', () => {
  it('should strictly reject Student role attempt to generate solution with 403 Forbidden', async () => {
    await expect(
      SolutionService.generateSolution('student-123', Role.STUDENT, {
        questionId: 'q-123',
        generationRequestId: 'req-123',
      })
    ).rejects.toThrow('Forbidden: Only Faculty and Admin users can generate solutions.');
  });

  it('should reject solution generation for non-existent Question ID', async () => {
    await expect(
      SolutionService.generateSolution('faculty-123', Role.FACULTY, {
        questionId: 'non-existent-question-999',
        generationRequestId: 'req-456',
      })
    ).rejects.toThrow("Question 'non-existent-question-999' not found in Question Bank.");
  });
});
