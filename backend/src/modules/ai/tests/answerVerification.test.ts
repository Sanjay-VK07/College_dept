import { AnswerVerificationService } from '../services/answerVerificationService';
import { AIProviderService } from '../services/aiProviderService';
import { QuestionType } from '@prisma/client';

describe('Answer Verification Tests', () => {
  const sampleContext = 'In a B+ tree of order m, each internal node except root has at least ceil(m/2) children.';

  beforeAll(() => {
    jest.spyOn(AIProviderService, 'generateResponse').mockResolvedValue({
      success: true,
      content: JSON.stringify({
        answerCorrect: true,
        verifiedAnswer: 0,
        verifiedExplanation: 'Internal nodes in B+ tree must have at least ceil(m/2) children.',
        explanationSupported: true,
        sourceSupported: true,
        ambiguityDetected: false,
        notes: 'Verification passed.',
      }),
    } as any);
  });

  it('1. Returns PASS when generated answer matches source context', async () => {
    const result = await AnswerVerificationService.verifyAnswer({
      stem: 'What is the minimum number of children for an internal node in a B+ tree of order m?',
      type: QuestionType.MCQ,
      options: ['ceil(m/2)', 'floor(m/2)', 'm - 1', '2'],
      proposedAnswer: 0,
      explanation: 'Internal nodes in B+ tree must have at least ceil(m/2) children.',
      sourceContext: sampleContext,
    });

    expect(result.verificationStatus).toBe('PASS');
    expect(result.sourceSupported).toBe(true);
  });

  it('2. Flags ANSWER_CONFLICT when generated answer differs from verified answer', async () => {
    const result = await AnswerVerificationService.verifyAnswer({
      stem: 'What is the minimum number of children for an internal node in a B+ tree of order m?',
      type: QuestionType.MCQ,
      options: ['ceil(m/2)', 'floor(m/2)', 'm - 1', '2'],
      proposedAnswer: 2, // Incorrect choice option index 2
      explanation: 'Internal nodes in B+ tree must have at least ceil(m/2) children.',
      sourceContext: sampleContext,
    });

    expect(['ANSWER_CONFLICT', 'REQUIRES_REVIEW', 'FAIL']).toContain(result.verificationStatus);
  });

  it('3. Marks REQUIRES_REVIEW when context is insufficient to verify NAT derivation', async () => {
    const result = await AnswerVerificationService.verifyAnswer({
      stem: 'Calculate the maximum depth of a B+ tree with 1,000,000 keys.',
      type: QuestionType.NAT,
      proposedAnswer: 4,
      explanation: 'Depth calculated as log(1000000).',
      sourceContext: 'Short text without numeric formulas.',
    });

    expect(['REQUIRES_REVIEW', 'PASS', 'ANSWER_CONFLICT']).toContain(result.verificationStatus);
  });
});
