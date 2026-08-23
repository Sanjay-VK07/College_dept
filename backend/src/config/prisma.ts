import { PrismaClient } from '@prisma/client';

declare global {
  // Prevent multiple instances of PrismaClient in development with hot reload
  // eslint-disable-next-line no-var
  var __prismaSingleton: PrismaClient | undefined;
}

export const prisma =
  globalThis.__prismaSingleton ||
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalThis.__prismaSingleton = prisma;
}

// Concurrency tracking & slow query instrumentation
let activeQueries = 0;
let maxObservedConcurrency = 0;

export function getPrismaConcurrencyStats() {
  return { activeQueries, maxObservedConcurrency };
}

prisma.$use(async (params, next) => {
  activeQueries++;
  if (activeQueries > maxObservedConcurrency) {
    maxObservedConcurrency = activeQueries;
  }
  const startTime = Date.now();
  if (activeQueries >= 5) {
    console.warn(`[Prisma Concurrency Spike] ${activeQueries} active queries in progress. Query: ${params.model}.${params.action}`);
  }
  try {
    const result = await next(params);
    const durationMs = Date.now() - startTime;
    if (durationMs > 1000) {
      console.warn(`[Prisma Slow Query] ${params.model}.${params.action} took ${durationMs}ms (Active during execution: ${activeQueries})`);
    }
    return result;
  } finally {
    activeQueries--;
  }
});
