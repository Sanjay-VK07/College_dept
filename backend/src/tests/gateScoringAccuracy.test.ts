import { GateScoringService, QuestionData } from '../services/gateScoringService';
import { QuestionType } from '@prisma/client';

describe('GATE Scoring Engine Accuracy Verification', () => {
  describe('MCQ Scoring & Negative Marking Rules', () => {
    const mcq1Mark: QuestionData = {
      id: 'q-mcq-1',
      type: QuestionType.MCQ,
      marks: 1.0,
      negativeMarks: 0.33,
      correctAnswer: 'C', // Stored as letter
    };

    const mcq2Mark: QuestionData = {
      id: 'q-mcq-2',
      type: QuestionType.MCQ,
      marks: 2.0,
      negativeMarks: 0.67,
      correctAnswer: ['D'], // Stored as letter array
    };

    test('MCQ 1-mark correct: student selects index 2 (Option C) -> +1.00 marks', () => {
      const res = GateScoringService.evaluateResponse(mcq1Mark, [2]);
      expect(res.isCorrect).toBe(true);
      expect(res.marksObtained).toBe(1.0);
    });

    test('MCQ 1-mark correct: student selects string "C" or "2" -> +1.00 marks', () => {
      expect(GateScoringService.evaluateResponse(mcq1Mark, 'C').isCorrect).toBe(true);
      expect(GateScoringService.evaluateResponse(mcq1Mark, '2').isCorrect).toBe(true);
    });

    test('MCQ 1-mark incorrect: student selects index 0 (Option A) -> -0.33 negative marks', () => {
      const res = GateScoringService.evaluateResponse(mcq1Mark, [0]);
      expect(res.isCorrect).toBe(false);
      expect(res.marksObtained).toBe(-0.33);
    });

    test('MCQ 2-mark correct: student selects index 3 (Option D) -> +2.00 marks', () => {
      const res = GateScoringService.evaluateResponse(mcq2Mark, [3]);
      expect(res.isCorrect).toBe(true);
      expect(res.marksObtained).toBe(2.0);
    });

    test('MCQ 2-mark incorrect: student selects index 1 (Option B) -> -0.67 negative marks', () => {
      const res = GateScoringService.evaluateResponse(mcq2Mark, [1]);
      expect(res.isCorrect).toBe(false);
      expect(res.marksObtained).toBe(-0.67);
    });

    test('MCQ unanswered: null, undefined, or empty -> 0 marks, not correct', () => {
      expect(GateScoringService.evaluateResponse(mcq1Mark, null)).toEqual({ isCorrect: false, marksObtained: 0 });
      expect(GateScoringService.evaluateResponse(mcq1Mark, undefined)).toEqual({ isCorrect: false, marksObtained: 0 });
      expect(GateScoringService.evaluateResponse(mcq1Mark, [])).toEqual({ isCorrect: false, marksObtained: 0 });
    });
  });

  describe('MSQ Scoring & Zero Negative Marking Rules', () => {
    const msq2Mark: QuestionData = {
      id: 'q-msq-1',
      type: QuestionType.MSQ,
      marks: 2.0,
      negativeMarks: 0.0,
      correctAnswer: ['A', 'C'], // Correct is A and C
    };

    test('MSQ exact match: student selects [0, 2] -> +2.00 marks', () => {
      const res = GateScoringService.evaluateResponse(msq2Mark, [0, 2]);
      expect(res.isCorrect).toBe(true);
      expect(res.marksObtained).toBe(2.0);
    });

    test('MSQ exact match with letters: student selects ["A", "C"] -> +2.00 marks', () => {
      const res = GateScoringService.evaluateResponse(msq2Mark, ['C', 'A']); // order insensitive
      expect(res.isCorrect).toBe(true);
      expect(res.marksObtained).toBe(2.0);
    });

    test('MSQ partially correct: student selects only [0] (A) -> 0 marks, NO negative marking', () => {
      const res = GateScoringService.evaluateResponse(msq2Mark, [0]);
      expect(res.isCorrect).toBe(false);
      expect(res.marksObtained).toBe(0);
    });

    test('MSQ superset / extra choice: student selects [0, 1, 2] (A, B, C) -> 0 marks, NO negative marking', () => {
      const res = GateScoringService.evaluateResponse(msq2Mark, [0, 1, 2]);
      expect(res.isCorrect).toBe(false);
      expect(res.marksObtained).toBe(0);
    });

    test('MSQ completely wrong: student selects [1] (B) -> 0 marks, NO negative marking', () => {
      const res = GateScoringService.evaluateResponse(msq2Mark, [1]);
      expect(res.isCorrect).toBe(false);
      expect(res.marksObtained).toBe(0);
    });

    test('MSQ unanswered -> 0 marks', () => {
      expect(GateScoringService.evaluateResponse(msq2Mark, [])).toEqual({ isCorrect: false, marksObtained: 0 });
      expect(GateScoringService.evaluateResponse(msq2Mark, null)).toEqual({ isCorrect: false, marksObtained: 0 });
    });
  });

  describe('NAT Scoring & Range/Tolerance Rules', () => {
    const natExact: QuestionData = {
      id: 'q-nat-exact',
      type: QuestionType.NAT,
      marks: 1.0,
      negativeMarks: 0.0,
      correctAnswer: { value: 8 },
    };

    const natRangeObject: QuestionData = {
      id: 'q-nat-range',
      type: QuestionType.NAT,
      marks: 2.0,
      negativeMarks: 0.0,
      correctAnswer: { min: 147.1, max: 148.1, value: 147.6 },
    };

    const natNestedRange: QuestionData = {
      id: 'q-nat-nested',
      type: QuestionType.NAT,
      marks: 1.0,
      negativeMarks: 0.0,
      correctAnswer: { range: [10, 15] },
    };

    const natStringRange: QuestionData = {
      id: 'q-nat-str',
      type: QuestionType.NAT,
      marks: 1.0,
      negativeMarks: 0.0,
      correctAnswer: '6:6',
    };

    test('NAT exact integer match: student enters "8" or 8 -> +1.00 marks', () => {
      expect(GateScoringService.evaluateResponse(natExact, '8')).toEqual({ isCorrect: true, marksObtained: 1.0 });
      expect(GateScoringService.evaluateResponse(natExact, 8)).toEqual({ isCorrect: true, marksObtained: 1.0 });
      expect(GateScoringService.evaluateResponse(natExact, ' 8.0 ')).toEqual({ isCorrect: true, marksObtained: 1.0 });
    });

    test('NAT exact integer mismatch: student enters "9" -> 0 marks, NO negative marking', () => {
      expect(GateScoringService.evaluateResponse(natExact, '9')).toEqual({ isCorrect: false, marksObtained: 0 });
    });

    test('NAT range object: within [147.1, 148.1] -> +2.00 marks', () => {
      expect(GateScoringService.evaluateResponse(natRangeObject, '147.1')).toEqual({ isCorrect: true, marksObtained: 2.0 });
      expect(GateScoringService.evaluateResponse(natRangeObject, '147.6')).toEqual({ isCorrect: true, marksObtained: 2.0 });
      expect(GateScoringService.evaluateResponse(natRangeObject, '148.1')).toEqual({ isCorrect: true, marksObtained: 2.0 });
    });

    test('NAT range object: outside [147.1, 148.1] -> 0 marks', () => {
      expect(GateScoringService.evaluateResponse(natRangeObject, '147.0')).toEqual({ isCorrect: false, marksObtained: 0 });
      expect(GateScoringService.evaluateResponse(natRangeObject, '148.2')).toEqual({ isCorrect: false, marksObtained: 0 });
    });

    test('NAT nested range [10, 15]: within range -> +1.00 marks', () => {
      expect(GateScoringService.evaluateResponse(natNestedRange, '12.5')).toEqual({ isCorrect: true, marksObtained: 1.0 });
      expect(GateScoringService.evaluateResponse(natNestedRange, '16')).toEqual({ isCorrect: false, marksObtained: 0 });
    });

    test('NAT string range "6:6": student enters 6 -> +1.00 marks', () => {
      expect(GateScoringService.evaluateResponse(natStringRange, '6')).toEqual({ isCorrect: true, marksObtained: 1.0 });
      expect(GateScoringService.evaluateResponse(natStringRange, '7')).toEqual({ isCorrect: false, marksObtained: 0 });
    });

    test('NAT float tolerance: student enters 147.6000001 -> matches within precision', () => {
      expect(GateScoringService.evaluateResponse(natRangeObject, '147.6000001')).toEqual({ isCorrect: true, marksObtained: 2.0 });
    });

    test('NAT unanswered: empty string, null, undefined -> 0 marks', () => {
      expect(GateScoringService.evaluateResponse(natExact, '')).toEqual({ isCorrect: false, marksObtained: 0 });
      expect(GateScoringService.evaluateResponse(natExact, null)).toEqual({ isCorrect: false, marksObtained: 0 });
    });
  });
});
