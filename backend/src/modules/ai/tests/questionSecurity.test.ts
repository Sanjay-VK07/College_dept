import { QuestionGenerationService } from '../services/questionGenerationService';
import { Role } from '@prisma/client';

describe('Question Security & Authorization Guard Tests', () => {
  it('should strictly reject Student role attempt to generate questions with 403 Forbidden', async () => {
    await expect(
      QuestionGenerationService.generateQuestions('student-user-123', Role.STUDENT, {
        count: 1,
      })
    ).rejects.toThrow('Forbidden: Only Faculty and Admin users are authorized to generate questions.');
  });

  it('should reject invalid subtopic / topic taxonomy hierarchy mismatch', async () => {
    await expect(
      QuestionGenerationService.generateQuestions('faculty-user-123', Role.FACULTY, {
        subtopicId: 'non-existent-subtopic-id-999',
        count: 1,
      })
    ).rejects.toThrow('Invalid taxonomy: Subtopic');
  });
});
