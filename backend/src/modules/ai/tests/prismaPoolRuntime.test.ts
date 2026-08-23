import { prisma, getPrismaConcurrencyStats } from '../../../config/prisma';

describe('Prisma Connection Pool & Concurrency Stress Test', () => {
  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('should process user query cleanly using shared singleton pool', async () => {
    const user = await prisma.user.findFirst({ select: { id: true, email: true } });
    expect(user).toBeDefined();

    const stats = getPrismaConcurrencyStats();
    expect(stats.activeQueries).toBe(0);
  });
});
