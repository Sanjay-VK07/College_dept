import { AIResilience, AIResilienceError } from '../utils/aiResilience';
import { AICircuitBreakerService } from '../services/aiCircuitBreakerService';

describe('Phase 8 Provider Resilience & Distributed Circuit Breaker Tests', () => {
  it('should timeout and throw AIResilienceError on slow provider operation', async () => {
    await expect(
      AIResilience.executeWithResilience(
        async (signal) => {
          return await new Promise((_, reject) => {
            const timer = setTimeout(() => reject(new Error('Finished')), 500);
            signal.addEventListener('abort', () => {
              clearTimeout(timer);
              const err = new Error('aborted');
              err.name = 'AbortError';
              reject(err);
            });
          });
        },
        { timeoutMs: 50, maxRetries: 0 }
      )
    ).rejects.toThrow(AIResilienceError);
  });

  it('should block AI calls when circuit breaker is toggled open and allow when closed', async () => {
    await AICircuitBreakerService.setCircuitBreaker(true, 'admin_1', 'Maintenance test');
    const checkOpen = await AICircuitBreakerService.checkCircuitBreaker();
    expect(checkOpen.allowed).toBe(false);

    await AICircuitBreakerService.setCircuitBreaker(false, 'admin_1', 'Resume test');
    const checkClosed = await AICircuitBreakerService.checkCircuitBreaker();
    expect(checkClosed.allowed).toBe(true);
  });
});
