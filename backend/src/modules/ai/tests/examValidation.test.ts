import { ExamValidationService } from '../services/examValidationService';
import { QuestionType, Difficulty } from '@prisma/client';

describe('ExamValidationService Unit Tests', () => {
  it('should validate an assembled exam and compute accurate difficulty breakdown and topic coverage', () => {
    const questions = [
      { id: 'q1', difficulty: Difficulty.EASY, marks: 1.0, subtopic: { topic: { id: 't1', name: 'Topic 1' } } },
      { id: 'q2', difficulty: Difficulty.MEDIUM, marks: 2.0, subtopic: { topic: { id: 't1', name: 'Topic 1' } } },
      { id: 'q3', difficulty: Difficulty.HARD, marks: 2.0, subtopic: { topic: { id: 't2', name: 'Topic 2' } } },
    ];

    const result = ExamValidationService.validateExamAssembly({
      selectedQuestions: questions,
      requestedCount: 3,
    });

    expect(result.isValid).toBe(true);
    expect(result.errors.length).toBe(0);
    expect(result.totalMarks).toBe(5.0);
    expect(result.actualDifficultyBreakdown).toEqual({ EASY: 1, MEDIUM: 1, HARD: 1 });
    expect(result.topicCoverage.length).toBe(2);
  });

  it('should reject exam assembly containing duplicate question IDs', () => {
    const duplicateQuestions = [
      { id: 'q1', difficulty: Difficulty.EASY, marks: 1.0 },
      { id: 'q1', difficulty: Difficulty.EASY, marks: 1.0 },
    ];

    const result = ExamValidationService.validateExamAssembly({
      selectedQuestions: duplicateQuestions,
      requestedCount: 2,
    });

    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('Exam assembly contains duplicate question IDs.');
  });
});
