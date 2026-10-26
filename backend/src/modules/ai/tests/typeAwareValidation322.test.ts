import { JSONLImportService, normalizeDatasetRecord } from '../services/jsonlImportService';
import { QuestionType } from '@prisma/client';
import { AuthoritativeAnswerService } from '../../../services/authoritativeAnswerService';

describe('TYPE-AWARE VALIDATION REGRESSION SUITE (322 Review / 954 Verified)', () => {
  beforeAll(() => {
    AuthoritativeAnswerService.initAuthoritativeIndex();
  });

  describe('1. MCQ Validation Requirements', () => {
    it('requires selectable options and one valid correct answer', () => {
      const rec = normalizeDatasetRecord({
        questionId: 'TEST_MCQ_01',
        question: 'Standard single-choice MCQ',
        options: ['Alpha', 'Beta', 'Gamma', 'Delta'],
        correctAnswer: 'B',
        questionType: 'MCQ',
      });
      const result = JSONLImportService.normalizeOptionsAndAnswer(rec, QuestionType.MCQ);
      expect(result.type).toBe(QuestionType.MCQ);
      expect(result.correctAnswer).toEqual([1]);
      expect(result.needsReview).toBe(false);
    });

    it('marks MCQ as needsReview if answer is completely missing or N/A', () => {
      const missingAns = normalizeDatasetRecord({
        questionId: 'TEST_MCQ_MISSING',
        question: 'Missing answer MCQ',
        options: ['A', 'B', 'C', 'D'],
        correctAnswer: 'N/A',
        questionType: 'MCQ',
      });
      const result = JSONLImportService.normalizeOptionsAndAnswer(missingAns, QuestionType.MCQ);
      expect(result.needsReview).toBe(true);
      expect(result.correctAnswer).toEqual([]);
    });

    it('preserves authoritative letter when image is valid even if OCR options were incomplete', () => {
      const ocrFlawed = normalizeDatasetRecord({
        questionId: 'TEST_MCQ_IMAGE_FIRST',
        question: 'Image-First question with broken OCR options',
        options: [{ key: 'A', text: 'B.' }, { key: 'C', text: 'D.' }],
        correctAnswer: 'D',
        questionType: 'MCQ',
        imageUrl: 'visuals/Q_test.jpg',
        imageVerified: true,
      });
      const result = JSONLImportService.normalizeOptionsAndAnswer(ocrFlawed, QuestionType.MCQ);
      expect(result.needsReview).toBe(false);
      expect(result.correctAnswer).toEqual(['D']);
    });
  });

  describe('2. MSQ Validation Requirements', () => {
    it('allows multiple correct answers and maps them accurately', () => {
      const msqRec = normalizeDatasetRecord({
        questionId: 'TEST_MSQ_01',
        question: 'Standard MSQ question',
        options: ['Option A', 'Option B', 'Option C', 'Option D'],
        correctAnswer: 'A;C',
        questionType: 'MSQ',
      });
      const result = JSONLImportService.normalizeOptionsAndAnswer(msqRec, QuestionType.MSQ);
      expect(result.type).toBe(QuestionType.MSQ);
      expect(result.correctAnswer).toEqual([0, 2]);
      expect(result.needsReview).toBe(false);
    });

    it('does not classify multiple correct answers as ambiguous', () => {
      const allChoices = normalizeDatasetRecord({
        questionId: 'TEST_MSQ_ALL',
        question: 'MSQ with all 4 options correct',
        options: ['Option A', 'Option B', 'Option C', 'Option D'],
        correctAnswer: 'A;B;C;D',
        questionType: 'MSQ',
      });
      const result = JSONLImportService.normalizeOptionsAndAnswer(allChoices, QuestionType.MSQ);
      expect(result.type).toBe(QuestionType.MSQ);
      expect(result.correctAnswer).toEqual([0, 1, 2, 3]);
      expect(result.needsReview).toBe(false);
    });

    it('preserves raw multiple choices when OCR options are partial but image is verified', () => {
      const msqImageFirst = normalizeDatasetRecord({
        questionId: 'Q1337',
        question: 'MSQ Resource Allocation',
        options: [{ key: 'A', text: 'B.' }, { key: 'C', text: 'D. E.' }],
        correctAnswer: 'D;E',
        questionType: 'MSQ',
        imageUrl: 'visuals/Q1337_p444.jpg',
        imageVerified: true,
      });
      const result = JSONLImportService.normalizeOptionsAndAnswer(msqImageFirst, QuestionType.MSQ);
      expect(result.type).toBe(QuestionType.MSQ);
      expect(result.correctAnswer).toEqual(['D', 'E']);
      expect(result.needsReview).toBe(false);
    });
  });

  describe('3. NAT Validation Requirements', () => {
    it('allows empty options: [] and validates integer answer', () => {
      const natInt = normalizeDatasetRecord({
        questionId: 'Q0020',
        question: 'Average Memory Access Time',
        options: [],
        correctAnswer: '180',
        type: 'NAT',
      });
      const result = JSONLImportService.normalizeOptionsAndAnswer(natInt, QuestionType.NAT);
      expect(result.type).toBe(QuestionType.NAT);
      expect(result.options).toEqual([]);
      expect(result.correctAnswer).toEqual({ value: 180, min: 180, max: 180 });
      expect(result.needsReview).toBe(false);
    });

    it('allows decimal and float numerical answers', () => {
      const natDec = normalizeDatasetRecord({
        questionId: 'TEST_NAT_DEC',
        question: 'Float NAT test',
        options: [],
        correctAnswer: '33.33',
        type: 'NAT',
      });
      const result = JSONLImportService.normalizeOptionsAndAnswer(natDec, QuestionType.NAT);
      expect(result.type).toBe(QuestionType.NAT);
      expect(result.correctAnswer).toEqual({ value: 33.33, min: 33.33, max: 33.33 });
      expect(result.needsReview).toBe(false);
    });

    it('validates numerical range with colon (:)', () => {
      const natRange = normalizeDatasetRecord({
        questionId: 'TEST_NAT_RANGE_COLON',
        question: 'Range NAT test',
        options: [],
        correctAnswer: '25:28',
        type: 'NAT',
      });
      const result = JSONLImportService.normalizeOptionsAndAnswer(natRange, QuestionType.NAT);
      expect(result.type).toBe(QuestionType.NAT);
      expect(result.correctAnswer).toEqual({
        min: 25,
        max: 28,
        value: 26.5,
        range: { from: 25, to: 28 },
      });
      expect(result.needsReview).toBe(false);
    });

    it('validates numerical range with "to"', () => {
      const natRangeTo = normalizeDatasetRecord({
        questionId: 'TEST_NAT_RANGE_TO',
        question: 'Range with to test',
        options: [],
        correctAnswer: '0.502 to 0.504',
        type: 'NAT',
      });
      const result = JSONLImportService.normalizeOptionsAndAnswer(natRangeTo, QuestionType.NAT);
      expect(result.type).toBe(QuestionType.NAT);
      expect(result.correctAnswer.min).toBe(0.502);
      expect(result.correctAnswer.max).toBe(0.504);
      expect(result.needsReview).toBe(false);
    });

    it('validates dual-range semicolon separated NAT keys without flagging review', () => {
      const natDual = normalizeDatasetRecord({
        questionId: 'Q0075',
        question: 'Dual range NAT question',
        options: [],
        correctAnswer: '13.3:13.3;13.5:13.5',
        type: 'NAT',
      });
      const result = JSONLImportService.normalizeOptionsAndAnswer(natDual, QuestionType.NAT);
      expect(result.type).toBe(QuestionType.NAT);
      expect(result.correctAnswer.value).toBe(13.3);
      expect(result.needsReview).toBe(false);

      const natDual2 = normalizeDatasetRecord({
        questionId: 'Q0728',
        question: 'Another dual range NAT question',
        options: [],
        correctAnswer: '819 : 820 ; 205 : 205',
        type: 'NAT',
      });
      const result2 = JSONLImportService.normalizeOptionsAndAnswer(natDual2, QuestionType.NAT);
      expect(result2.type).toBe(QuestionType.NAT);
      expect(result2.correctAnswer.min).toBe(819);
      expect(result2.correctAnswer.max).toBe(820);
      expect(result2.needsReview).toBe(false);
    });
  });

  describe('4. The 5 Confirmed Question Types', () => {
    it('Q0270 is resolved authoritatively to MCQ', () => {
      const q = normalizeDatasetRecord({
        id: 'Q0270',
        questionId: 'Q0270',
        question: 'Confirmed MCQ',
        correctAnswer: 'A',
        imageUrl: 'visuals/Q0270_p115.jpg',
        imageVerified: true,
      });
      const result = JSONLImportService.normalizeOptionsAndAnswer(q, QuestionType.UNKNOWN);
      expect(result.type).toBe(QuestionType.MCQ);
      expect(result.needsReview).toBe(false);
    });

    it('Q0898 is resolved authoritatively to NAT', () => {
      const q = normalizeDatasetRecord({
        id: 'Q0898',
        questionId: 'Q0898',
        question: 'Confirmed NAT',
        correctAnswer: '33.33',
        imageUrl: 'visuals/Q0898_p319.jpg',
        imageVerified: true,
      });
      const result = JSONLImportService.normalizeOptionsAndAnswer(q, QuestionType.UNKNOWN);
      expect(result.type).toBe(QuestionType.NAT);
      expect(result.correctAnswer.value).toBe(33.33);
      expect(result.needsReview).toBe(false);
    });

    it('Q0976 is resolved authoritatively to MCQ', () => {
      const q = normalizeDatasetRecord({
        id: 'Q0976',
        questionId: 'Q0976',
        question: 'Confirmed MCQ',
        correctAnswer: 'B',
        imageUrl: 'visuals/Q0976_p339.jpg',
        imageVerified: true,
      });
      const result = JSONLImportService.normalizeOptionsAndAnswer(q, QuestionType.UNKNOWN);
      expect(result.type).toBe(QuestionType.MCQ);
      expect(result.needsReview).toBe(false);
    });

    it('Q1178 is resolved authoritatively to MCQ', () => {
      const q = normalizeDatasetRecord({
        id: 'Q1178',
        questionId: 'Q1178',
        question: 'Confirmed MCQ',
        correctAnswer: 'D',
        imageUrl: 'visuals/Q1178_p397.jpg',
        imageVerified: true,
      });
      const result = JSONLImportService.normalizeOptionsAndAnswer(q, QuestionType.UNKNOWN);
      expect(result.type).toBe(QuestionType.MCQ);
      expect(result.needsReview).toBe(false);
    });

    it('Q1242 is resolved authoritatively to NAT', () => {
      const q = normalizeDatasetRecord({
        id: 'Q1242',
        questionId: 'Q1242',
        question: 'Confirmed NAT',
        correctAnswer: '19',
        imageUrl: 'visuals/Q1242_p411.jpg',
        imageVerified: true,
      });
      const result = JSONLImportService.normalizeOptionsAndAnswer(q, QuestionType.UNKNOWN);
      expect(result.type).toBe(QuestionType.NAT);
      expect(result.correctAnswer.value).toBe(19);
      expect(result.needsReview).toBe(false);
    });
  });

  describe('5. Safety Rules: Missing Answers and Genuinely Unknown Types', () => {
    it('genuinely unknown question type without answer remains in needsReview', () => {
      const unk = normalizeDatasetRecord({
        questionId: 'Q_GENUINE_UNKNOWN',
        question: 'Unknown type test',
        questionType: 'UNKNOWN',
        options: [],
      });
      const result = JSONLImportService.normalizeOptionsAndAnswer(unk, QuestionType.UNKNOWN);
      expect(result.needsReview).toBe(true);
    });

    it('unanswered question in source (TBA / N/A) is never marked verified', () => {
      const unans = normalizeDatasetRecord({
        questionId: 'Q0183',
        question: 'Unanswered question in source',
        correctAnswer: 'N/A',
        questionType: 'FREE_RESPONSE',
      });
      const result = JSONLImportService.normalizeOptionsAndAnswer(unans, QuestionType.FREE_RESPONSE);
      expect(result.needsReview).toBe(true);
      expect(result.correctAnswer).toEqual([]);
    });
  });
});
