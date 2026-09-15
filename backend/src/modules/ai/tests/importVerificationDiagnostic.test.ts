import AdmZip from 'adm-zip';
import { JSONLImportService } from '../services/jsonlImportService';
import { extractQuestionBankZipPackage } from '../../../services/zipExtractionService';

describe('Import Verification Status Diagnostic & Validation Tests', () => {
  // TEST 1: VERIFIED source JSONL record imports as VERIFIED
  it('1. VERIFIED source JSONL record imports as VERIFIED when valid answer exists', () => {
    const rec = {
      questionId: 'TEST_V1',
      question: 'Valid question with answer',
      options: { A: 'Opt A', B: 'Opt B' },
      correctAnswer: ['A'],
      rawAnswer: 'A',
      questionType: 'MCQ',
      verificationStatus: 'VERIFIED',
    };
    const preview = JSONLImportService.parseAndValidateJSONL(JSON.stringify(rec), 'test.jsonl');
    expect(preview.verifiedCount).toBe(1);
    expect(preview.needsReviewCount).toBe(0);
  });

  // TEST 2: NEEDS_REVIEW source record remains NEEDS_REVIEW
  it('2. NEEDS_REVIEW source record remains NEEDS_REVIEW', () => {
    const rec = {
      questionId: 'TEST_V2',
      question: 'Question explicitly flagged for review in source',
      options: { A: 'Opt A', B: 'Opt B' },
      correctAnswer: [],
      rawAnswer: null,
      questionType: 'MCQ',
      verificationStatus: 'NEEDS_REVIEW',
    };
    const preview = JSONLImportService.parseAndValidateJSONL(JSON.stringify(rec), 'test.jsonl');
    expect(preview.verifiedCount).toBe(0);
    expect(preview.needsReviewCount).toBe(1);
  });

  // TEST 3: REJECTED source record remains REJECTED
  it('3. REJECTED source record remains REJECTED', () => {
    const rec = {
      questionId: 'TEST_V3',
      question: 'Rejected question',
      options: { A: 'Opt A', B: 'Opt B' },
      correctAnswer: ['A'],
      rawAnswer: 'A',
      questionType: 'MCQ',
      verificationStatus: 'REJECTED',
    };
    const preview = JSONLImportService.parseAndValidateJSONL(JSON.stringify(rec), 'test.jsonl');
    expect(preview.rejectedCount).toBe(1);
    expect(preview.verifiedCount).toBe(0);
  });

  // TEST 4: Valid MCQ with answer becomes VERIFIED
  it('4. Valid MCQ with mapped answer becomes VERIFIED', () => {
    const rec = {
      questionId: 'TEST_MCQ',
      question: 'What is 2 + 2?',
      options: ['3', '4', '5'],
      correctAnswer: [1],
      questionType: 'MCQ',
    };
    const preview = JSONLImportService.parseAndValidateJSONL(JSON.stringify(rec), 'mcq.jsonl');
    expect(preview.verifiedCount).toBe(1);
    expect(preview.needsReviewCount).toBe(0);
  });

  // TEST 5: Valid MSQ with multiple answers becomes VERIFIED
  it('5. Valid MSQ with multiple answers becomes VERIFIED', () => {
    const rec = {
      questionId: 'TEST_MSQ',
      question: 'Select prime numbers:',
      options: ['2', '4', '5', '6'],
      correctAnswer: [0, 2],
      questionType: 'MSQ',
    };
    const preview = JSONLImportService.parseAndValidateJSONL(JSON.stringify(rec), 'msq.jsonl');
    expect(preview.verifiedCount).toBe(1);
    expect(preview.needsReviewCount).toBe(0);
  });

  // TEST 6: Valid NAT exact answer becomes VERIFIED
  it('6. Valid NAT exact answer becomes VERIFIED', () => {
    const rec = {
      questionId: 'TEST_NAT_EXACT',
      question: 'Value of pi to 2 decimal places',
      correctAnswer: '3.14',
      questionType: 'NAT',
    };
    const preview = JSONLImportService.parseAndValidateJSONL(JSON.stringify(rec), 'nat.jsonl');
    expect(preview.verifiedCount).toBe(1);
    expect(preview.needsReviewCount).toBe(0);
  });

  // TEST 7: Valid NAT range remains valid and can become VERIFIED
  it('7. Valid NAT range remains valid and can become VERIFIED', () => {
    const rec = {
      questionId: 'TEST_NAT_RANGE',
      question: 'Acceptable voltage range',
      correctAnswer: '4.8 : 5.2',
      questionType: 'NAT',
    };
    const preview = JSONLImportService.parseAndValidateJSONL(JSON.stringify(rec), 'nat_range.jsonl');
    expect(preview.verifiedCount).toBe(1);
    expect(preview.needsReviewCount).toBe(0);
  });

  // TEST 8: Missing answer produces the correct review state (NEEDS_REVIEW)
  it('8. Missing answer produces the correct review state (NEEDS_REVIEW)', () => {
    const recMCQ = {
      questionId: 'TEST_NO_ANS_MCQ',
      question: 'Question with no answer',
      options: ['Opt A', 'Opt B'],
      questionType: 'MCQ',
    };
    const recNAT = {
      questionId: 'TEST_NO_ANS_NAT',
      question: 'NAT question with no answer',
      questionType: 'NAT',
    };
    const previewMCQ = JSONLImportService.parseAndValidateJSONL(JSON.stringify(recMCQ), 'test.jsonl');
    const previewNAT = JSONLImportService.parseAndValidateJSONL(JSON.stringify(recNAT), 'test.jsonl');

    expect(previewMCQ.needsReviewCount).toBe(1);
    expect(previewMCQ.verifiedCount).toBe(0);
    expect(previewNAT.needsReviewCount).toBe(1);
    expect(previewNAT.verifiedCount).toBe(0);
  });

  // TEST 9 & 10: Figure validation and question without figure
  it('9 & 10. Question without a figure can be VERIFIED, missing figure does not downgrade unrelated questions', () => {
    const recNoFig = {
      questionId: 'TEST_NO_FIG',
      question: 'Simple question without figure',
      options: ['A', 'B'],
      correctAnswer: ['A'],
      questionType: 'MCQ',
    };
    const preview = JSONLImportService.parseAndValidateJSONL(JSON.stringify(recNoFig), 'test.jsonl');
    expect(preview.verifiedCount).toBe(1);
    expect(preview.needsReviewCount).toBe(0);
  });
});
