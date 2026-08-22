import { AIBatchQuestionGenerationService } from '../services/aiBatchQuestionGenerationService';
import { GenerationDistributionService } from '../services/generationDistributionService';
import { prisma } from '../../../config/prisma';
import { Role } from '@prisma/client';

describe('Generation Security Tests', () => {
  const studentUserId = 'sec_student_' + Date.now();
  const facultyUserId = 'sec_faculty_' + Date.now();
  const otherFacultyId = 'sec_other_fac_' + Date.now();
  const privateDocId = 'sec_private_doc_' + Date.now();

  beforeAll(async () => {
    await prisma.user.create({
      data: {
        id: studentUserId,
        name: 'Student User',
        email: `sec_student_${Date.now()}@cit.edu.in`,
        role: Role.STUDENT,
        department: 'CSE',
      },
    });

    await prisma.user.create({
      data: {
        id: facultyUserId,
        name: 'Faculty User',
        email: `sec_fac_${Date.now()}@cit.edu.in`,
        role: Role.FACULTY,
        department: 'CSE',
      },
    });

    await prisma.user.create({
      data: {
        id: otherFacultyId,
        name: 'Other Faculty',
        email: `sec_other_${Date.now()}@cit.edu.in`,
        role: Role.FACULTY,
        department: 'ECE',
      },
    });

    // Create private document belonging to otherFacultyId
    await prisma.aIDocument.create({
      data: {
        id: privateDocId,
        title: 'Secret ECE Exam Material',
        fileName: 'ece_secret.pdf',
        mimeType: 'application/pdf',
        storageKey: 'ece_sec_' + Date.now(),
        visibility: 'PRIVATE',
        uploadedById: otherFacultyId,
      },
    });
  });

  afterAll(async () => {
    await prisma.aIDocument.deleteMany({ where: { id: privateDocId } });
    await prisma.user.deleteMany({
      where: { id: { in: [studentUserId, facultyUserId, otherFacultyId] } },
    });
  });

  it('1. Student role cannot invoke question generation (403 Forbidden)', async () => {
    await expect(
      AIBatchQuestionGenerationService.enqueueBatch(studentUserId, Role.STUDENT, {
        totalQuestions: 50,
        difficultyDistribution: { EASY: 20, MEDIUM: 50, HARD: 30 },
        typeDistribution: { MCQ: 60, MSQ: 10, NAT: 30 },
      })
    ).rejects.toThrow('Forbidden: Only Faculty and Admin users are authorized to generate questions.');
  });

  it('2. Denies access to PRIVATE document belonging to another user', async () => {
    const distRes = await GenerationDistributionService.validateGenerationRequest({
      totalQuestions: 50,
      difficultyDistribution: { EASY: 20, MEDIUM: 50, HARD: 30 },
      typeDistribution: { MCQ: 60, MSQ: 10, NAT: 30 },
      selectedResourceIds: [privateDocId],
      userId: facultyUserId,
      role: Role.FACULTY,
    });

    expect(distRes.isValid).toBe(false);
    expect(distRes.errorCode).toBe('FORBIDDEN_RESOURCE_ACCESS');
  });
});
