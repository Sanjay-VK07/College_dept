import { GenerationDistributionService } from '../services/generationDistributionService';
import { Role } from '@prisma/client';

describe('Generation Distribution Tests', () => {
  it('1. Calculates exact integer counts via Hamilton largest remainder method', () => {
    const diffAlloc = GenerationDistributionService.allocateIntegerCounts(50, {
      EASY: 20,
      MEDIUM: 50,
      HARD: 30,
    });

    expect(diffAlloc.EASY).toBe(10);
    expect(diffAlloc.MEDIUM).toBe(25);
    expect(diffAlloc.HARD).toBe(15);
    expect(diffAlloc.EASY + diffAlloc.MEDIUM + diffAlloc.HARD).toBe(50);
  });

  it('2. Ensures integer allocation sum equals total requested count exactly with odd percentages', () => {
    const typeAlloc = GenerationDistributionService.allocateIntegerCounts(50, {
      MCQ: 60,
      MSQ: 10,
      NAT: 30,
    });

    expect(typeAlloc.MCQ).toBe(30);
    expect(typeAlloc.MSQ).toBe(5);
    expect(typeAlloc.NAT).toBe(15);
    expect(typeAlloc.MCQ + typeAlloc.MSQ + typeAlloc.NAT).toBe(50);
  });

  it('3. Rejects difficulty distribution when sum != 100%', async () => {
    const result = await GenerationDistributionService.validateGenerationRequest({
      totalQuestions: 50,
      difficultyDistribution: { EASY: 40, MEDIUM: 50, HARD: 30 }, // Sum = 120%
      typeDistribution: { MCQ: 60, MSQ: 10, NAT: 30 },
      userId: 'test-user',
      role: Role.FACULTY,
    });

    expect(result.isValid).toBe(false);
    expect(result.errorCode).toBe('INVALID_DIFFICULTY_DISTRIBUTION');
  });

  it('4. Rejects question type distribution when sum != 100%', async () => {
    const result = await GenerationDistributionService.validateGenerationRequest({
      totalQuestions: 50,
      difficultyDistribution: { EASY: 20, MEDIUM: 50, HARD: 30 },
      typeDistribution: { MCQ: 50, MSQ: 10, NAT: 30 }, // Sum = 90%
      userId: 'test-user',
      role: Role.FACULTY,
    });

    expect(result.isValid).toBe(false);
    expect(result.errorCode).toBe('INVALID_TYPE_DISTRIBUTION');
  });
});
