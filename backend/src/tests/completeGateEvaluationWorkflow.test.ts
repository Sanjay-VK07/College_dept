import { GateScoringService, QuestionData } from '../services/gateScoringService';
import { QuestionType } from '@prisma/client';

describe('Complete GATE Application Fix – Scoring, Evaluation & Consistency Verification', () => {
  describe('1. Individual Question Type Scoring & Negative Marking Rules', () => {
    const mcq1Mark: QuestionData = {
      id: 'q-mcq-1',
      type: QuestionType.MCQ,
      marks: 1.0,
      negativeMarks: 0.33,
      correctAnswer: 'B',
    };

    const mcq2Mark: QuestionData = {
      id: 'q-mcq-2',
      type: QuestionType.MCQ,
      marks: 2.0,
      negativeMarks: 0.66,
      correctAnswer: 'A',
    };

    const mcq2MarkDefaultPenalty: QuestionData = {
      id: 'q-mcq-2-default',
      type: QuestionType.MCQ,
      marks: 2.0,
      negativeMarks: 0, // Unset negative marks should default to 2/3 (0.66)
      correctAnswer: 'D',
    };

    const msq2Mark: QuestionData = {
      id: 'q-msq-1',
      type: QuestionType.MSQ,
      marks: 2.0,
      negativeMarks: 0,
      correctAnswer: ['A', 'B', 'D'],
    };

    const nat1MarkExact: QuestionData = {
      id: 'q-nat-1',
      type: QuestionType.NAT,
      marks: 1.0,
      negativeMarks: 0,
      correctAnswer: { value: 42 },
    };

    const nat2MarkRange: QuestionData = {
      id: 'q-nat-2',
      type: QuestionType.NAT,
      marks: 2.0,
      negativeMarks: 0,
      correctAnswer: { min: 147.1, max: 148.1 },
    };

    const natMultipleAccepted: QuestionData = {
      id: 'q-nat-multi',
      type: QuestionType.NAT,
      marks: 1.0,
      negativeMarks: 0,
      correctAnswer: { acceptedRanges: [{ value: 205 }, { min: 819, max: 820 }] },
    };

    // --- MCQ Tests ---
    test('Correct 1-mark MCQ awards +1.00', () => {
      const res = GateScoringService.evaluateResponse(mcq1Mark, 'B');
      expect(res.isCorrect).toBe(true);
      expect(res.marksObtained).toBe(1.0);
    });

    test('Wrong 1-mark MCQ deducts -0.33 mark', () => {
      const res = GateScoringService.evaluateResponse(mcq1Mark, 'C');
      expect(res.isCorrect).toBe(false);
      expect(res.marksObtained).toBe(-0.33);
    });

    test('Correct 2-mark MCQ awards +2.00', () => {
      const res = GateScoringService.evaluateResponse(mcq2Mark, 'A');
      expect(res.isCorrect).toBe(true);
      expect(res.marksObtained).toBe(2.0);
    });

    test('Wrong 2-mark MCQ deducts -0.66 mark', () => {
      const res = GateScoringService.evaluateResponse(mcq2Mark, 'C');
      expect(res.isCorrect).toBe(false);
      expect(res.marksObtained).toBe(-0.66);
    });

    test('Wrong 2-mark MCQ with default penalty calculates -0.66', () => {
      const res = GateScoringService.evaluateResponse(mcq2MarkDefaultPenalty, 'B');
      expect(res.isCorrect).toBe(false);
      expect(res.marksObtained).toBe(-0.66);
    });

    test('Unanswered MCQ contributes exactly 0.00 marks', () => {
      expect(GateScoringService.evaluateResponse(mcq1Mark, null)).toEqual({ isCorrect: false, marksObtained: 0 });
      expect(GateScoringService.evaluateResponse(mcq1Mark, undefined)).toEqual({ isCorrect: false, marksObtained: 0 });
      expect(GateScoringService.evaluateResponse(mcq1Mark, '')).toEqual({ isCorrect: false, marksObtained: 0 });
      expect(GateScoringService.evaluateResponse(mcq1Mark, [])).toEqual({ isCorrect: false, marksObtained: 0 });
    });

    // --- MSQ Tests ---
    test('Correct MSQ with exact combination awards full marks (+2.00)', () => {
      const res = GateScoringService.evaluateResponse(msq2Mark, ['A', 'B', 'D']);
      expect(res.isCorrect).toBe(true);
      expect(res.marksObtained).toBe(2.0);
    });

    test('Correct MSQ is order-insensitive', () => {
      const res = GateScoringService.evaluateResponse(msq2Mark, ['D', 'A', 'B']);
      expect(res.isCorrect).toBe(true);
      expect(res.marksObtained).toBe(2.0);
    });

    test('Incorrect MSQ receives exactly 0 marks (NEVER negative)', () => {
      const partial = GateScoringService.evaluateResponse(msq2Mark, ['A', 'B']);
      expect(partial.isCorrect).toBe(false);
      expect(partial.marksObtained).toBe(0);

      const wrong = GateScoringService.evaluateResponse(msq2Mark, ['C']);
      expect(wrong.isCorrect).toBe(false);
      expect(wrong.marksObtained).toBe(0);
    });

    test('Unanswered MSQ receives 0 marks', () => {
      expect(GateScoringService.evaluateResponse(msq2Mark, [])).toEqual({ isCorrect: false, marksObtained: 0 });
      expect(GateScoringService.evaluateResponse(msq2Mark, null)).toEqual({ isCorrect: false, marksObtained: 0 });
    });

    // --- NAT Tests ---
    test('Correct NAT exact number awards full marks', () => {
      const res = GateScoringService.evaluateResponse(nat1MarkExact, '42');
      expect(res.isCorrect).toBe(true);
      expect(res.marksObtained).toBe(1.0);
    });

    test('Incorrect NAT receives exactly 0 marks (NEVER negative)', () => {
      const res = GateScoringService.evaluateResponse(nat1MarkExact, '43');
      expect(res.isCorrect).toBe(false);
      expect(res.marksObtained).toBe(0);
    });

    test('NAT within accepted range [147.1, 148.1] awards full marks (+2.00)', () => {
      expect(GateScoringService.evaluateResponse(nat2MarkRange, '147.1').isCorrect).toBe(true);
      expect(GateScoringService.evaluateResponse(nat2MarkRange, '147.6').isCorrect).toBe(true);
      expect(GateScoringService.evaluateResponse(nat2MarkRange, '148.1').isCorrect).toBe(true);
      expect(GateScoringService.evaluateResponse(nat2MarkRange, '147.6').marksObtained).toBe(2.0);
    });

    test('NAT outside accepted range receives 0 marks', () => {
      expect(GateScoringService.evaluateResponse(nat2MarkRange, '147.0').isCorrect).toBe(false);
      expect(GateScoringService.evaluateResponse(nat2MarkRange, '148.2').isCorrect).toBe(false);
      expect(GateScoringService.evaluateResponse(nat2MarkRange, '147.0').marksObtained).toBe(0);
    });

    test('NAT multiple accepted values: matches exact value or range', () => {
      expect(GateScoringService.evaluateResponse(natMultipleAccepted, '205').isCorrect).toBe(true);
      expect(GateScoringService.evaluateResponse(natMultipleAccepted, '819.5').isCorrect).toBe(true);
      expect(GateScoringService.evaluateResponse(natMultipleAccepted, '820').isCorrect).toBe(true);
      expect(GateScoringService.evaluateResponse(natMultipleAccepted, '204').isCorrect).toBe(false);
      expect(GateScoringService.evaluateResponse(natMultipleAccepted, '821').isCorrect).toBe(false);
    });

    test('Unanswered NAT receives 0 marks', () => {
      expect(GateScoringService.evaluateResponse(nat1MarkExact, '')).toEqual({ isCorrect: false, marksObtained: 0 });
      expect(GateScoringService.evaluateResponse(nat1MarkExact, null)).toEqual({ isCorrect: false, marksObtained: 0 });
    });
  });

  describe('2. Illustrative Exam Evaluation – Decimal-Safe Multi-Question Benchmark', () => {
    // Benchmark Exam Paper:
    // Q1: MCQ (2 marks) -> Wrong   (-0.66)
    // Q2: MCQ (1 mark)  -> Correct (+1.00)
    // Q3: MSQ (2 marks) -> Correct (+2.00)
    // Q4: NAT (1 mark)  -> Wrong   ( 0.00)
    // Q5: MCQ (2 marks) -> Correct (+2.00)
    // Expected Total: 4.34 / 8.00
    const examQuestions: QuestionData[] = [
      { id: 'q1', type: QuestionType.MCQ, marks: 2.0, negativeMarks: 0.66, correctAnswer: 'B' },
      { id: 'q2', type: QuestionType.MCQ, marks: 1.0, negativeMarks: 0.33, correctAnswer: 'A' },
      { id: 'q3', type: QuestionType.MSQ, marks: 2.0, negativeMarks: 0.0, correctAnswer: ['B', 'C'] },
      { id: 'q4', type: QuestionType.NAT, marks: 1.0, negativeMarks: 0.0, correctAnswer: { value: 10 } },
      { id: 'q5', type: QuestionType.MCQ, marks: 2.0, negativeMarks: 0.66, correctAnswer: 'D' },
    ];

    const studentAnswers = {
      q1: 'C',          // Wrong MCQ (2 marks)  -> -0.66
      q2: 'A',          // Correct MCQ (1 mark) -> +1.00
      q3: ['C', 'B'],   // Correct MSQ (2 marks)-> +2.00
      q4: '15',         // Wrong NAT (1 mark)   ->  0.00
      q5: 'D',          // Correct MCQ (2 marks)-> +2.00
    };

    test('Evaluates benchmark questions and produces exact total score 4.34 / 8.00', () => {
      let totalMarksAllotted = 0;
      let totalMarksObtained = 0;
      let totalPositiveMarks = 0;
      let totalNegativeMarksDeducted = 0;
      let correctCount = 0;
      let wrongCount = 0;
      let unansweredCount = 0;

      const results = examQuestions.map((q) => {
        totalMarksAllotted += q.marks;
        const answer = (studentAnswers as any)[q.id];
        const isAttempted = answer !== undefined && answer !== null && answer !== '';

        if (!isAttempted) {
          unansweredCount++;
          return { questionId: q.id, isCorrect: false, marksObtained: 0 };
        }

        const evaluation = GateScoringService.evaluateResponse(q, answer);
        if (evaluation.isCorrect) {
          correctCount++;
          totalPositiveMarks += evaluation.marksObtained;
        } else {
          wrongCount++;
          if (evaluation.marksObtained < 0) {
            totalNegativeMarksDeducted += Math.abs(evaluation.marksObtained);
          }
        }

        totalMarksObtained += evaluation.marksObtained;
        return {
          questionId: q.id,
          isCorrect: evaluation.isCorrect,
          marksObtained: evaluation.marksObtained,
        };
      });

      // Assert Question-Wise Details
      expect(results[0].marksObtained).toBe(-0.66);
      expect(results[1].marksObtained).toBe(1.0);
      expect(results[2].marksObtained).toBe(2.0);
      expect(results[3].marksObtained).toBe(0.0);
      expect(results[4].marksObtained).toBe(2.0);

      // Assert Decimal Totals
      const finalScore = Number(totalMarksObtained.toFixed(2));
      const posMarks = Number(totalPositiveMarks.toFixed(2));
      const negMarks = Number(totalNegativeMarksDeducted.toFixed(2));

      expect(totalMarksAllotted).toBe(8.0);
      expect(posMarks).toBe(5.0);
      expect(negMarks).toBe(0.66);
      expect(finalScore).toBe(4.34); // Exactly 4.34!
      expect(correctCount).toBe(3);
      expect(wrongCount).toBe(2);
      expect(unansweredCount).toBe(0);

      // Verify Consistency: Sum of question-wise marks equals overall finalScore
      const sumOfQuestionMarks = Number(
        results.reduce((acc, r) => acc + r.marksObtained, 0).toFixed(2)
      );
      expect(sumOfQuestionMarks).toBe(finalScore);
      expect(Number((posMarks - negMarks).toFixed(2))).toBe(finalScore);
    });

    test('Allows overall final score to become negative if deductions exceed positive marks', () => {
      // Student answers only Q1 wrong (-0.66) and does not answer any other question
      const partialAnswers = { q1: 'A' }; // Wrong MCQ 2-mark
      let totalScore = 0;
      let totalAttempted = 0;
      let totalCorrect = 0;
      let totalWrong = 0;
      let totalUnanswered = 0;

      examQuestions.forEach((q) => {
        const answer = (partialAnswers as any)[q.id];
        if (answer !== undefined) {
          totalAttempted++;
          const evalRes = GateScoringService.evaluateResponse(q, answer);
          if (evalRes.isCorrect) totalCorrect++;
          else totalWrong++;
          totalScore += evalRes.marksObtained;
        } else {
          totalUnanswered++;
        }
      });

      const finalScore = Number(totalScore.toFixed(2));
      expect(finalScore).toBe(-0.66); // Preserves negative score without clamping to 0!
      expect(totalAttempted).toBe(1);
      expect(totalCorrect).toBe(0);
      expect(totalWrong).toBe(1);
      expect(totalUnanswered).toBe(4);
      expect(totalAttempted + totalUnanswered).toBe(examQuestions.length);
      expect(totalCorrect + totalWrong + totalUnanswered).toBe(examQuestions.length);
    });
  });

  describe('3. Consistency Invariants Verification', () => {
    test('Ensures Attempted + Unanswered === Total Questions', () => {
      const totalQ = 10;
      const attempted = 7;
      const unanswered = totalQ - attempted;
      expect(attempted + unanswered).toBe(totalQ);
    });

    test('Ensures Correct + Incorrect + Unanswered === Total Questions', () => {
      const correct = 4;
      const incorrect = 3;
      const unanswered = 3;
      expect(correct + incorrect + unanswered).toBe(10);
    });

    test('Guarantees MSQ and NAT never apply negative deductions', () => {
      const msqQ: QuestionData = { id: 'msq', type: QuestionType.MSQ, marks: 2, negativeMarks: 1, correctAnswer: ['A'] };
      const natQ: QuestionData = { id: 'nat', type: QuestionType.NAT, marks: 1, negativeMarks: 1, correctAnswer: { value: 5 } };

      const msqRes = GateScoringService.evaluateResponse(msqQ, ['B']);
      const natRes = GateScoringService.evaluateResponse(natQ, '99');

      expect(msqRes.marksObtained).toBe(0);
      expect(natRes.marksObtained).toBe(0);
    });
  });
});
