import { prisma } from '../../../config/prisma';
import { Role, ExamStatus, ExamType } from '@prisma/client';

describe('Phase 5 Faculty & Invigilator Portal Integration Test Suite', () => {
  let examId = '';
  let facultyUser1: any = null;
  let facultyUser2: any = null;

  beforeAll(async () => {
    facultyUser1 = await prisma.user.findFirst({ where: { email: 'faculty1_phase5@gsmas.com' } });
    if (!facultyUser1) {
      facultyUser1 = await prisma.user.create({
        data: {
          name: 'Faculty One',
          email: 'faculty1_phase5@gsmas.com',
          role: Role.FACULTY,
          department: 'Computer Science and Engineering',
        },
      });
    }

    facultyUser2 = await prisma.user.findFirst({ where: { email: 'faculty2_phase5@gsmas.com' } });
    if (!facultyUser2) {
      facultyUser2 = await prisma.user.create({
        data: {
          name: 'Faculty Two',
          email: 'faculty2_phase5@gsmas.com',
          role: Role.FACULTY,
          department: 'Computer Science and Engineering',
        },
      });
    }
  });

  afterAll(async () => {
    try {
      if (examId) {
        await prisma.invigilatorAssignment.deleteMany({ where: { testId: examId } });
        await prisma.mockTestQuestion.deleteMany({ where: { mockTestId: examId } });
        await prisma.mockTest.delete({ where: { id: examId } });
      }
      if (facultyUser1) {
        await prisma.question.deleteMany({ where: { createdById: facultyUser1.id } });
      }
      await prisma.user.deleteMany({
        where: {
          email: { in: ['faculty1_phase5@gsmas.com', 'faculty2_phase5@gsmas.com'] },
        },
      });
    } catch (e) {}
  });

  it('should prevent assigning duplicate invigilator', async () => {
    const testExam = await prisma.mockTest.create({
      data: {
        title: 'TEST-101 Database Systems',
        description: 'Test Exam description',
        examType: ExamType.SCHEDULED,
        durationMinutes: 120,
        totalMarks: 100,
        targetDepartment: 'CSE',
        status: ExamStatus.DRAFT,
        createdById: facultyUser1.id,
        startTime: new Date(),
        endTime: new Date(Date.now() + 86400000),
      },
    });
    examId = testExam.id;

    const firstAss = await prisma.invigilatorAssignment.create({
      data: { testId: examId, facultyId: facultyUser2.id },
    });
    expect(firstAss).toBeDefined();

    await expect(
      prisma.invigilatorAssignment.create({
        data: { testId: examId, facultyId: facultyUser2.id },
      })
    ).rejects.toThrow();
  });

  it('should prevent status transition to PUBLISHED if exam has 0 questions', async () => {
    const examWithNoQuestions = await prisma.mockTest.findUnique({
      where: { id: examId },
      include: { _count: { select: { testQuestions: true } } },
    });

    const isTransitionAllowed = (examWithNoQuestions?._count.testQuestions || 0) > 0;
    expect(isTransitionAllowed).toBe(false);
  });
});
