import { SolutionValidationService } from '../services/solutionValidationService';
import { QuestionType } from '@prisma/client';

describe('SolutionValidationService Unit Tests', () => {
  it('should validate MCQ solution structure with valid option index', () => {
    const result = SolutionValidationService.validateSolutionStructure(
      QuestionType.MCQ,
      {
        correctAnswer: [1],
        explanation: 'Detailed mathematical solution explanation.',
      },
      [{ text: 'Option A' }, { text: 'Option B' }, { text: 'Option C' }, { text: 'Option D' }]
    );

    expect(result.isValid).toBe(true);
    expect(result.normalizedAnswer).toEqual([1]);
    expect(result.sanitizedExplanation).toBe('Detailed mathematical solution explanation.');
  });

  it('should reject MCQ solution with invalid option index or empty explanation', () => {
    const result = SolutionValidationService.validateSolutionStructure(
      QuestionType.MCQ,
      {
        correctAnswer: [9], // Out of bounds
        explanation: '',
      },
      [{ text: 'Option A' }, { text: 'Option B' }]
    );

    expect(result.isValid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('should validate NAT numerical answer representation', () => {
    const result = SolutionValidationService.validateSolutionStructure(
      QuestionType.NAT,
      {
        correctAnswer: { value: 25.4, min: 25.0, max: 26.0 },
        explanation: 'NAT calculation explanation.',
      }
    );

    expect(result.isValid).toBe(true);
    expect(result.normalizedAnswer.value).toBe(25.4);
  });
});
