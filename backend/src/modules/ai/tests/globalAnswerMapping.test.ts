import { JSONLImportService, normalizeDatasetRecord } from '../services/jsonlImportService';
import { QuestionType, VerificationStatus } from '@prisma/client';
import AdmZip from 'adm-zip';
import { extractQuestionBankZipPackage } from '../../../services/zipExtractionService';

describe('GLOBAL ANSWER MAPPING REGRESSION SUITE', () => {
  it('1. MCQ A/B/C/D mapping', () => {
    const rec1 = normalizeDatasetRecord({
      questionId: 'Q_MCQ_1',
      question: 'MCQ Test 1',
      options: ['Option A', 'Option B', 'Option C', 'Option D'],
      correctAnswer: 'C',
      questionType: 'MCQ',
    });
    const norm1 = JSONLImportService.normalizeOptionsAndAnswer(rec1, QuestionType.MCQ);
    expect(norm1.correctAnswer).toEqual([2]);

    const rec2 = normalizeDatasetRecord({
      questionId: 'Q_MCQ_2',
      question: 'MCQ Test 2',
      options: [
        { key: 'A', text: 'Option A' },
        { key: 'B', text: 'Option B' },
        { key: 'C', text: 'Option C' },
      ],
      correct_answer: 'B',
      type: 'MCQ',
    });
    const norm2 = JSONLImportService.normalizeOptionsAndAnswer(rec2, QuestionType.MCQ);
    expect(norm2.correctAnswer).toEqual([1]);
  });

  it('2. MCQ numeric answer mapping', () => {
    const rec1 = normalizeDatasetRecord({
      questionId: 'Q_NUM_1',
      question: 'Numeric index test',
      options: ['Opt 0', 'Opt 1', 'Opt 2'],
      correctAnswer: 1,
      questionType: 'MCQ',
    });
    const norm1 = JSONLImportService.normalizeOptionsAndAnswer(rec1, QuestionType.MCQ);
    expect(norm1.correctAnswer).toEqual([1]);
  });

  it('3. MSQ multiple answers mapping (A,B / A;C / array)', () => {
    const rec1 = normalizeDatasetRecord({
      questionId: 'Q_MSQ_1',
      question: 'MSQ Test 1',
      options: ['Opt A', 'Opt B', 'Opt C', 'Opt D'],
      correctAnswer: 'A, C',
      questionType: 'MSQ',
    });
    const norm1 = JSONLImportService.normalizeOptionsAndAnswer(rec1, QuestionType.MSQ);
    expect(norm1.correctAnswer).toEqual([0, 2]);

    const rec2 = normalizeDatasetRecord({
      questionId: 'Q_MSQ_2',
      question: 'MSQ Test 2',
      options: ['Opt A', 'Opt B', 'Opt C', 'Opt D'],
      answer: 'A;B;D',
      questionType: 'MSQ',
    });
    const norm2 = JSONLImportService.normalizeOptionsAndAnswer(rec2, QuestionType.MSQ);
    expect(norm2.correctAnswer).toEqual([0, 1, 3]);

    const rec3 = normalizeDatasetRecord({
      questionId: 'Q_MSQ_3',
      question: 'MSQ Test 3',
      options: ['Opt A', 'Opt B', 'Opt C', 'Opt D'],
      correctAnswer: ['B', 'D'],
      questionType: 'MSQ',
    });
    const norm3 = JSONLImportService.normalizeOptionsAndAnswer(rec3, QuestionType.MSQ);
    expect(norm3.correctAnswer).toEqual([1, 3]);
  });

  it('4. NAT exact number mapping', () => {
    const rec1 = normalizeDatasetRecord({
      questionId: 'Q_NAT_1',
      question: 'NAT float test',
      options: [],
      correctAnswer: 42.5,
      questionType: 'NAT',
    });
    const norm1 = JSONLImportService.normalizeOptionsAndAnswer(rec1, QuestionType.NAT);
    expect(norm1.correctAnswer).toEqual({ value: 42.5 });

    const rec2 = normalizeDatasetRecord({
      questionId: 'Q_NAT_2',
      question: 'NAT string test',
      options: [],
      answer: '100',
      questionType: 'NAT',
    });
    const norm2 = JSONLImportService.normalizeOptionsAndAnswer(rec2, QuestionType.NAT);
    expect(norm2.correctAnswer).toEqual({ value: 100 });
  });

  it('5. NAT range mapping (preserving min and max)', () => {
    const rec1 = normalizeDatasetRecord({
      questionId: 'Q_NAT_R1',
      question: 'NAT Range colon',
      options: [],
      correctAnswer: '25:28',
      questionType: 'NAT',
    });
    const norm1 = JSONLImportService.normalizeOptionsAndAnswer(rec1, QuestionType.NAT);
    expect(norm1.correctAnswer).toEqual({ min: 25, max: 28 });

    const rec2 = normalizeDatasetRecord({
      questionId: 'Q_NAT_R2',
      question: 'NAT Range text to',
      options: [],
      correctAnswer: '10.5 to 15.5',
      questionType: 'NAT',
    });
    const norm2 = JSONLImportService.normalizeOptionsAndAnswer(rec2, QuestionType.NAT);
    expect(norm2.correctAnswer).toEqual({ min: 10.5, max: 15.5 });

    const rec3 = normalizeDatasetRecord({
      questionId: 'Q_NAT_R3',
      question: 'NAT Range object',
      options: [],
      correctAnswer: { min: 5, max: 10 },
      questionType: 'NAT',
    });
    const norm3 = JSONLImportService.normalizeOptionsAndAnswer(rec3, QuestionType.NAT);
    expect(norm3.correctAnswer).toEqual({ min: 5, max: 10 });
  });

  it('6. N/A and missing answer rules', () => {
    const rec1 = normalizeDatasetRecord({
      questionId: 'Q_NA_1',
      question: 'N/A Test',
      options: ['A', 'B'],
      correctAnswer: 'N/A',
      questionType: 'MCQ',
    });
    const norm1 = JSONLImportService.normalizeOptionsAndAnswer(rec1, QuestionType.MCQ);
    expect(norm1.correctAnswer).toEqual([]);
    expect(norm1.needsReview).toBe(true);
  });

  it('7. Answer-key / Question-ID exact matching', () => {
    const zip = new AdmZip();
    const dataset = [
      { id: 'Q_AK1', question: 'Q1', options: ['A', 'B', 'C'], type: 'MCQ' },
      { id: 'Q_AK2', question: 'Q2', options: [], type: 'NAT' },
    ];
    const answerKeys = {
      Q_AK1: 'C',
      Q_AK2: '15:20',
    };

    zip.addFile('questions.json', Buffer.from(JSON.stringify(dataset, null, 2), 'utf-8'));
    zip.addFile('answer_key.json', Buffer.from(JSON.stringify(answerKeys, null, 2), 'utf-8'));

    const pkg = extractQuestionBankZipPackage(zip.toBuffer());
    expect(pkg.answerKeyMap.get('Q_AK1')).toBe('C');
    expect(pkg.answerKeyMap.get('Q_AK2')).toBe('15:20');

    const preview = JSONLImportService.parseAndValidateJSONL(
      pkg.jsonlEntries[0].text,
      pkg.jsonlEntries[0].fileName,
      pkg.figureEntries,
      pkg.answerKeyMap
    );

    expect(preview.validRecords[0].correctAnswer).toBe('C');
    expect(preview.validRecords[1].correctAnswer).toBe('15:20');

    const norm1 = JSONLImportService.normalizeOptionsAndAnswer(preview.validRecords[0], QuestionType.MCQ);
    expect(norm1.correctAnswer).toEqual([2]);

    const norm2 = JSONLImportService.normalizeOptionsAndAnswer(preview.validRecords[1], QuestionType.NAT);
    expect(norm2.correctAnswer).toEqual({ min: 15, max: 20 });
  });

  it('8. Re-import / idempotency validation', () => {
    const rec1 = normalizeDatasetRecord({
      questionId: 'Q_IDEM_1',
      question: 'Idempotency Test',
      options: ['A', 'B'],
      correctAnswer: 'A',
      questionType: 'MCQ',
    });
    const norm1 = JSONLImportService.normalizeOptionsAndAnswer(rec1, QuestionType.MCQ);
    const norm2 = JSONLImportService.normalizeOptionsAndAnswer(rec1, QuestionType.MCQ);

    expect(norm1.correctAnswer).toEqual(norm2.correctAnswer);
    expect(norm1.options).toEqual(norm2.options);
  });
});
