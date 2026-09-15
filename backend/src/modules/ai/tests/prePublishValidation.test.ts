import { ExamValidationService } from '../services/examValidationService';
import { QuestionType, Difficulty, VerificationStatus, QuestionOrigin, ExamStatus } from '@prisma/client';

describe('Pre-Publish Validation & Exam Preview Test Suite', () => {
  const createMockExam = (overrides: any = {}) => {
    const baseExam = {
      id: 'exam_test_101',
      title: 'Computer Networks - Mid Term Exam',
      description: 'Standard mock examination for 3rd Year CSE',
      targetDepartment: 'Computer Science and Engineering',
      durationMinutes: 180,
      totalMarks: 3.0,
      startTime: new Date('2026-10-01T09:00:00Z'),
      endTime: new Date('2026-10-01T12:00:00Z'),
      isPublished: false,
      status: ExamStatus.DRAFT,
      instructions: '1. All questions are compulsory.\n2. Negative marking applies to MCQ.',
      testQuestions: [
        {
          order: 1,
          questionId: 'q_101',
          questionVersionId: 'qv_101',
          questionVersion: {
            id: 'qv_101',
            text: 'What is the default port for HTTP?',
            type: QuestionType.MCQ,
            difficulty: Difficulty.EASY,
            marks: 1.0,
            negativeMarks: 0.33,
            options: [{ text: '80' }, { text: '443' }, { text: '21' }, { text: '22' }],
            correctAnswer: [0],
            imageUrl: null,
          },
          question: {
            id: 'q_101',
            text: 'What is the default port for HTTP?',
            type: QuestionType.MCQ,
            difficulty: Difficulty.EASY,
            verificationStatus: VerificationStatus.VERIFIED,
            origin: QuestionOrigin.SOURCE,
            containsFigure: false,
            subtopic: { topic: { id: 't1', name: 'Application Layer' } },
          },
        },
        {
          order: 2,
          questionId: 'q_102',
          questionVersionId: 'qv_102',
          questionVersion: {
            id: 'qv_102',
            text: 'Which protocols run over UDP?',
            type: QuestionType.MSQ,
            difficulty: Difficulty.MEDIUM,
            marks: 1.0,
            negativeMarks: 0.0,
            options: [{ text: 'DNS' }, { text: 'DHCP' }, { text: 'TCP' }, { text: 'BGP' }],
            correctAnswer: [0, 1],
            imageUrl: null,
          },
          question: {
            id: 'q_102',
            text: 'Which protocols run over UDP?',
            type: QuestionType.MSQ,
            difficulty: Difficulty.MEDIUM,
            verificationStatus: VerificationStatus.VERIFIED,
            origin: QuestionOrigin.AI_GENERATED,
            containsFigure: false,
            subtopic: { topic: { id: 't2', name: 'Transport Layer' } },
          },
        },
        {
          order: 3,
          questionId: 'q_103',
          questionVersionId: 'qv_103',
          questionVersion: {
            id: 'qv_103',
            text: 'Calculate maximum throughput for 100Mbps link in Mbps.',
            type: QuestionType.NAT,
            difficulty: Difficulty.HARD,
            marks: 1.0,
            negativeMarks: 0.0,
            options: [],
            correctAnswer: '100',
            imageUrl: null,
          },
          question: {
            id: 'q_103',
            text: 'Calculate maximum throughput for 100Mbps link in Mbps.',
            type: QuestionType.NAT,
            difficulty: Difficulty.HARD,
            verificationStatus: VerificationStatus.VERIFIED,
            origin: QuestionOrigin.SOURCE,
            containsFigure: false,
            subtopic: { topic: { id: 't3', name: 'Data Link Layer' } },
          },
        },
      ],
    };

    return { ...baseExam, ...overrides };
  };

  it('1. should pass pre-publish validation for a valid draft examination', () => {
    const exam = createMockExam();
    const result = ExamValidationService.validatePrePublish(exam);

    expect(result.canPublish).toBe(true);
    expect(result.blocking.length).toBe(0);
    expect(result.summary.questionCount).toBe(3);
    expect(result.summary.totalMarks).toBe(3.0);
    expect(result.summary.sourceCount).toBe(2);
    expect(result.summary.aiGeneratedCount).toBe(1);
  });

  it('2. should block publication if exam contains zero questions', () => {
    const exam = createMockExam({ testQuestions: [] });
    const result = ExamValidationService.validatePrePublish(exam);

    expect(result.canPublish).toBe(false);
    expect(result.blocking).toContain('Examination contains zero questions.');
  });

  it('3. should block publication if any question is NEEDS_REVIEW or REJECTED', () => {
    const exam = createMockExam();
    exam.testQuestions[1].question.verificationStatus = VerificationStatus.NEEDS_REVIEW;

    const result = ExamValidationService.validatePrePublish(exam);

    expect(result.canPublish).toBe(false);
    expect(result.blocking.some((msg) => msg.includes("status 'NEEDS_REVIEW'"))).toBe(true);
  });

  it('4. should block publication if question has missing or empty correct answer', () => {
    const exam = createMockExam();
    exam.testQuestions[0].questionVersion.correctAnswer = null;

    const result = ExamValidationService.validatePrePublish(exam);

    expect(result.canPublish).toBe(false);
    expect(result.blocking).toContain('Question #1 is missing a correct answer definition.');
  });

  it('5. should block publication if MCQ has less than 2 options', () => {
    const exam = createMockExam();
    exam.testQuestions[0].questionVersion.options = [{ text: 'Only One Option' }];

    const result = ExamValidationService.validatePrePublish(exam);

    expect(result.canPublish).toBe(false);
    expect(result.blocking).toContain('Question #1 (MCQ) must have at least 2 options.');
  });

  it('6. should block publication if question marks are invalid (<= 0)', () => {
    const exam = createMockExam();
    exam.testQuestions[0].questionVersion.marks = 0;

    const result = ExamValidationService.validatePrePublish(exam);

    expect(result.canPublish).toBe(false);
    expect(result.blocking).toContain('Question #1 has invalid marks (0). Marks must be > 0.');
  });

  it('7. should block publication if total configured marks do not match sum of question marks', () => {
    const exam = createMockExam({ totalMarks: 10.0 }); // Sum is 3.0, expected is 10.0

    const result = ExamValidationService.validatePrePublish(exam);

    expect(result.canPublish).toBe(false);
    expect(result.blocking.some((msg) => msg.includes('Total marks mismatch'))).toBe(true);
  });

  it('8. should block publication if duplicate questions exist', () => {
    const exam = createMockExam();
    exam.testQuestions.push({ ...exam.testQuestions[0] });

    const result = ExamValidationService.validatePrePublish(exam);

    expect(result.canPublish).toBe(false);
    expect(result.blocking.some((msg) => msg.includes('duplicate question ID(s)'))).toBe(true);
  });

  it('9. should block publication if figure asset indicates missing URL or file', () => {
    const exam = createMockExam();
    exam.testQuestions[0].question.containsFigure = true;
    exam.testQuestions[0].questionVersion.imageUrl = '/uploads/diagrams/non_existent_figure_asset.png';

    const result = ExamValidationService.validatePrePublish(exam);

    expect(result.canPublish).toBe(false);
    expect(result.blocking.some((msg) => msg.includes('figure asset file is missing on server'))).toBe(true);
  });

  it('10. should block publication if schedule has endTime <= startTime', () => {
    const exam = createMockExam({
      startTime: new Date('2026-10-01T12:00:00Z'),
      endTime: new Date('2026-10-01T09:00:00Z'),
    });

    const result = ExamValidationService.validatePrePublish(exam);

    expect(result.canPublish).toBe(false);
    expect(result.blocking).toContain('Exam end time must be scheduled after start time.');
  });

  it('11. should block publication if duration is <= 0', () => {
    const exam = createMockExam({ durationMinutes: 0 });

    const result = ExamValidationService.validatePrePublish(exam);

    expect(result.canPublish).toBe(false);
    expect(result.blocking).toContain('Exam duration must be greater than 0 minutes.');
  });

  it('12. should block publication if question is missing a QuestionVersion snapshot', () => {
    const exam = createMockExam();
    delete exam.testQuestions[0].questionVersionId;

    const result = ExamValidationService.validatePrePublish(exam);

    expect(result.canPublish).toBe(false);
    expect(result.blocking).toContain('Question #1 is missing a frozen QuestionVersion snapshot.');
  });

  it('13. should allow AI_GENERATED questions if verificationStatus is VERIFIED', () => {
    const exam = createMockExam();
    // Question 2 is AI_GENERATED and VERIFIED
    expect(exam.testQuestions[1].question.origin).toBe(QuestionOrigin.AI_GENERATED);
    expect(exam.testQuestions[1].question.verificationStatus).toBe(VerificationStatus.VERIFIED);

    const result = ExamValidationService.validatePrePublish(exam);
    expect(result.canPublish).toBe(true);
  });

  it('14. should produce quality warning when > 50% questions are AI_GENERATED', () => {
    const exam = createMockExam();
    exam.testQuestions[0].question.origin = QuestionOrigin.AI_GENERATED;
    exam.testQuestions[1].question.origin = QuestionOrigin.AI_GENERATED;
    // 2 out of 3 = 67% AI_GENERATED

    const result = ExamValidationService.validatePrePublish(exam);
    expect(result.canPublish).toBe(true);
    expect(result.warnings.some((w) => w.includes('High ratio of AI-generated questions'))).toBe(true);
  });
});
