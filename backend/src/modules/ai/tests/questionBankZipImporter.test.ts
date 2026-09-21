import AdmZip from 'adm-zip';
import path from 'path';
import fs from 'fs';
import { JSONLImportService } from '../services/jsonlImportService';
import { extractQuestionBankZipPackage, isSafeZipEntry } from '../../../services/zipExtractionService';
import { prisma } from '../../../config/prisma';

describe('Question Bank ZIP Importer & Multi-Format Regression Tests', () => {
  const testUserId = 'test-zip-importer-user-' + Date.now();
  let isDbAvailable = false;

  beforeAll(async () => {
    try {
      await prisma.$connect();
      await prisma.user.upsert({
        where: { id: testUserId },
        update: {},
        create: {
          id: testUserId,
          name: 'Importer Test Admin',
          email: `importer_admin_${Date.now()}@cit.edu.in`,
          role: 'ADMIN',
          department: 'CSE',
        },
      });
      isDbAvailable = true;
    } catch (e) {
      console.warn('Database not reachable, skipping DB integration tests.');
      isDbAvailable = false;
    }
  });

  afterAll(async () => {
    if (!isDbAvailable) return;
    try {
      await prisma.question.deleteMany({ where: { createdById: testUserId } });
      await prisma.user.deleteMany({ where: { id: testUserId } });
    } catch (e) {
      // ignore cleanup errors
    } finally {
      await prisma.$disconnect();
    }
  });

  it('1. ZIP with Chapter_01.jsonl + figures/', () => {
    const zip = new AdmZip();
    const mockJSONL = [
      JSON.stringify({
        questionId: 'Q_J1',
        question: 'JSONL question with figures/ diagram ![fig](figures/fig1.png)',
        options: { A: 'Opt A', B: 'Opt B' },
        correctAnswer: ['A'],
        questionType: 'MCQ',
        figures: [{ imagePath: 'figures/fig1.png' }],
        verificationStatus: 'VERIFIED',
      }),
    ].join('\n');

    zip.addFile('Chapter_01.jsonl', Buffer.from(mockJSONL, 'utf-8'));
    zip.addFile('figures/fig1.png', Buffer.from('FAKE_PNG_CONTENT'));

    const pkg = extractQuestionBankZipPackage(zip.toBuffer());
    expect(pkg.jsonlEntries).toHaveLength(1);
    expect(pkg.jsonlEntries[0].fileName).toBe('Chapter_01.jsonl');

    const preview = JSONLImportService.parseAndValidateJSONL(pkg.jsonlEntries[0].text, pkg.jsonlEntries[0].fileName, pkg.figureEntries);
    expect(preview.validCount).toBe(1);
    expect(preview.questionsWithFigures).toBe(1);
    expect(preview.figureAssetsFoundCount).toBe(1);
    expect(preview.missingFiguresCount).toBe(0);
  });

  it('2. ZIP with questions.json + visuals/ under GATE_questions_and_visuals/ root folder', () => {
    const zip = new AdmZip();
    const mockJsonArray = [
      {
        questionId: 'Q_V1',
        question: 'Visual question referencing visuals/diagram.png',
        options: { A: 'A', B: 'B', C: 'C', D: 'D' },
        correctAnswer: 'A',
        questionType: 'MCQ',
        figures: [{ imagePath: 'visuals/diagram.png' }],
        verificationStatus: 'VERIFIED',
      },
      {
        questionId: 'Q_V2',
        question: 'Visual question referencing basename diagram2.png',
        options: { A: 'A', B: 'B' },
        correctAnswer: 'B',
        questionType: 'MCQ',
        imageUrl: 'diagram2.png',
        verificationStatus: 'VERIFIED',
      },
    ];

    zip.addFile('GATE_questions_and_visuals/questions.json', Buffer.from(JSON.stringify(mockJsonArray, null, 2), 'utf-8'));
    zip.addFile('GATE_questions_and_visuals/visuals/diagram.png', Buffer.from('DIAGRAM_1_BYTES'));
    zip.addFile('GATE_questions_and_visuals/visuals/diagram2.png', Buffer.from('DIAGRAM_2_BYTES'));

    const pkg = extractQuestionBankZipPackage(zip.toBuffer());
    expect(pkg.jsonlEntries).toHaveLength(1);
    expect(pkg.jsonlEntries[0].fileName).toBe('questions.json');

    const preview = JSONLImportService.parseAndValidateJSONL(pkg.jsonlEntries[0].text, pkg.jsonlEntries[0].fileName, pkg.figureEntries);
    expect(preview.validCount).toBe(2);
    expect(preview.questionsWithFigures).toBe(2);
    expect(preview.figureAssetsFoundCount).toBe(2);
    expect(preview.missingFiguresCount).toBe(0);
  });

  it('3. JSON array dataset parsing', () => {
    const jsonContent = JSON.stringify([
      {
        questionId: 'ARR_1',
        question: 'Array question 1',
        options: ['O1', 'O2'],
        correctAnswer: ['A'],
        questionType: 'MCQ',
      },
      {
        questionId: 'ARR_2',
        question: 'Array question 2',
        options: ['O1', 'O2'],
        correctAnswer: ['B'],
        questionType: 'MCQ',
      },
    ]);

    const preview = JSONLImportService.parseAndValidateJSONL(jsonContent, 'questions.json');
    expect(preview.totalRecords).toBe(2);
    expect(preview.validCount).toBe(2);
    expect(preview.validRecords[0].questionId).toBe('ARR_1');
    expect(preview.validRecords[1].questionId).toBe('ARR_2');
  });

  it('4. Single JSON object dataset parsing', () => {
    const singleJsonObject = JSON.stringify({
      questionId: 'SINGLE_1',
      question: 'Single question object test',
      options: { A: 'True', B: 'False' },
      correctAnswer: 'A',
      questionType: 'MCQ',
    });

    const preview = JSONLImportService.parseAndValidateJSONL(singleJsonObject, 'single_question.json');
    expect(preview.totalRecords).toBe(1);
    expect(preview.validCount).toBe(1);
    expect(preview.validRecords[0].questionId).toBe('SINGLE_1');
  });

  it('5. JSONL format dataset parsing', () => {
    const jsonlContent = [
      JSON.stringify({ questionId: 'JSONL_1', question: 'Q1', options: ['A', 'B'], correctAnswer: 'A', questionType: 'MCQ' }),
      JSON.stringify({ questionId: 'JSONL_2', question: 'Q2', options: ['A', 'B'], correctAnswer: 'B', questionType: 'MCQ' }),
    ].join('\n');

    const preview = JSONLImportService.parseAndValidateJSONL(jsonlContent, 'data.jsonl');
    expect(preview.validCount).toBe(2);
  });

  it('6. Image reference under visuals/ and figures/ interchangeably', () => {
    const zip = new AdmZip();
    const dataset = JSON.stringify([
      {
        questionId: 'CROSS_1',
        question: 'Question referencing figures/foo.png when stored under visuals/',
        options: { A: 'A', B: 'B' },
        correctAnswer: 'A',
        questionType: 'MCQ',
        figure: 'figures/foo.png',
      },
      {
        questionId: 'CROSS_2',
        question: 'Question referencing visuals/bar.png when stored under figures/',
        options: { A: 'A', B: 'B' },
        correctAnswer: 'B',
        questionType: 'MCQ',
        figure: 'visuals/bar.png',
      },
    ]);

    zip.addFile('questions.json', Buffer.from(dataset, 'utf-8'));
    zip.addFile('visuals/foo.png', Buffer.from('FOO_BYTES'));
    zip.addFile('figures/bar.png', Buffer.from('BAR_BYTES'));

    const pkg = extractQuestionBankZipPackage(zip.toBuffer());
    const preview = JSONLImportService.parseAndValidateJSONL(pkg.jsonlEntries[0].text, 'questions.json', pkg.figureEntries);

    expect(preview.validCount).toBe(2);
    expect(preview.questionsWithFigures).toBe(2);
    expect(preview.figureAssetsFoundCount).toBe(2);
    expect(preview.missingFiguresCount).toBe(0);
  });

  it('7. Missing referenced image detection', () => {
    const zip = new AdmZip();
    const dataset = JSON.stringify([
      {
        questionId: 'MISS_1',
        question: 'Question referencing missing_asset.png',
        options: { A: 'A', B: 'B' },
        correctAnswer: 'A',
        questionType: 'MCQ',
        figure: 'visuals/missing_asset.png',
      },
    ]);

    zip.addFile('questions.json', Buffer.from(dataset, 'utf-8'));
    const pkg = extractQuestionBankZipPackage(zip.toBuffer());
    const preview = JSONLImportService.parseAndValidateJSONL(pkg.jsonlEntries[0].text, 'questions.json', pkg.figureEntries);

    expect(preview.validCount).toBe(1);
    expect(preview.questionsWithFigures).toBe(0);
    expect(preview.missingFiguresCount).toBe(1);
    expect(preview.missingFigures[0]).toEqual({
      questionId: 'MISS_1',
      reference: 'visuals/missing_asset.png',
    });
  });

  it('8. Duplicate question import idempotency', async () => {
    if (!isDbAvailable) return;

    const zip = new AdmZip();
    const qId = `DUP_REG_${Date.now()}`;
    const dataset = JSON.stringify([
      {
        questionId: qId,
        question: 'Duplicate test question',
        options: { A: '1', B: '2' },
        correctAnswer: 'A',
        questionType: 'MCQ',
        figure: 'visuals/dup_visual.png',
        verificationStatus: 'VERIFIED',
      },
    ]);

    zip.addFile('questions.json', Buffer.from(dataset, 'utf-8'));
    zip.addFile('visuals/dup_visual.png', Buffer.from('DUP_VISUAL_BYTES'));
    const pkg = extractQuestionBankZipPackage(zip.toBuffer());

    // Import 1
    const res1 = await JSONLImportService.importJSONLToDatabase(
      pkg.jsonlEntries[0].text,
      testUserId,
      'questions.json',
      { subjectName: 'Computer Architecture & Organization', department: 'CSE' },
      pkg.figureEntries
    );
    expect(res1.importedCount).toBe(1);
    expect(res1.duplicateCount).toBe(0);

    // Import 2 (Duplicate)
    const res2 = await JSONLImportService.importJSONLToDatabase(
      pkg.jsonlEntries[0].text,
      testUserId,
      'questions.json',
      { subjectName: 'Computer Architecture & Organization', department: 'CSE' },
      pkg.figureEntries
    );
    expect(res2.importedCount).toBe(0);
    expect(res2.duplicateCount).toBe(1);
    expect(res2.figuresReusedCount).toBe(1);
  });

  it('9. Improved error message when no dataset file is found in ZIP', () => {
    const zip = new AdmZip();
    zip.addFile('visuals/fig1.png', Buffer.from('PNG_BYTES'));
    zip.addFile('readme.txt', Buffer.from('This is a plain readme text with no questions.'));

    expect(() => extractQuestionBankZipPackage(zip.toBuffer())).toThrow(
      'No supported question dataset found. Expected .jsonl or .json containing question records.'
    );
  });

  it('10. Actual questions.json schema normalization (id, question_text, source_topic, visual_assets, key options)', () => {
    const zip = new AdmZip();
    const actualSchemaDataset = [
      {
        id: 'Q0001',
        type: 'MCQ',
        source_topic: 'Addressing Modes',
        source: 'GATE CSE 1987',
        source_question_number: '1-V',
        question_text: 'The most relevant addressing mode to write position-independent codes is:',
        options: [
          { key: 'A', text: 'Direct mode' },
          { key: 'B', text: 'Indirect mode' },
          { key: 'C', text: 'Relative mode' },
          { key: 'D', text: 'Indexed mode' },
        ],
        marks: null,
        difficulty: 'easy',
        source_page_start: 28,
        source_page_end: 28,
        source_header: 'Addressing Modes: GATE CSE 1987 | Question: 1-V',
        visual_assets: ['visuals/Q0001_p028.jpg'],
        verification: {
          status: 'machine_verified_visual_first',
          visual_source_of_truth: true,
          visual_assets_present: true,
          options_validated: true,
        },
      },
      {
        id: 'Q0002',
        type: 'DESCRIPTIVE',
        source_topic: 'Addressing Modes',
        source: 'GATE CSE 1988',
        source_question_number: '9iii',
        question_text: 'In the program scheme given below indicate the instructions containing any operand needing relocation.',
        options: [],
        marks: null,
        difficulty: 'normal',
        source_page_start: 28,
        source_page_end: 28,
        visual_assets: ['visuals/Q0002_p028.jpg'],
        verification: {
          status: 'machine_verified_visual_first',
        },
      },
    ];

    zip.addFile('GATE_questions_and_visuals/questions.json', Buffer.from(JSON.stringify(actualSchemaDataset, null, 2), 'utf-8'));
    zip.addFile('GATE_questions_and_visuals/visuals/Q0001_p028.jpg', Buffer.from('JPG1_BYTES'));
    zip.addFile('GATE_questions_and_visuals/visuals/Q0002_p028.jpg', Buffer.from('JPG2_BYTES'));

    const pkg = extractQuestionBankZipPackage(zip.toBuffer());
    const preview = JSONLImportService.parseAndValidateJSONL(pkg.jsonlEntries[0].text, pkg.jsonlEntries[0].fileName, pkg.figureEntries);

    expect(preview.totalRecords).toBe(2);
    expect(preview.validCount).toBe(2);
    expect(preview.invalidCount).toBe(0);
    expect(preview.questionsWithFigures).toBe(2);
    expect(preview.figureAssetsFoundCount).toBe(2);
    expect(preview.validRecords[0].questionId).toBe('Q0001');
    expect(preview.validRecords[0].question).toBe('The most relevant addressing mode to write position-independent codes is:');
    expect(preview.validRecords[0].sourceHeading).toBe('Addressing Modes');
    expect(preview.validRecords[1].questionId).toBe('Q0002');
  });

  it('11. questions.json + question_images/ with visuals/ reference pattern', () => {
    const zip = new AdmZip();
    const dataset = [
      {
        id: 'Q_QI1',
        question_text: 'Question referencing visuals/Q_QI1.jpg when stored under question_images/',
        options: [{ key: 'A', text: 'Opt A' }],
        visual_assets: ['visuals/Q_QI1.jpg'],
        question_image: 'question_images/Q_QI1.jpg',
      },
    ];

    zip.addFile('questions.json', Buffer.from(JSON.stringify(dataset, null, 2), 'utf-8'));
    zip.addFile('question_images/Q_QI1.jpg', Buffer.from('QUESTION_IMAGE_BYTES'));

    const pkg = extractQuestionBankZipPackage(zip.toBuffer());
    const preview = JSONLImportService.parseAndValidateJSONL(pkg.jsonlEntries[0].text, pkg.jsonlEntries[0].fileName, pkg.figureEntries);

    expect(preview.totalRecords).toBe(1);
    expect(preview.validCount).toBe(1);
    expect(preview.invalidCount).toBe(0);
    expect(preview.questionsWithFigures).toBe(1);
    expect(preview.figureAssetsFoundCount).toBe(1);
    expect(preview.missingFiguresCount).toBe(0);
  });

  it('12. questions.json + visuals/ with visuals/ reference pattern', () => {
    const zip = new AdmZip();
    const dataset = [
      {
        id: 'Q_VIS1',
        question_text: 'Question referencing visuals/Q_VIS1.jpg stored under visuals/',
        options: [{ key: 'A', text: 'Opt A' }],
        visual_assets: ['visuals/Q_VIS1.jpg'],
      },
    ];

    zip.addFile('questions.json', Buffer.from(JSON.stringify(dataset, null, 2), 'utf-8'));
    zip.addFile('visuals/Q_VIS1.jpg', Buffer.from('VISUALS_BYTES'));

    const pkg = extractQuestionBankZipPackage(zip.toBuffer());
    const preview = JSONLImportService.parseAndValidateJSONL(pkg.jsonlEntries[0].text, pkg.jsonlEntries[0].fileName, pkg.figureEntries);

    expect(preview.totalRecords).toBe(1);
    expect(preview.validCount).toBe(1);
    expect(preview.questionsWithFigures).toBe(1);
    expect(preview.figureAssetsFoundCount).toBe(1);
    expect(preview.missingFiguresCount).toBe(0);
  });

  it('13. Chapter_01.jsonl + figures/ with figures/ reference pattern', () => {
    const zip = new AdmZip();
    const mockJSONL = [
      JSON.stringify({
        questionId: 'Q_FIG1',
        question: 'Question referencing figures/Q_FIG1.png stored under figures/',
        options: { A: '1', B: '2' },
        correctAnswer: ['A'],
        questionType: 'MCQ',
        figures: ['figures/Q_FIG1.png'],
      }),
    ].join('\n');

    zip.addFile('Chapter_01.jsonl', Buffer.from(mockJSONL, 'utf-8'));
    zip.addFile('figures/Q_FIG1.png', Buffer.from('FIGURES_BYTES'));

    const pkg = extractQuestionBankZipPackage(zip.toBuffer());
    const preview = JSONLImportService.parseAndValidateJSONL(pkg.jsonlEntries[0].text, pkg.jsonlEntries[0].fileName, pkg.figureEntries);

    expect(preview.totalRecords).toBe(1);
    expect(preview.validCount).toBe(1);
    expect(preview.questionsWithFigures).toBe(1);
    expect(preview.figureAssetsFoundCount).toBe(1);
    expect(preview.missingFiguresCount).toBe(0);
  });
});


