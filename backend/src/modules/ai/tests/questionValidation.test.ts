import { QuestionValidationService } from '../services/questionValidationService';
import { QuestionType, Difficulty } from '@prisma/client';

describe('QuestionValidationService Unit Tests', () => {
  it('should validate a structural MCQ question with 4 options and 1 correct answer', () => {
    const result = QuestionValidationService.validateQuestion({
      type: QuestionType.MCQ,
      stem: 'What is the time complexity of QuickSort in the worst case?',
      options: ['O(N log N)', 'O(N^2)', 'O(N)', 'O(1)'],
      correctAnswer: [1],
      explanation: 'Worst case QuickSort occurs when pivot selection is unbalanced, resulting in O(N^2).',
      difficulty: Difficulty.MEDIUM,
    });

    expect(result.isValid).toBe(true);
    expect(result.errors.length).toBe(0);
    expect(result.sanitizedStem).toContain('QuickSort');
    expect(result.normalizedOptions?.length).toBe(4);
    expect(result.normalizedCorrectAnswer).toEqual([1]);
  });

  it('should reject MCQ with invalid options count or out-of-bound correct answer', () => {
    const result = QuestionValidationService.validateQuestion({
      type: QuestionType.MCQ,
      stem: 'Invalid MCQ stem',
      options: ['Option A', 'Option B'], // Only 2 options
      correctAnswer: [3], // Out of bounds
      explanation: 'Explanation text',
    });

    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('MCQ question must have exactly 4 options. Found 2.');
  });

  it('should validate a valid MSQ with multiple correct answer indices', () => {
    const result = QuestionValidationService.validateQuestion({
      type: QuestionType.MSQ,
      stem: 'Which of the following are NP-Complete problems?',
      options: ['3-SAT', 'Vertex Cover', 'Shortest Path (Dijkstra)', 'Minimum Spanning Tree'],
      correctAnswer: [0, 1],
      explanation: '3-SAT and Vertex Cover are NP-Complete. Dijkstra and MST run in polynomial time.',
      difficulty: Difficulty.HARD,
    });

    expect(result.isValid).toBe(true);
    expect(result.normalizedCorrectAnswer).toEqual([0, 1]);
  });

  it('should validate a valid NAT numerical answer with tolerance', () => {
    const result = QuestionValidationService.validateQuestion({
      type: QuestionType.NAT,
      stem: 'Calculate the page table size in KB for a 32-bit virtual address space.',
      correctAnswer: { value: 4.0, min: 3.9, max: 4.1 },
      explanation: 'Page table size calculation yields 4.0 KB.',
      difficulty: Difficulty.MEDIUM,
    });

    expect(result.isValid).toBe(true);
    expect(result.normalizedCorrectAnswer.value).toBe(4.0);
  });

  it('should strip malicious script tags from stem and explanation', () => {
    const result = QuestionValidationService.validateQuestion({
      type: QuestionType.MCQ,
      stem: 'Malicious question <script>alert("hack")</script>',
      options: ['A', 'B', 'C', 'D'],
      correctAnswer: [0],
      explanation: 'Normal explanation',
    });

    expect(result.sanitizedStem).not.toContain('<script>');
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});
