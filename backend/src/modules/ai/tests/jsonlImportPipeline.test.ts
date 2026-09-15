import fs from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';
import { JSONLImportService } from '../services/jsonlImportService';
import { extractQuestionBankZipPackage, isSafeZipEntry } from '../../../services/zipExtractionService';
import { QuestionBankService } from '../services/questionBankService';
import { QuestionPaperService } from '../services/questionPaperService';
import { prisma } from '../../../config/prisma';
import { VerificationStatus, QuestionOrigin, QuestionType, Difficulty } from '@prisma/client';

jest.setTimeout(120000);

describe('Question Bank JSONL & ZIP Figure Import Pipeline Tests', () => {
  const jsonlFilePath = 'C:\\Users\\RLDC\\Downloads\\Ch1_questions.jsonl';
  const testUserId = 'test-zip-figure-user-' + Date.now();
  let jsonlContent: Buffer;
  let createdSubjectId: string | null = null;

  let isDbAvailable = false;

  beforeAll(async () => {
    // Read Ch1_questions.jsonl
    if (fs.existsSync(jsonlFilePath)) {
      jsonlContent = fs.readFileSync(jsonlFilePath);
    } else {
      // Fallback sample for standalone CI
      const sample = [
        JSON.stringify({
          questionId: '1.1.1',
          question: 'The most relevant addressing mode to write position-independent codes is:',
          options: { A: 'Direct mode', B: 'Indirect mode', C: 'Relative mode', D: 'Indexed mode' },
          correctAnswer: ['C'],
          rawAnswer: 'C',
          questionType: 'MCQ',
          verificationStatus: 'VERIFIED',
          sourceHeading: 'Addressing Modes',
        }),
        JSON.stringify({
          questionId: '1.8.2',
          question: 'Figure diagram question with schematic',
          options: ['Option A', 'Option B'],
          correctAnswer: ['A'],
          questionType: 'MCQ',
          containsFigure: true,
          figures: [{ figureId: '1.8.2_fig1', imagePath: 'figures/embedded_test_sample.png' }],
          verificationStatus: 'VERIFIED',
          sourceHeading: 'Instruction Pipeline',
        }),
      ].join('\n');
      jsonlContent = Buffer.from(sample, 'utf-8');
    }

    try {
      await prisma.$connect();
      await prisma.user.upsert({
        where: { id: testUserId },
        update: {},
        create: {
          id: testUserId,
          name: 'ZIP Figure Admin',
          email: `zip_figure_admin_${Date.now()}@cit.edu.in`,
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
      await prisma.question.deleteMany({
        where: { createdById: testUserId },
      });

      if (createdSubjectId) {
        const subj = await prisma.subject.findUnique({
          where: { id: createdSubjectId },
          include: { modules: { include: { topics: { include: { subtopics: true } } } } },
        });
        if (subj) {
          for (const mod of subj.modules) {
            for (const top of mod.topics) {
              await prisma.subtopic.deleteMany({ where: { topicId: top.id } });
            }
            await prisma.topic.deleteMany({ where: { moduleId: mod.id } });
          }
          await prisma.module.deleteMany({ where: { subjectId: subj.id } });
          await prisma.subject.delete({ where: { id: subj.id } });
        }
      }

      await prisma.user.deleteMany({ where: { id: testUserId } });
    } catch (e) {
      console.warn('Cleanup warning:', e);
    } finally {
      await prisma.$disconnect();
    }
  });

  it('1. should validate zip entry paths and reject Zip-Slip path traversal', () => {
    expect(isSafeZipEntry('Chapter_01.jsonl')).toBe(true);
    expect(isSafeZipEntry('figures/embedded_abc123.png')).toBe(true);
    expect(isSafeZipEntry('../../../etc/passwd')).toBe(false);
    expect(isSafeZipEntry('figures/../../secret.txt')).toBe(false);
    expect(isSafeZipEntry('/absolute/path/file.png')).toBe(false);
    expect(isSafeZipEntry('C:\\windows\\system32\\cmd.exe')).toBe(false);
  });

  it('2. should extract a valid Question Bank zip package containing JSONL and figures', () => {
    const zip = new AdmZip();
    const mockJSONL = [
      JSON.stringify({
        questionId: '1.9.1',
        question: 'Sample diagram question',
        options: { A: '1', B: '2' },
        correctAnswer: ['A'],
        questionType: 'MCQ',
        figures: [{ imagePath: 'figures/embedded_sample_fig.png' }],
        verificationStatus: 'VERIFIED',
        sourceHeading: 'Memory Systems',
      }),
    ].join('\n');

    zip.addFile('Chapter_01.jsonl', Buffer.from(mockJSONL, 'utf-8'));
    zip.addFile('figures/embedded_sample_fig.png', Buffer.from('FAKE_PNG_BINARY_CONTENT'));

    const zipBuffer = zip.toBuffer();
    const pkg = extractQuestionBankZipPackage(zipBuffer);

    expect(pkg.jsonlEntries).toHaveLength(1);
    expect(pkg.jsonlEntries[0].fileName).toBe('Chapter_01.jsonl');
    expect(pkg.figureEntries.size).toBeGreaterThan(0);
    expect(pkg.figureEntries.has('figures/embedded_sample_fig.png')).toBe(true);
    expect(pkg.figureEntries.has('embedded_sample_fig.png')).toBe(true);
  });

  it('3. should report missing figures in preview when figure is referenced but not in package', () => {
    const zip = new AdmZip();
    const mockJSONL = [
      JSON.stringify({
        questionId: '1.9.2',
        question: 'Question with missing figure asset',
        options: { A: '1', B: '2' },
        correctAnswer: ['B'],
        questionType: 'MCQ',
        figures: [{ imagePath: 'figures/missing_non_existent.png' }],
        verificationStatus: 'VERIFIED',
        sourceHeading: 'Memory Systems',
      }),
    ].join('\n');

    zip.addFile('Chapter_01.jsonl', Buffer.from(mockJSONL, 'utf-8'));
    const zipBuffer = zip.toBuffer();
    const pkg = extractQuestionBankZipPackage(zipBuffer);

    const preview = JSONLImportService.parseAndValidateJSONL(pkg.jsonlEntries[0].text, 'Chapter_01.jsonl', pkg.figureEntries);

    expect(preview.totalRecords).toBe(1);
    expect(preview.validCount).toBe(1);
    expect(preview.questionsWithFigures).toBe(0);
    expect(preview.missingFiguresCount).toBe(1);
    expect(preview.missingFigures[0]).toEqual({
      questionId: '1.9.2',
      reference: 'figures/missing_non_existent.png',
    });
  });

  it('4. should resolve figures, persist assets, and import question with imageUrl to PostgreSQL', async () => {
    if (!isDbAvailable) return;
    const zip = new AdmZip();
    const mockJSONL = [
      JSON.stringify({
        questionId: '1.9.3',
        question: 'Question with verified figure asset',
        options: { A: 'A', B: 'B', C: 'C', D: 'D' },
        correctAnswer: ['C'],
        questionType: 'MCQ',
        containsFigure: true,
        figures: [{ imagePath: 'figures/embedded_sample_diagram_ok.png' }],
        verificationStatus: 'VERIFIED',
        sourceHeading: 'Cache Memory',
      }),
    ].join('\n');

    const testDiagramPath = path.resolve(process.cwd(), 'public', 'uploads', 'diagrams', 'embedded_sample_diagram_ok.png');
    if (fs.existsSync(testDiagramPath)) fs.unlinkSync(testDiagramPath);
    const fallbackDiagramPath = path.resolve(process.cwd(), 'uploads', 'diagrams', 'embedded_sample_diagram_ok.png');
    if (fs.existsSync(fallbackDiagramPath)) fs.unlinkSync(fallbackDiagramPath);

    zip.addFile('Chapter_01.jsonl', Buffer.from(mockJSONL, 'utf-8'));
    zip.addFile('figures/embedded_sample_diagram_ok.png', Buffer.from('TEST_IMAGE_BYTES_12345'));

    const zipBuffer = zip.toBuffer();
    const pkg = extractQuestionBankZipPackage(zipBuffer);

    const importRes = await JSONLImportService.importJSONLToDatabase(
      pkg.jsonlEntries[0].text,
      testUserId,
      'Chapter_01.zip',
      { subjectName: 'Computer Architecture & Organization', department: 'CSE' },
      pkg.figureEntries
    );

    expect(importRes.importedCount).toBe(1);
    expect(importRes.figuresStoredCount).toBe(1);
    expect(importRes.missingFiguresCount).toBe(0);

    const importedQ = await prisma.question.findUnique({
      where: { customId: '1.9.3' },
    });

    expect(importedQ).not.toBeNull();
    expect(importedQ?.imageUrl).toBe('/uploads/diagrams/embedded_sample_diagram_ok.png');
    expect(importedQ?.containsFigure).toBe(true);

    // Verify physical file was written to disk
    const savedPath = path.resolve(process.cwd(), 'public', 'uploads', 'diagrams', 'embedded_sample_diagram_ok.png');
    expect(fs.existsSync(savedPath)).toBe(true);
  });

  it('5. should handle re-import idempotently without creating duplicates and reuse existing figures', async () => {
    if (!isDbAvailable) return;
    const zip = new AdmZip();
    const mockJSONL = [
      JSON.stringify({
        questionId: '1.9.3',
        question: 'Duplicate question identical customId',
        options: { A: 'A', B: 'B' },
        correctAnswer: ['A'],
        questionType: 'MCQ',
        containsFigure: true,
        figures: [{ imagePath: 'figures/embedded_sample_diagram_ok.png' }],
        verificationStatus: 'VERIFIED',
        sourceHeading: 'Cache Memory',
      }),
    ].join('\n');

    zip.addFile('Chapter_01.jsonl', Buffer.from(mockJSONL, 'utf-8'));
    zip.addFile('figures/embedded_sample_diagram_ok.png', Buffer.from('TEST_IMAGE_BYTES_12345'));
    const pkg = extractQuestionBankZipPackage(zip.toBuffer());

    const reimportRes = await JSONLImportService.importJSONLToDatabase(
      pkg.jsonlEntries[0].text,
      testUserId,
      'Chapter_01.zip',
      { subjectName: 'Computer Architecture & Organization', department: 'CSE' },
      pkg.figureEntries
    );

    expect(reimportRes.importedCount).toBe(0);
    expect(reimportRes.duplicateCount).toBe(1);
    expect(reimportRes.figuresStoredCount).toBe(0);
    expect(reimportRes.figuresReusedCount).toBe(1);
  });
});

