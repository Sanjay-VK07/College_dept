import { GateScoringService, QuestionData } from '../services/gateScoringService';
import { QuestionType } from '@prisma/client';
import { prisma } from '../config/prisma';
import { compareNatAnswer } from '../modules/ai/types/gateQuestionTypes';

describe('Comprehensive NAT Scoring & Display Verification', () => {
  describe('1. Multi-Range NAT Questions (V3_1.5.50 and V3_3.21.43)', () => {
    const q1_5_50: QuestionData = {
      id: 'cf8cd10e-1097-4456-ac35-3d39d31c0a75',
      type: QuestionType.NAT,
      marks: 1.0,
      negativeMarks: 0.0,
      correctAnswer: {
        value: 13.3,
        min: 13.3,
        max: 13.3,
        range: { from: 13.3, to: 13.3 },
        acceptedRanges: [
          { min: 13.3, max: 13.3, range: { from: 13.3, to: 13.3 }, value: 13.3 },
          { min: 13.5, max: 13.5, range: { from: 13.5, to: 13.5 }, value: 13.5 }
        ],
        rawRange: '13.3:13.3; 13.5:13.5'
      }
    };

    test('V3_1.5.50 accepts both 13.3 and alternate 13.5', () => {
      expect(GateScoringService.evaluateResponse(q1_5_50, '13.3')).toEqual({ isCorrect: true, marksObtained: 1.0 });
      expect(GateScoringService.evaluateResponse(q1_5_50, 13.3)).toEqual({ isCorrect: true, marksObtained: 1.0 });
      expect(GateScoringService.evaluateResponse(q1_5_50, '13.5')).toEqual({ isCorrect: true, marksObtained: 1.0 });
      expect(GateScoringService.evaluateResponse(q1_5_50, 13.5)).toEqual({ isCorrect: true, marksObtained: 1.0 });
    });

    test('V3_1.5.50 rejects values outside the two accepted answers with zero negative marks', () => {
      expect(GateScoringService.evaluateResponse(q1_5_50, '13.4')).toEqual({ isCorrect: false, marksObtained: 0.0 });
      expect(GateScoringService.evaluateResponse(q1_5_50, '13.2')).toEqual({ isCorrect: false, marksObtained: 0.0 });
      expect(GateScoringService.evaluateResponse(q1_5_50, '13.6')).toEqual({ isCorrect: false, marksObtained: 0.0 });
    });

    const q3_21_43: QuestionData = {
      id: '63e926ff-1301-499a-b89c-c1bd81ff6676',
      type: QuestionType.NAT,
      marks: 1.0,
      negativeMarks: 0.0,
      correctAnswer: {
        value: 819.5,
        min: 819,
        max: 820,
        range: { from: 819, to: 820 },
        acceptedRanges: [
          { min: 819, max: 820, range: { from: 819, to: 820 }, value: 819.5 },
          { min: 205, max: 205, range: { from: 205, to: 205 }, value: 205 }
        ],
        rawRange: '819 : 820 ; 205 : 205'
      }
    };

    test('V3_3.21.43 accepts range [819, 820] and alternate scalar 205', () => {
      expect(GateScoringService.evaluateResponse(q3_21_43, '819')).toEqual({ isCorrect: true, marksObtained: 1.0 });
      expect(GateScoringService.evaluateResponse(q3_21_43, '819.5')).toEqual({ isCorrect: true, marksObtained: 1.0 });
      expect(GateScoringService.evaluateResponse(q3_21_43, '820')).toEqual({ isCorrect: true, marksObtained: 1.0 });
      expect(GateScoringService.evaluateResponse(q3_21_43, '205')).toEqual({ isCorrect: true, marksObtained: 1.0 });
    });

    test('V3_3.21.43 rejects values outside criteria with zero negative marks', () => {
      expect(GateScoringService.evaluateResponse(q3_21_43, '818.9')).toEqual({ isCorrect: false, marksObtained: 0.0 });
      expect(GateScoringService.evaluateResponse(q3_21_43, '820.1')).toEqual({ isCorrect: false, marksObtained: 0.0 });
      expect(GateScoringService.evaluateResponse(q3_21_43, '204')).toEqual({ isCorrect: false, marksObtained: 0.0 });
      expect(GateScoringService.evaluateResponse(q3_21_43, '206')).toEqual({ isCorrect: false, marksObtained: 0.0 });
    });
  });

  describe('2. Fixed Missing NAT Range Questions (V3_1.24.33 and V3_5.23.36)', () => {
    const q1_24_33: QuestionData = {
      id: 'fc59827d-d290-40b3-ae95-7325dba07a7f',
      type: QuestionType.NAT,
      marks: 1.0,
      negativeMarks: 0.0,
      correctAnswer: {
        value: 260.7,
        min: 260.2,
        max: 261.2,
        range: { from: 260.2, to: 261.2 },
        acceptedRanges: [
          { min: 260.2, max: 261.2, range: { from: 260.2, to: 261.2 }, value: 260.7 }
        ],
        rawRange: '260.20:261.20'
      }
    };

    test('V3_1.24.33 accepts values within [260.20, 261.20]', () => {
      expect(GateScoringService.evaluateResponse(q1_24_33, '260.20')).toEqual({ isCorrect: true, marksObtained: 1.0 });
      expect(GateScoringService.evaluateResponse(q1_24_33, '260.70')).toEqual({ isCorrect: true, marksObtained: 1.0 });
      expect(GateScoringService.evaluateResponse(q1_24_33, '261.20')).toEqual({ isCorrect: true, marksObtained: 1.0 });
    });

    test('V3_1.24.33 rejects values outside range', () => {
      expect(GateScoringService.evaluateResponse(q1_24_33, '260.10')).toEqual({ isCorrect: false, marksObtained: 0.0 });
      expect(GateScoringService.evaluateResponse(q1_24_33, '261.30')).toEqual({ isCorrect: false, marksObtained: 0.0 });
    });

    const q5_23_36: QuestionData = {
      id: 'c78e542c-5763-4d06-8a1f-2909193be52a',
      type: QuestionType.NAT,
      marks: 1.0,
      negativeMarks: 0.0,
      correctAnswer: {
        value: 5.255,
        min: 5.25,
        max: 5.26,
        range: { from: 5.25, to: 5.26 },
        acceptedRanges: [
          { min: 5.25, max: 5.26, range: { from: 5.25, to: 5.26 }, value: 5.255 }
        ],
        rawRange: '5.25:5.26'
      }
    };

    test('V3_5.23.36 accepts values within [5.25, 5.26]', () => {
      expect(GateScoringService.evaluateResponse(q5_23_36, '5.25')).toEqual({ isCorrect: true, marksObtained: 1.0 });
      expect(GateScoringService.evaluateResponse(q5_23_36, '5.255')).toEqual({ isCorrect: true, marksObtained: 1.0 });
      expect(GateScoringService.evaluateResponse(q5_23_36, '5.26')).toEqual({ isCorrect: true, marksObtained: 1.0 });
    });

    test('V3_5.23.36 rejects values outside range', () => {
      expect(GateScoringService.evaluateResponse(q5_23_36, '5.24')).toEqual({ isCorrect: false, marksObtained: 0.0 });
      expect(GateScoringService.evaluateResponse(q5_23_36, '5.27')).toEqual({ isCorrect: false, marksObtained: 0.0 });
    });
  });

  describe('3. Fixed Truncated Range Questions (V3_1.24.17, V3_1.24.22, V3_1.24.24)', () => {
    const q1_24_17: QuestionData = {
      id: '53b8bf4a-e4fb-45a3-80a7-3eeb41d7224a',
      type: QuestionType.NAT,
      marks: 1.0,
      negativeMarks: 0.0,
      correctAnswer: {
        value: 1.55,
        min: 1.5,
        max: 1.6,
        range: { from: 1.5, to: 1.6 },
        acceptedRanges: [{ min: 1.5, max: 1.6, range: { from: 1.5, to: 1.6 }, value: 1.55 }],
        rawRange: '1.50 : 1.60'
      }
    };

    test('V3_1.24.17 accepts [1.50, 1.60]', () => {
      expect(GateScoringService.evaluateResponse(q1_24_17, '1.50')).toEqual({ isCorrect: true, marksObtained: 1.0 });
      expect(GateScoringService.evaluateResponse(q1_24_17, '1.55')).toEqual({ isCorrect: true, marksObtained: 1.0 });
      expect(GateScoringService.evaluateResponse(q1_24_17, '1.60')).toEqual({ isCorrect: true, marksObtained: 1.0 });
      expect(GateScoringService.evaluateResponse(q1_24_17, '1.49')).toEqual({ isCorrect: false, marksObtained: 0.0 });
      expect(GateScoringService.evaluateResponse(q1_24_17, '1.61')).toEqual({ isCorrect: false, marksObtained: 0.0 });
    });

    const q1_24_22: QuestionData = {
      id: '748d0eb4-313c-423c-a927-51800b08efa8',
      type: QuestionType.NAT,
      marks: 1.0,
      negativeMarks: 0.0,
      correctAnswer: {
        value: 33.5,
        min: 33.0,
        max: 34.0,
        range: { from: 33.0, to: 34.0 },
        acceptedRanges: [{ min: 33.0, max: 34.0, range: { from: 33.0, to: 34.0 }, value: 33.5 }],
        rawRange: '33.0 : 34.0'
      }
    };

    test('V3_1.24.22 accepts [33.0, 34.0]', () => {
      expect(GateScoringService.evaluateResponse(q1_24_22, '33.0')).toEqual({ isCorrect: true, marksObtained: 1.0 });
      expect(GateScoringService.evaluateResponse(q1_24_22, '33.5')).toEqual({ isCorrect: true, marksObtained: 1.0 });
      expect(GateScoringService.evaluateResponse(q1_24_22, '34.0')).toEqual({ isCorrect: true, marksObtained: 1.0 });
      expect(GateScoringService.evaluateResponse(q1_24_22, '32.9')).toEqual({ isCorrect: false, marksObtained: 0.0 });
      expect(GateScoringService.evaluateResponse(q1_24_22, '34.1')).toEqual({ isCorrect: false, marksObtained: 0.0 });
    });

    const q1_24_24: QuestionData = {
      id: '04ba5a02-d97a-42be-b127-41edbe56aecf',
      type: QuestionType.NAT,
      marks: 1.0,
      negativeMarks: 0.0,
      correctAnswer: {
        value: 1.505,
        min: 1.50,
        max: 1.51,
        range: { from: 1.50, to: 1.51 },
        acceptedRanges: [{ min: 1.50, max: 1.51, range: { from: 1.50, to: 1.51 }, value: 1.505 }],
        rawRange: '1.50 : 1.51'
      }
    };

    test('V3_1.24.24 accepts [1.50, 1.51]', () => {
      expect(GateScoringService.evaluateResponse(q1_24_24, '1.50')).toEqual({ isCorrect: true, marksObtained: 1.0 });
      expect(GateScoringService.evaluateResponse(q1_24_24, '1.505')).toEqual({ isCorrect: true, marksObtained: 1.0 });
      expect(GateScoringService.evaluateResponse(q1_24_24, '1.51')).toEqual({ isCorrect: true, marksObtained: 1.0 });
      expect(GateScoringService.evaluateResponse(q1_24_24, '1.49')).toEqual({ isCorrect: false, marksObtained: 0.0 });
      expect(GateScoringService.evaluateResponse(q1_24_24, '1.52')).toEqual({ isCorrect: false, marksObtained: 0.0 });
    });
  });

  describe('4. Frontend compareNatAnswer Accuracy', () => {
    test('compareNatAnswer matches multi-range acceptedRanges', () => {
      const ca = {
        value: 13.3,
        acceptedRanges: [
          { min: 13.3, max: 13.3 },
          { min: 13.5, max: 13.5 }
        ]
      };
      expect(compareNatAnswer('13.3', ca)).toBe(true);
      expect(compareNatAnswer('13.5', ca)).toBe(true);
      expect(compareNatAnswer('13.4', ca)).toBe(false);
    });

    test('compareNatAnswer matches range [819, 820] or 205', () => {
      const ca = {
        value: 819.5,
        acceptedRanges: [
          { min: 819, max: 820 },
          { min: 205, max: 205 }
        ]
      };
      expect(compareNatAnswer('819', ca)).toBe(true);
      expect(compareNatAnswer('819.8', ca)).toBe(true);
      expect(compareNatAnswer('820', ca)).toBe(true);
      expect(compareNatAnswer('205', ca)).toBe(true);
      expect(compareNatAnswer('204', ca)).toBe(false);
    });
  });

  describe('5. Database Integrity & Zero Regressions', () => {
    test('Total questions in DB remains 2,386 authentic questions', async () => {
      const count = await prisma.question.count({
        where: { customId: { not: null } }
      });
      expect(count).toBe(2386);
    });

    test('NAT question count remains 383', async () => {
      const count = await prisma.question.count({
        where: { customId: { not: null }, type: QuestionType.NAT }
      });
      expect(count).toBe(383);
    });

    test('MCQ question count remains 1,836', async () => {
      const count = await prisma.question.count({
        where: { customId: { not: null }, type: QuestionType.MCQ }
      });
      expect(count).toBe(1836);
    });

    test('MSQ question count remains 167', async () => {
      const count = await prisma.question.count({
        where: { customId: { not: null }, type: QuestionType.MSQ }
      });
      expect(count).toBe(167);
    });
  });
});
