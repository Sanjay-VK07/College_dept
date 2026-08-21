import { Role, ExamType, QuestionType, Difficulty, ResultVisibility, SolutionVisibility, RiskLevel } from '@prisma/client';
import { prisma } from '../src/config/prisma';

async function main() {
  console.log('🌱 Starting database seed for GSMAS...');

  // 1. System Settings
  await prisma.systemSetting.upsert({
    where: { key: 'ALLOWED_EMAIL_DOMAINS' },
    update: { value: 'cit.edu.in,college.edu.in' },
    create: {
      key: 'ALLOWED_EMAIL_DOMAINS',
      value: 'cit.edu.in,college.edu.in',
      description: 'Comma separated list of allowed college domains for OAuth',
    },
  });

  await prisma.systemSetting.upsert({
    where: { key: 'MAX_VIOLATION_THRESHOLD' },
    update: { value: '5' },
    create: {
      key: 'MAX_VIOLATION_THRESHOLD',
      value: '5',
      description: 'Default maximum security violations before auto-submit',
    },
  });

  // 2. Users
  const admin = await prisma.user.upsert({
    where: { email: 'admin@cit.edu.in' },
    update: {},
    create: {
      name: 'System Admin',
      email: 'admin@cit.edu.in',
      role: Role.ADMIN,
      department: 'ADMINISTRATION',
    },
  });

  const faculty = await prisma.user.upsert({
    where: { email: 'faculty@cit.edu.in' },
    update: {},
    create: {
      name: 'Dr. A. R. Sharma',
      email: 'faculty@cit.edu.in',
      role: Role.FACULTY,
      department: 'CSE',
    },
  });

  const student1 = await prisma.user.upsert({
    where: { email: 'ganesh@cit.edu.in' },
    update: {},
    create: {
      registerNo: '71762105001',
      name: 'Ganesh Kumar',
      email: 'ganesh@cit.edu.in',
      role: Role.STUDENT,
      department: 'CSE',
      year: 3,
      semester: 6,
      section: 'A',
    },
  });

  const student2 = await prisma.user.upsert({
    where: { email: 'student2@cit.edu.in' },
    update: {},
    create: {
      registerNo: '71762105002',
      name: 'Ananya Ramesh',
      email: 'student2@cit.edu.in',
      role: Role.STUDENT,
      department: 'CSE',
      year: 3,
      semester: 6,
      section: 'A',
    },
  });

  // 3. Subject -> Module -> Topic -> Subtopic (4-Tier Taxonomy)
  const osSubject = await prisma.subject.upsert({
    where: { code: 'CS-OS-301' },
    update: {},
    create: {
      name: 'Operating Systems',
      code: 'CS-OS-301',
      department: 'CSE',
    },
  });

  const procMod = await prisma.module.create({
    data: {
      name: 'Process Management & Synchronization',
      subjectId: osSubject.id,
    },
  });

  const dlockTopic = await prisma.topic.create({
    data: {
      name: 'Deadlock Handling',
      moduleId: procMod.id,
    },
  });

  const bankerSubtopic = await prisma.subtopic.create({
    data: {
      name: "Banker's Algorithm & Resource Allocation",
      topicId: dlockTopic.id,
    },
  });

  const algoSubject = await prisma.subject.upsert({
    where: { code: 'CS-DAA-302' },
    update: {},
    create: {
      name: 'Data Structures & Algorithms',
      code: 'CS-DAA-302',
      department: 'CSE',
    },
  });

  const graphMod = await prisma.module.create({
    data: {
      name: 'Graph Algorithms',
      subjectId: algoSubject.id,
    },
  });

  const shortestTopic = await prisma.topic.create({
    data: {
      name: 'Shortest Path Algorithms',
      moduleId: graphMod.id,
    },
  });

  const dijkstraSubtopic = await prisma.subtopic.create({
    data: {
      name: "Dijkstra's & Bellman-Ford Algorithm",
      topicId: shortestTopic.id,
    },
  });

  // 4. Sample Questions (MCQ, MSQ, NAT)
  const q1 = await prisma.question.create({
    data: {
      text: "Which of the following conditions is NOT a necessary condition for a deadlock to occur in an operating system?",
      type: QuestionType.MCQ,
      difficulty: Difficulty.MEDIUM,
      marks: 1.0,
      negativeMarks: 0.33,
      options: [
        { text: 'Mutual Exclusion', latex: '' },
        { text: 'Hold and Wait', latex: '' },
        { text: 'Preemption', latex: '' },
        { text: 'Circular Wait', latex: '' },
      ],
      correctAnswer: [2], // Index 2: Preemption (No Preemption is necessary, not Preemption)
      explanation: 'The four Coffman deadlock conditions are Mutual Exclusion, Hold and Wait, No Preemption, and Circular Wait. Preemption is a solution, not a condition.',
      reference: 'Silberschatz - Operating System Concepts Chapter 8',
      previousYear: 'GATE CS 2021',
      subtopicId: bankerSubtopic.id,
      createdById: faculty.id,
    },
  });

  const q2 = await prisma.question.create({
    data: {
      text: "Which of the following algorithms can handle graphs with negative edge weights? (Select all that apply)",
      type: QuestionType.MSQ,
      difficulty: Difficulty.HARD,
      marks: 2.0,
      negativeMarks: 0.0,
      options: [
        { text: "Dijkstra's Algorithm", latex: '' },
        { text: 'Bellman-Ford Algorithm', latex: '' },
        { text: 'Floyd-Warshall Algorithm', latex: '' },
        { text: 'Kruskal Algorithm', latex: '' },
      ],
      correctAnswer: [1, 2], // Bellman-Ford and Floyd-Warshall
      explanation: "Bellman-Ford and Floyd-Warshall handle negative edge weights. Dijkstra's algorithm fails with negative edges. Kruskal is for Minimum Spanning Tree.",
      reference: 'CORMEN - Introduction to Algorithms Chapter 24',
      previousYear: 'GATE CS 2022',
      subtopicId: dijkstraSubtopic.id,
      createdById: faculty.id,
    },
  });

  const q3 = await prisma.question.create({
    data: {
      text: "Consider a system with 5 processes (P0 to P4) and 3 resource types (A, B, C). If the safe sequence calculation yields a total remaining available vector of [3, 3, 2], calculate the maximum number of instances of resource A that can be allocated.",
      type: QuestionType.NAT,
      difficulty: Difficulty.HARD,
      marks: 2.0,
      negativeMarks: 0.0,
      options: [],
      correctAnswer: { min: 3, max: 3, value: 3 },
      explanation: 'From the Banker algorithm matrix, the maximum available allocation for resource A is 3.',
      reference: 'GATE CS Official Paper 2023 NAT section',
      previousYear: 'GATE CS 2023',
      subtopicId: bankerSubtopic.id,
      createdById: faculty.id,
    },
  });

  // 5. Mock Test (test-demo-123)
  const mockTest = await prisma.mockTest.upsert({
    where: { id: 'test-demo-123' },
    update: {
      title: 'CS8601 Database Management Systems - Mid-Semester CBT Assessment',
      description: 'Comprehensive CBT Exam covering Operating Systems, Database Systems, Algorithms, and Data Structures.',
      targetDepartment: 'CSE',
      isPublished: true,
    },
    create: {
      id: 'test-demo-123',
      title: 'CS8601 Database Management Systems - Mid-Semester CBT Assessment',
      description: 'Comprehensive CBT Exam covering Operating Systems, Database Systems, Algorithms, and Data Structures.',
      examType: ExamType.SCHEDULED,
      durationMinutes: 180,
      totalMarks: 5.0,
      startTime: new Date(Date.now() - 3600000), // Started 1 hour ago
      endTime: new Date(Date.now() + 86400000), // Ends tomorrow
      targetDepartment: 'CSE',
      targetYear: 3,
      targetSection: 'A',
      isPublished: true,
      resultVisibility: ResultVisibility.IMMEDIATE,
      solutionVisibility: SolutionVisibility.SHOW_AFTER_RESULT,
      shuffleQuestions: true,
      shuffleOptions: true,
      maxViolations: 5,
      instructions: '1. Total Duration: 180 Minutes.\n2. Negative marking applies ONLY for MCQ (-0.33 for 1 mark, -0.67 for 2 marks).\n3. MSQ and NAT have NO negative marking.\n4. Scientific Calculator is accessible via the top right corner.\n5. Fullscreen mode is mandatory. Exceeding 5 tab-switches will result in auto-submission.',
      createdById: faculty.id,
    },
  });

  await prisma.mockTestQuestion.deleteMany({ where: { mockTestId: mockTest.id } });
  await prisma.mockTestQuestion.createMany({
    data: [
      { mockTestId: mockTest.id, questionId: q1.id, order: 1 },
      { mockTestId: mockTest.id, questionId: q2.id, order: 2 },
      { mockTestId: mockTest.id, questionId: q3.id, order: 3 },
    ],
  });

  // 6. Test Assignments
  await prisma.testAssignment.deleteMany({ where: { testId: mockTest.id } });
  await prisma.testAssignment.create({
    data: {
      testId: mockTest.id,
      studentId: student1.id,
      status: 'IN_PROGRESS',
      startedAt: new Date(Date.now() - 15 * 60 * 1000),
      riskLevel: RiskLevel.SAFE,
      violationCount: 0,
    },
  });

  await prisma.testAssignment.create({
    data: {
      testId: mockTest.id,
      studentId: student2.id,
      status: 'SCHEDULED',
      riskLevel: RiskLevel.SAFE,
      violationCount: 0,
    },
  });

  console.log('✅ GSMAS Seed completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
