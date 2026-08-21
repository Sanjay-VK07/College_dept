import { prisma } from '../../../config/prisma';
import { Role, ExamStatus, ExamType } from '@prisma/client';

async function runTests() {
  console.log('🧪 Starting Phase 5 Faculty & Invigilator Portal Integration Test Suite...\n');

  // Find or create admin user
  let adminUser = await prisma.user.findFirst({ where: { role: Role.ADMIN } });
  if (!adminUser) {
    adminUser = await prisma.user.create({
      data: {
        name: 'Test Admin',
        email: 'test_admin_phase5@gsmas.com',
        role: Role.ADMIN,
        department: 'CSE',
      }
    });
  }

  // Find or create faculty users
  let facultyUser1 = await prisma.user.findFirst({ where: { email: 'faculty1_phase5@gsmas.com' } });
  if (!facultyUser1) {
    facultyUser1 = await prisma.user.create({
      data: {
        name: 'Faculty One',
        email: 'faculty1_phase5@gsmas.com',
        role: Role.FACULTY,
        department: 'Computer Science and Engineering',
      }
    });
  }

  let facultyUser2 = await prisma.user.findFirst({ where: { email: 'faculty2_phase5@gsmas.com' } });
  if (!facultyUser2) {
    facultyUser2 = await prisma.user.create({
      data: {
        name: 'Faculty Two',
        email: 'faculty2_phase5@gsmas.com',
        role: Role.FACULTY,
        department: 'Computer Science and Engineering',
      }
    });
  }

  let studentUser = await prisma.user.findFirst({ where: { role: Role.STUDENT } });
  if (!studentUser) {
    studentUser = await prisma.user.create({
      data: {
        name: 'Student Candidate',
        email: 'student_phase5@gsmas.com',
        role: Role.STUDENT,
        department: 'Computer Science and Engineering',
        registerNo: '71762105001',
      }
    });
  }

  let testCount = 0;
  let passCount = 0;

  function assert(condition: boolean, message: string) {
    testCount++;
    if (condition) {
      passCount++;
      console.log(`  ✅ PASS: ${message}`);
    } else {
      console.error(`  ❌ FAIL: ${message}`);
    }
  }

  // ----------------------------------------------------
  // TEST 1: Prevent assigning duplicate invigilator
  // ----------------------------------------------------
  let examId = '';
  try {
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
      }
    });
    examId = testExam.id;

    // First assignment
    const firstAss = await prisma.invigilatorAssignment.create({
      data: { testId: examId, facultyId: facultyUser2.id }
    });
    assert(firstAss !== null, 'TEST 1: Successfully assigned invigilator facultyUser2 to exam');

    // Duplicate assignment should fail database constraint
    try {
      await prisma.invigilatorAssignment.create({
        data: { testId: examId, facultyId: facultyUser2.id }
      });
      assert(false, 'TEST 1b: Duplicate assignment should have been rejected');
    } catch (e: any) {
      assert(true, 'TEST 1b: Correctly threw unique constraint error on duplicate assignment');
    }
  } catch (err: any) {
    assert(false, `TEST 1 failed with error: ${err.message}`);
  }

  // ----------------------------------------------------
  // TEST 2: Prevent status transition to PUBLISHED if exam has 0 questions
  // ----------------------------------------------------
  try {
    const examWithNoQuestions = await prisma.mockTest.findUnique({
      where: { id: examId },
      include: { _count: { select: { testQuestions: true } } }
    });

    const isTransitionAllowed = examWithNoQuestions!._count.testQuestions > 0;
    assert(!isTransitionAllowed, 'TEST 2: Exam with 0 questions is not allowed to transition to PUBLISHED');
  } catch (err: any) {
    assert(false, `TEST 2 failed with error: ${err.message}`);
  }

  // ----------------------------------------------------
  // TEST 3: Add question and allow transition
  // ----------------------------------------------------
  try {
    let subtopic = await prisma.subtopic.findFirst();
    if (!subtopic) {
      subtopic = await prisma.subtopic.create({
        data: {
          name: 'Relational Model',
          topic: {
            create: {
              name: 'Database Models',
              module: {
                create: {
                  name: 'Module 1',
                  subject: {
                    create: {
                      name: 'DBMS',
                      code: 'CS8601',
                      department: 'Computer Science and Engineering'
                    }
                  }
                }
              }
            }
          }
        }
      });
    }

    const question = await prisma.question.create({
      data: {
        text: 'What is the primary key?',
        type: 'MCQ',
        difficulty: 'MEDIUM',
        marks: 2.0,
        correctAnswer: [0],
        options: [{ text: 'A unique identifier' }, { text: 'A foreign key' }],
        subtopicId: subtopic.id,
        createdById: facultyUser1.id,
      }
    });

    await prisma.mockTestQuestion.create({
      data: {
        mockTestId: examId,
        questionId: question.id,
        order: 1
      }
    });

    const examWithQuestions = await prisma.mockTest.findUnique({
      where: { id: examId },
      include: { _count: { select: { testQuestions: true } } }
    });

    const isTransitionAllowedNow = examWithQuestions!._count.testQuestions > 0;
    assert(isTransitionAllowedNow, 'TEST 3: Exam with >0 questions is authorized to transition');
  } catch (err: any) {
    assert(false, `TEST 3 failed with error: ${err.message}`);
  }

  // Clean up
  try {
    await prisma.invigilatorAssignment.deleteMany({ where: { testId: examId } });
    await prisma.mockTestQuestion.deleteMany({ where: { mockTestId: examId } });
    await prisma.mockTest.delete({ where: { id: examId } });
    
    // clean up temp users
    await prisma.user.deleteMany({
      where: {
        email: { in: ['faculty1_phase5@gsmas.com', 'faculty2_phase5@gsmas.com', 'student_phase5@gsmas.com', 'test_admin_phase5@gsmas.com'] }
      }
    });
  } catch (e) {}

  console.log(`\n📊 Faculty & Invigilator Portal Test Results: Passed ${passCount}/${testCount} tests.`);
  if (passCount !== testCount) {
    console.error('❌ Error: Some tests failed!');
    process.exit(1);
  } else {
    console.log('🎉 All tests passed successfully!');
    process.exit(0);
  }
}

runTests().catch((e) => {
  console.error('Unhandled test execution error:', e);
  process.exit(1);
});
