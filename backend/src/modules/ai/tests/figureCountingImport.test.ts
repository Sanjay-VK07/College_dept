import AdmZip from 'adm-zip';
import path from 'path';
import fs from 'fs';
import { JSONLImportService } from '../services/jsonlImportService';
import { extractQuestionBankZipPackage } from '../../../services/zipExtractionService';
import { prisma } from '../../../config/prisma';

describe('Figure Counting & Metrics Classification Unit Tests', () => {
  const testUserId = 'test-fig-metrics-user-' + Date.now();

  let isDbAvailable = false;

  beforeAll(async () => {
    try {
      await prisma.$connect();
      await prisma.user.upsert({
        where: { id: testUserId },
        update: {},
        create: {
          id: testUserId,
          name: 'Figure Metrics Admin',
          email: `fig_metrics_admin_${Date.now()}@citchennai.net`,
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
      // ignore cleanup warnings
    } finally {
      await prisma.$disconnect();
    }
  });

  // TEST 1: 173 questions, no figure references
  it('TEST 1: 173 questions with no figure references should result in 0 questions with figures and 0 figure assets', () => {
    const records = [];
    for (let i = 1; i <= 173; i++) {
      records.push(
        JSON.stringify({
          questionId: `Q1_${i}`,
          question: `Test Question text ${i}`,
          options: { A: 'Opt A', B: 'Opt B' },
          correctAnswer: ['A'],
          questionType: 'MCQ',
          verificationStatus: 'VERIFIED',
        })
      );
    }
    const jsonl = records.join('\n');
    const zip = new AdmZip();
    zip.addFile('Chapter_02.jsonl', Buffer.from(jsonl, 'utf-8'));
    const pkg = extractQuestionBankZipPackage(zip.toBuffer());

    const preview = JSONLImportService.parseAndValidateJSONL(pkg.jsonlEntries[0].text, 'Chapter_02.jsonl', pkg.figureEntries);

    expect(preview.validCount).toBe(173);
    expect(preview.questionsWithFigures).toBe(0);
    expect(preview.figureAssetsFoundCount).toBe(0);
    expect(preview.missingFiguresCount).toBe(0);
  });

  // TEST 2: 173 questions, 5 questions reference 3 unique images
  it('TEST 2: 173 questions where 5 questions reference 3 unique images should yield questionsWithFigures=5 and figureAssetsFound=3', () => {
    const zip = new AdmZip();
    const records = [];
    for (let i = 1; i <= 173; i++) {
      const isFig = i <= 5;
      const figName = i === 1 || i === 2 ? 'fig_A.png' : i === 3 || i === 4 ? 'fig_B.png' : 'fig_C.png';
      records.push(
        JSON.stringify({
          questionId: `Q2_${i}`,
          question: isFig ? `Question with figure ![diagram](figures/${figName})` : `Plain question ${i}`,
          options: { A: 'A', B: 'B' },
          correctAnswer: ['A'],
          questionType: 'MCQ',
          verificationStatus: 'VERIFIED',
          ...(isFig ? { figures: [`figures/${figName}`] } : {}),
        })
      );
    }
    zip.addFile('Chapter_02.jsonl', Buffer.from(records.join('\n'), 'utf-8'));
    zip.addFile('figures/fig_A.png', Buffer.from('PNG_A_DATA'));
    zip.addFile('figures/fig_B.png', Buffer.from('PNG_B_DATA'));
    zip.addFile('figures/fig_C.png', Buffer.from('PNG_C_DATA'));

    const pkg = extractQuestionBankZipPackage(zip.toBuffer());
    const preview = JSONLImportService.parseAndValidateJSONL(pkg.jsonlEntries[0].text, 'Chapter_02.jsonl', pkg.figureEntries);

    expect(preview.validCount).toBe(173);
    expect(preview.questionsWithFigures).toBe(5);
    expect(preview.figureAssetsFoundCount).toBe(3);
    expect(preview.missingFiguresCount).toBe(0);
  });

  // TEST 3: 10 questions reference the exact same image
  it('TEST 3: 10 questions referencing the exact same image should yield questionsWithFigures=10 and figureAssetsFound=1', () => {
    const zip = new AdmZip();
    const records = [];
    for (let i = 1; i <= 10; i++) {
      records.push(
        JSON.stringify({
          questionId: `Q3_${i}`,
          question: `Shared image question ${i}`,
          options: { A: '1', B: '2' },
          correctAnswer: ['A'],
          questionType: 'MCQ',
          imageUrl: 'figures/shared_fig.png',
          verificationStatus: 'VERIFIED',
        })
      );
    }
    zip.addFile('Chapter_03.jsonl', Buffer.from(records.join('\n'), 'utf-8'));
    zip.addFile('figures/shared_fig.png', Buffer.from('SHARED_PNG_DATA'));

    const pkg = extractQuestionBankZipPackage(zip.toBuffer());
    const preview = JSONLImportService.parseAndValidateJSONL(pkg.jsonlEntries[0].text, 'Chapter_03.jsonl', pkg.figureEntries);

    expect(preview.validCount).toBe(10);
    expect(preview.questionsWithFigures).toBe(10);
    expect(preview.figureAssetsFoundCount).toBe(1);
    expect(preview.missingFiguresCount).toBe(0);
  });

  // TEST 4: 54 physical PNG files exist in figures/, but only 5 are referenced
  it('TEST 4: 54 PNG files in ZIP with only 5 referenced should report figureAssetsFound=5, not 54', () => {
    const zip = new AdmZip();
    const records = [];

    // Add 54 physical PNG files (e.g. page_0144.png ... page_0197.png)
    for (let p = 144; p < 144 + 54; p++) {
      zip.addFile(`figures/page_0${p}.png`, Buffer.from(`RENDERED_PDF_PAGE_${p}`));
    }

    // Add 173 questions, only 5 reference page_0144.png through page_0148.png
    for (let i = 1; i <= 173; i++) {
      const isRef = i <= 5;
      const refName = `page_0${143 + i}.png`;
      records.push(
        JSON.stringify({
          questionId: `Q4_${i}`,
          question: isRef ? `Question referencing ${refName}` : `Question without figure ${i}`,
          options: { A: '1', B: '2' },
          correctAnswer: ['A'],
          questionType: 'MCQ',
          verificationStatus: 'VERIFIED',
          ...(isRef ? { figure: `figures/${refName}` } : {}),
        })
      );
    }

    zip.addFile('Chapter_02.jsonl', Buffer.from(records.join('\n'), 'utf-8'));
    const pkg = extractQuestionBankZipPackage(zip.toBuffer());
    const preview = JSONLImportService.parseAndValidateJSONL(pkg.jsonlEntries[0].text, 'Chapter_02.jsonl', pkg.figureEntries);

    expect(preview.validCount).toBe(173);
    expect(preview.questionsWithFigures).toBe(5);
    expect(preview.figureAssetsFoundCount).toBe(5);
    expect(preview.unusedFigureAssetsCount).toBe(49);
    expect(preview.missingFiguresCount).toBe(0);
  });

  // TEST 5: containsFigure=true but no valid figure reference in JSONL
  it('TEST 5: containsFigure=true without a valid figure reference must NOT increment questionsWithFigures or figureAssetsFound', () => {
    const zip = new AdmZip();
    const records = [
      JSON.stringify({
        questionId: 'Q5_1',
        question: 'Question with containsFigure=true flag but no image path',
        options: { A: '1', B: '2' },
        correctAnswer: ['A'],
        questionType: 'MCQ',
        containsFigure: true, // Flagged by OCR, but no actual path
        verificationStatus: 'VERIFIED',
      }),
    ];

    zip.addFile('Test.jsonl', Buffer.from(records.join('\n'), 'utf-8'));
    const pkg = extractQuestionBankZipPackage(zip.toBuffer());
    const preview = JSONLImportService.parseAndValidateJSONL(pkg.jsonlEntries[0].text, 'Test.jsonl', pkg.figureEntries);

    expect(preview.questionsWithFigures).toBe(0);
    expect(preview.figureAssetsFoundCount).toBe(0);
    expect(preview.missingFiguresCount).toBe(0);
  });

  // TEST 6: Referenced figure is missing from ZIP
  it('TEST 6: Question referencing a missing figure asset must increment missingFiguresCount and NOT increment questionsWithFigures', () => {
    const zip = new AdmZip();
    const records = [
      JSON.stringify({
        questionId: 'Q6_1',
        question: 'Question with missing figure asset',
        options: { A: '1', B: '2' },
        correctAnswer: ['A'],
        questionType: 'MCQ',
        figure: 'figures/missing_image_file.png',
        verificationStatus: 'VERIFIED',
      }),
    ];

    zip.addFile('Test.jsonl', Buffer.from(records.join('\n'), 'utf-8'));
    const pkg = extractQuestionBankZipPackage(zip.toBuffer());
    const preview = JSONLImportService.parseAndValidateJSONL(pkg.jsonlEntries[0].text, 'Test.jsonl', pkg.figureEntries);

    expect(preview.questionsWithFigures).toBe(0); // Cannot be counted as question with figure because reference is missing!
    expect(preview.figureAssetsFoundCount).toBe(0);
    expect(preview.missingFiguresCount).toBe(1);
    expect(preview.missingFigures[0]).toEqual({
      questionId: 'Q6_1',
      reference: 'figures/missing_image_file.png',
    });
  });

  // TEST 7: Duplicate import where referenced figures already exist
  it('TEST 7: Duplicate import re-uses figure assets instead of creating duplicates', async () => {
    if (!isDbAvailable) {
      console.warn('Skipping Test 7 as DB is not connected');
      return;
    }
    const zip = new AdmZip();
    const qId = `Q7_dup_${Date.now()}`;
    const records = [
      JSON.stringify({
        questionId: qId,
        question: 'Duplicate import question with figure',
        options: { A: '1', B: '2' },
        correctAnswer: ['A'],
        questionType: 'MCQ',
        figures: ['figures/dup_fig_asset.png'],
        verificationStatus: 'VERIFIED',
      }),
    ];

    zip.addFile('DupTest.jsonl', Buffer.from(records.join('\n'), 'utf-8'));
    zip.addFile('figures/dup_fig_asset.png', Buffer.from('DUP_FIG_BYTES_999'));

    const pkg = extractQuestionBankZipPackage(zip.toBuffer());

    const diskFile = path.resolve(process.cwd(), 'public', 'uploads', 'diagrams', 'dup_fig_asset.png');
    if (fs.existsSync(diskFile)) {
      try { fs.unlinkSync(diskFile); } catch (e) {}
    }

    // First Import
    const import1 = await JSONLImportService.importJSONLToDatabase(
      pkg.jsonlEntries[0].text,
      testUserId,
      'DupTest.zip',
      { subjectName: 'Computer Architecture & Organization', department: 'CSE' },
      pkg.figureEntries
    );

    expect(import1.importedCount).toBe(1);
    expect(import1.duplicateCount).toBe(0);
    expect(import1.figuresStoredCount).toBe(1);

    // Second (Duplicate) Import
    const import2 = await JSONLImportService.importJSONLToDatabase(
      pkg.jsonlEntries[0].text,
      testUserId,
      'DupTest.zip',
      { subjectName: 'Computer Architecture & Organization', department: 'CSE' },
      pkg.figureEntries
    );

    expect(import2.importedCount).toBe(0);
    expect(import2.duplicateCount).toBe(1);
    expect(import2.figuresStoredCount).toBe(0);
    expect(import2.figuresReusedCount).toBe(1);
  });
});
