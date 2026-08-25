import fs from 'fs';
import path from 'path';
import { JSONLImportService } from '../services/jsonlImportService';
import { QuestionBankService } from '../services/questionBankService';
import { QuestionPaperService } from '../services/questionPaperService';
import { prisma } from '../../../config/prisma';
import { VerificationStatus, QuestionOrigin, QuestionType, Difficulty } from '@prisma/client';

jest.setTimeout(120000);

describe('Chapter 1 JSONL Question Bank Import & Integration Pipeline Tests', () => {
  const jsonlFilePath = 'C:\\Users\\ganes\\Downloads\\Ch1_questions.jsonl';
  const testUserId = 'jsonl-import-user-' + Date.now();
  let jsonlContent: Buffer;
  let createdSubjectId: string | null = null;

  beforeAll(async () => {
    // Read the uploaded Ch1_questions.jsonl file
    expect(fs.existsSync(jsonlFilePath)).toBe(true);
    jsonlContent = fs.readFileSync(jsonlFilePath);

    // Create test user cleanly in database
    await prisma.user.upsert({
      where: { id: testUserId },
      update: {},
      create: {
        id: testUserId,
        name: 'JSONL Import Admin',
        email: `jsonl_admin_${Date.now()}@cit.edu.in`,
        role: 'ADMIN',
        department: 'CSE',
      },
    });
  });

  afterAll(async () => {
    try {
      // Cleanup imported questions and taxonomy
      await prisma.question.deleteMany({
        where: {
          createdById: testUserId,
        },
      });

      const subj = await prisma.subject.findFirst({
        where: { code: 'CS_COA' },
        include: { modules: { include: { topics: { include: { subtopics: true } } } } },
      });

      if (subj) {
        createdSubjectId = subj.id;
        for (const mod of subj.modules) {
          for (const top of mod.topics) {
            await prisma.subtopic.deleteMany({ where: { topicId: top.id } });
          }
          await prisma.topic.deleteMany({ where: { moduleId: mod.id } });
        }
        await prisma.module.deleteMany({ where: { subjectId: subj.id } });
        await prisma.subject.delete({ where: { id: subj.id } });
      }

      await prisma.user.deleteMany({ where: { id: testUserId } });
    } catch (e) {
      console.warn('Cleanup warning:', e);
    } finally {
      await prisma.$disconnect();
    }
  });

  it('1. should parse and validate Ch1_questions.jsonl returning exact preview metrics', () => {
    const preview = JSONLImportService.parseAndValidateJSONL(jsonlContent, 'Ch1_questions.jsonl');

    expect(preview.totalRecords).toBe(251);
    expect(preview.topicsCount).toBe(28);
    expect(preview.verifiedCount).toBe(229);
    expect(preview.unansweredInSourceCount).toBe(16);
    expect(preview.needsReviewCount).toBe(6);
    expect(preview.rejectedCount).toBe(0);
    expect(preview.duplicateCount).toBe(0);
    expect(preview.invalidCount).toBe(0);
    expect(preview.topicBreakdown).toHaveLength(28);

    // Verify specific topic breakdown metrics for Cache Memory
    const cacheMemoryTopic = preview.topicBreakdown.find((t) => t.topicHeading === 'Cache Memory');
    expect(cacheMemoryTopic).toBeDefined();
    expect(cacheMemoryTopic?.total).toBe(69);
    expect(cacheMemoryTopic?.verified).toBe(62);
    expect(cacheMemoryTopic?.needsReview).toBe(1);
    expect(cacheMemoryTopic?.unansweredInSource).toBe(6);

    const dmaTopic = preview.topicBreakdown.find((t) => t.topicHeading === 'DMA');
    expect(dmaTopic).toBeDefined();
    expect(dmaTopic?.total).toBe(8);
    expect(dmaTopic?.verified).toBe(8);
  });

  it('2. should transactionally import 251 records into PostgreSQL preserving all metadata and statuses', async () => {
    const importRes = await JSONLImportService.importJSONLToDatabase(jsonlContent, testUserId, 'Ch1_questions.jsonl');

    expect(importRes.totalProcessed).toBe(251);
    expect(importRes.importedCount).toBe(251);
    expect(importRes.skippedCount).toBe(0);
    expect(importRes.duplicateCount).toBe(0);
    expect(importRes.verifiedCount).toBe(229);
    expect(importRes.unansweredCount).toBe(16);
    expect(importRes.needsReviewCount).toBe(6);

    // Verify records exist in PostgreSQL
    const totalInDb = await prisma.question.count({
      where: { createdById: testUserId },
    });
    expect(totalInDb).toBe(251);

    // Verify preservation of specific custom IDs (original question IDs)
    const q1_1_1 = await prisma.question.findUnique({ where: { customId: '1.1.1' } });
    expect(q1_1_1).not.toBeNull();
    expect(q1_1_1?.text).toContain('most relevant addressing mode to write position-independent codes');
    expect(q1_1_1?.type).toBe(QuestionType.MCQ);
    expect(q1_1_1?.verificationStatus).toBe(VerificationStatus.VERIFIED);
    expect(q1_1_1?.origin).toBe(QuestionOrigin.SOURCE);
    expect(q1_1_1?.sourceHeading).toBe('Addressing Modes');

    const q1_5_41 = await prisma.question.findUnique({ where: { customId: '1.5.41' } });
    expect(q1_5_41).not.toBeNull();
    expect(q1_5_41?.sourceHeading).toBe('Cache Memory');
    expect(q1_5_41?.verificationStatus).toBe(VerificationStatus.VERIFIED);

    // Verify preservation of FREE_RESPONSE and UNKNOWN question types
    const q1_1_2 = await prisma.question.findUnique({ where: { customId: '1.1.2' } });
    expect(q1_1_2?.type).toBe(QuestionType.FREE_RESPONSE);
    expect(q1_1_2?.verificationStatus).toBe(VerificationStatus.NEEDS_REVIEW);

    const q1_1_3 = await prisma.question.findUnique({ where: { customId: '1.1.3' } });
    expect(q1_1_3?.type).toBe(QuestionType.UNKNOWN);
    expect(q1_1_3?.verificationStatus).toBe(VerificationStatus.NEEDS_REVIEW);
  });

  it('3. should query real PostgreSQL topic availability matching imported Chapter 1 counts', async () => {
    const subj = await prisma.subject.findFirst({
      where: {
        OR: [
          { code: { equals: 'CS_COA', mode: 'insensitive' } },
          { name: { equals: 'Computer Organization & Architecture', mode: 'insensitive' } },
          { code: { startsWith: 'CS_COA', mode: 'insensitive' } },
        ],
      },
    });
    expect(subj).not.toBeNull();
    createdSubjectId = subj!.id;

    const topics = await QuestionBankService.getTopicAvailability(subj!.id);
    expect(topics.length).toBeGreaterThanOrEqual(28);

    const cacheTopic = topics.find((t) => t.topicName === 'Cache Memory');
    expect(cacheTopic).toBeDefined();
    expect(cacheTopic?.total).toBe(69);
    expect(cacheTopic?.verified).toBe(62);
    expect(cacheTopic?.needsReview).toBe(1);

    const dmaTopic = topics.find((t) => t.topicName === 'DMA');
    expect(dmaTopic).toBeDefined();
    expect(dmaTopic?.total).toBe(8);
    expect(dmaTopic?.verified).toBe(8);

    const conflictTopic = topics.find((t) => t.topicName === 'Conflict Misses');
    expect(conflictTopic).toBeDefined();
    expect(conflictTopic?.total).toBe(1);
  });

  it('4. should support searching by original questionId (e.g. 1.5.41) and topic filtering', async () => {
    const searchRes = await prisma.question.findMany({
      where: {
        OR: [{ customId: '1.5.41' }, { text: { contains: '1.5.41' } }],
      },
    });

    expect(searchRes).toHaveLength(1);
    expect(searchRes[0].customId).toBe('1.5.41');
    expect(searchRes[0].sourceHeading).toBe('Cache Memory');
  });

  it('5. should integrate with Smart Question Paper Builder preview calculations for Cache Memory (50 req -> 0 AI req; 70 req -> 8 AI req)', async () => {
    const subj = await prisma.subject.findFirst({
      where: {
        OR: [
          { code: { equals: 'CS_COA', mode: 'insensitive' } },
          { name: { equals: 'Computer Organization & Architecture', mode: 'insensitive' } },
          { code: { startsWith: 'CS_COA', mode: 'insensitive' } },
        ],
      },
    });
    const cacheTopic = await prisma.topic.findFirst({
      where: { name: { equals: 'Cache Memory', mode: 'insensitive' } },
    });
    expect(cacheTopic).not.toBeNull();

    // Test 50 requested from Cache Memory (62 verified available -> AI required = 0)
    const preview50 = await QuestionPaperService.previewQuestionPaper({
      subjectId: subj!.id,
      selectedTopicIds: [cacheTopic!.id],
      paperMode: 'TOTAL_COUNT',
      totalQuestions: 50,
      difficultyDistribution: { EASY: 20, MEDIUM: 50, HARD: 30 },
      typeDistribution: { MCQ: 60, MSQ: 10, NAT: 30 },
    });

    expect(preview50.requestedTotal).toBe(50);
    expect(preview50.availableVerifiedCount).toBe(62);
    expect(preview50.selectedExistingCount).toBe(50);
    expect(preview50.aiRequiredCount).toBe(0);

    // Test 70 requested from Cache Memory (62 verified available -> AI required = 8)
    const preview70 = await QuestionPaperService.previewQuestionPaper({
      subjectId: subj!.id,
      selectedTopicIds: [cacheTopic!.id],
      paperMode: 'TOTAL_COUNT',
      totalQuestions: 70,
      difficultyDistribution: { EASY: 20, MEDIUM: 50, HARD: 30 },
      typeDistribution: { MCQ: 60, MSQ: 10, NAT: 30 },
    });

    expect(preview70.requestedTotal).toBe(70);
    expect(preview70.availableVerifiedCount).toBe(62);
    expect(preview70.selectedExistingCount).toBe(62);
    expect(preview70.aiRequiredCount).toBe(8);
  });
});
