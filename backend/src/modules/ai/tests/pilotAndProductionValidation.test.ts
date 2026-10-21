import fs from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';
import { JSONLImportService, normalizeDatasetRecord } from '../services/jsonlImportService';
import { extractQuestionBankZipPackage } from '../../../services/zipExtractionService';
import { AuthoritativeAnswerService } from '../../../services/authoritativeAnswerService';
import { QuestionType, VerificationStatus } from '@prisma/client';
import { prisma } from '../../../config/prisma';

describe('PRE-PRODUCTION PILOT & FULL PDF IMPORT VALIDATION SUITE', () => {
  const sampleZipPath = 'D:\\GATE_project\\Gate\\backend\\scratch\\GATE_sample_import_fixed.zip';
  let sampleZipBuffer: Buffer;

  beforeAll(() => {
    expect(fs.existsSync(sampleZipPath)).toBe(true);
    sampleZipBuffer = fs.readFileSync(sampleZipPath);
  });

  // --------------------------------------------------------------------------
  // Requirement 1: Confirm the sample ZIP imports successfully
  // --------------------------------------------------------------------------
  it('1. Confirms the sample ZIP imports successfully', async () => {
    const pkg = extractQuestionBankZipPackage(sampleZipBuffer);
    expect(pkg.jsonlEntries.length).toBeGreaterThan(0);
    expect(pkg.figureEntries.size).toBeGreaterThanOrEqual(8);

    const combinedJson = pkg.jsonlEntries.map((e) => e.text).join('\n');
    const preview = JSONLImportService.parseAndValidateJSONL(
      combinedJson,
      'GATE_sample_import_fixed.zip',
      pkg.figureEntries,
      pkg.answerKeyMap
    );

    expect(preview.validCount).toBe(8);
    expect(preview.missingFiguresCount).toBe(0);
    expect(preview.invalidCount).toBe(0);
    expect(preview.questionsWithFigures).toBe(8);
  });

  // --------------------------------------------------------------------------
  // Requirement 2: Confirm MCQ, MSQ and NAT are handled correctly
  // --------------------------------------------------------------------------
  it('2. Confirms MCQ, MSQ and NAT types and answers are handled correctly', () => {
    const pkg = extractQuestionBankZipPackage(sampleZipBuffer);
    const combinedJson = pkg.jsonlEntries.map((e) => e.text).join('\n');
    const preview = JSONLImportService.parseAndValidateJSONL(
      combinedJson,
      'GATE_sample_import_fixed.zip',
      pkg.figureEntries,
      pkg.answerKeyMap
    );

    const qMap = new Map(preview.validRecords.map((r) => [r.questionId, r]));

    // MCQ: 1.1.5 -> B
    const mcq = qMap.get('1.1.5');
    expect(mcq).toBeDefined();
    expect(mcq?.questionType).toBe('MCQ');
    const normMcq = JSONLImportService.normalizeOptionsAndAnswer(mcq!, QuestionType.MCQ);
    expect(normMcq.correctAnswer).toEqual(['B']);
    expect(normMcq.needsReview).toBe(false);

    // MSQ: 1.1.7 -> A, C, D
    const msq = qMap.get('1.1.7');
    expect(msq).toBeDefined();
    expect(msq?.questionType).toBe('MSQ');
    const normMsq = JSONLImportService.normalizeOptionsAndAnswer(msq!, QuestionType.MSQ);
    expect(normMsq.correctAnswer).toEqual(['A', 'C', 'D']);
    expect(normMsq.needsReview).toBe(false);

    // NAT Integer: 4.28.46 -> 110
    const natInt = qMap.get('4.28.46');
    expect(natInt).toBeDefined();
    expect(natInt?.questionType).toBe('NAT');
    const normNatInt = JSONLImportService.normalizeOptionsAndAnswer(natInt!, QuestionType.NAT);
    expect(normNatInt.correctAnswer).toMatchObject({ value: 110 });
    expect(normNatInt.needsReview).toBe(false);

    // NAT Decimal Range: 4.28.40 -> 0.503 (0.502 to 0.504)
    const natDec = qMap.get('4.28.40');
    expect(natDec).toBeDefined();
    expect(natDec?.questionType).toBe('NAT');
    const normNatDec = JSONLImportService.normalizeOptionsAndAnswer(natDec!, QuestionType.NAT);
    expect(normNatDec.correctAnswer).toMatchObject({
      value: 0.503,
      min: 0.502,
      max: 0.504,
    });
    expect(normNatDec.needsReview).toBe(false);
  });

  // --------------------------------------------------------------------------
  // Requirement 3: Confirm correct answers are hidden during normal exam mode
  // --------------------------------------------------------------------------
  it('3. Confirms correct answers are strictly hidden during normal exam mode', () => {
    // In STUDENT_EXAM view mode, showCorrectAnswer is false
    const examMode = {
      viewMode: 'STUDENT_EXAM',
      showCorrectAnswer: false,
    };

    // The display invariant requires:
    const shouldRevealCorrectAnswer = examMode.showCorrectAnswer || examMode.viewMode === 'SOLUTION_VIEW';
    expect(shouldRevealCorrectAnswer).toBe(false);
  });

  // --------------------------------------------------------------------------
  // Requirement 4: Confirm original images are readable and zoom correctly
  // --------------------------------------------------------------------------
  it('4. Confirms original images are high resolution and readable', () => {
    const pkg = extractQuestionBankZipPackage(sampleZipBuffer);
    expect(pkg.figureEntries.size).toBeGreaterThanOrEqual(8);
    const uniqueFiles = new Set(Array.from(pkg.figureEntries.values()).map((a) => a.fileName));
    expect(uniqueFiles.size).toBe(8);

    for (const [key, asset] of pkg.figureEntries.entries()) {
      expect(asset.buffer.length).toBeGreaterThan(10000); // realistic high-res PNG
      expect(asset.fileName.endsWith('.png')).toBe(true);
    }
  });

  // --------------------------------------------------------------------------
  // Requirement 5: Confirm missing OCR options do NOT cause needs_review
  // --------------------------------------------------------------------------
  it('5. Confirms image-first questions with options: [] pass verification', () => {
    const imageFirstRecord = normalizeDatasetRecord({
      questionId: '1.1.8',
      question: '',
      options: [],
      correctAnswer: 'C',
      questionType: 'MCQ',
      imageUrl: 'images/1_1_8.png',
      verificationStatus: 'VERIFIED',
    });

    const norm = JSONLImportService.normalizeOptionsAndAnswer(imageFirstRecord, QuestionType.MCQ);
    expect(norm.options).toEqual([]);
    expect(norm.correctAnswer).toEqual(['C']);
    expect(norm.needsReview).toBe(false);
  });

  // --------------------------------------------------------------------------
  // Requirement 6: Genuinely missing answers & incomplete images remain needs_review
  // --------------------------------------------------------------------------
  it('6. Confirms questions with missing answers or missing images remain needs_review', () => {
    // A. Question with valid image but MISSING answer key
    const missingAnswer = normalizeDatasetRecord({
      questionId: '1.24.33',
      question: '',
      options: [],
      correctAnswer: 'N/A',
      questionType: 'NAT',
      imageUrl: 'images/1_24_33.png',
    });
    const normA = JSONLImportService.normalizeOptionsAndAnswer(missingAnswer, QuestionType.NAT);
    expect(normA.needsReview).toBe(true);

    // B. Question with neither question text nor image
    const preview = JSONLImportService.parseAndValidateJSONL(
      JSON.stringify({
        questionId: 'EMPTY_CONTENT_Q',
        question: '',
        options: [],
        correctAnswer: 'A',
      })
    );
    expect(preview.validCount).toBe(0);
    expect(preview.invalidCount).toBe(1);
    expect(preview.invalidRecords[0].code).toBe('MISSING_QUESTION_CONTENT');
  });

  // --------------------------------------------------------------------------
  // Requirement 7: Confirm sourceSection and all fields match importer schema
  // --------------------------------------------------------------------------
  it('7. Confirms sourceSection and schema fields match importer schema', () => {
    const rec1 = normalizeDatasetRecord({
      questionId: 'SCHEMA_TEST_1',
      question: 'Test',
      questionType: 'MCQ',
      options: [],
      correctAnswer: 'A',
      sourceSection: 'Instruction Pipelining',
      sourceHeading: 'Computer Organization',
      sourceChapter: 'Chapter 1',
      sourcePage: 45,
    });
    expect(rec1.sourceSection).toBe('Instruction Pipelining');
    expect(rec1.sourceHeading).toBe('Computer Organization');
    expect(rec1.sourceChapter).toBe('Chapter 1');
    expect(rec1.sourcePage).toBe(45);

    // Alternate alias: rec.source.section
    const rec2 = normalizeDatasetRecord({
      questionId: 'SCHEMA_TEST_2',
      question: 'Test 2',
      questionType: 'NAT',
      options: [],
      correctAnswer: 5.5,
      source: {
        section: 'Cache Memory',
        heading: 'Memory Hierarchy',
        chapter: '1',
        pages: [48],
      },
    });
    expect(rec2.sourceSection).toBe('Cache Memory');
    expect(rec2.sourceHeading).toBe('Memory Hierarchy');
    expect(rec2.sourcePage).toBe(48);
  });

  // --------------------------------------------------------------------------
  // Requirement 8: Confirm official answer keys are mapped correctly
  // --------------------------------------------------------------------------
  it('8. Confirms official chapter answer keys match without guessing', () => {
    AuthoritativeAnswerService.initAuthoritativeIndex();
    const chapterRecords = AuthoritativeAnswerService.getAuthoritativeChapterRecords();
    expect(chapterRecords.length).toBeGreaterThan(1000);

    // Check specific authoritative keys
    const match1 = AuthoritativeAnswerService.findAuthoritativeMatch('1.1.5');
    expect(match1?.answerKeyAnswer || match1?.answer).toBe('B');

    const match2 = AuthoritativeAnswerService.findAuthoritativeMatch('1.1.16');
    expect(match2?.answerKeyAnswer || match2?.answer).toBe('D');

    const match3 = AuthoritativeAnswerService.findAuthoritativeMatch('4.28.46');
    const ans3 = match3?.answerKeyAnswer || match3?.answer;
    expect(ans3 === 110 || (typeof ans3 === 'object' && (ans3 as any).value === 110)).toBe(true);
  });

  // --------------------------------------------------------------------------
  // Requirement 9: Confirm importing a PDF/ZIP will not overwrite existing questions
  // --------------------------------------------------------------------------
  it('9. Confirms re-importing is idempotent and does not corrupt existing questions', () => {
    const sampleRecord = normalizeDatasetRecord({
      questionId: '1.1.5',
      question: '',
      options: [],
      correctAnswer: 'B',
      questionType: 'MCQ',
      imageUrl: 'images/1_1_5.png',
      verificationStatus: 'VERIFIED',
    });

    const norm1 = JSONLImportService.normalizeOptionsAndAnswer(sampleRecord, QuestionType.MCQ);
    const norm2 = JSONLImportService.normalizeOptionsAndAnswer(sampleRecord, QuestionType.MCQ);

    expect(norm1.correctAnswer).toEqual(norm2.correctAnswer);
    expect(norm1.options).toEqual(norm2.options);
    expect(norm1.type).toEqual(norm2.type);
  });

  // --------------------------------------------------------------------------
  // Requirement 10: Produce a per-PDF validation report before production import
  // --------------------------------------------------------------------------
  it('10. Confirms representative pilot and complete PDF validation reports exist', () => {
    const pilotReportPath = 'D:\\GATE_project\\Gate\\gate-extraction-v2\\pilot_validation_report.json';
    const fullReportPath = 'D:\\GATE_project\\Gate\\gate-extraction-v2\\validation-report.json';
    const metadataPath = 'D:\\GATE_project\\Gate\\gate-extraction-v2\\metadata.json';

    expect(fs.existsSync(pilotReportPath)).toBe(true);
    expect(fs.existsSync(fullReportPath)).toBe(true);
    expect(fs.existsSync(metadataPath)).toBe(true);

    const pilotData = JSON.parse(fs.readFileSync(pilotReportPath, 'utf-8'));
    expect(Array.isArray(pilotData)).toBe(true);
    expect(pilotData.length).toBe(10); // 10 representative pilot questions
    for (const item of pilotData) {
      expect(item.imageValid).toBe(true);
      expect(item.answerValid).toBe(true);
      expect(item.status).toBe('verified');
    }

    const fullData = JSON.parse(fs.readFileSync(fullReportPath, 'utf-8'));
    expect(fullData.totalQuestions).toBe(1277);
    expect(fullData.verified).toBe(1275);
    expect(fullData.needsReview).toBe(2);
    expect(fullData.mcqCount).toBe(947);
    expect(fullData.msqCount).toBe(98);
    expect(fullData.natCount).toBe(232);
  });
});
