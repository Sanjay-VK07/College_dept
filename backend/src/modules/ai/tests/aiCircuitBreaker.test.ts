import { AICircuitBreakerService } from '../services/aiCircuitBreakerService';

describe('AICircuitBreakerService Admin Control Tests', () => {
  afterEach(() => {
    // Reset circuit breaker to normal operational state after each test
    AICircuitBreakerService.setCircuitBreaker(false);
    AICircuitBreakerService.setRoutingMode('PRIMARY');
  });

  it('should allow AI execution when circuit breaker is closed (NORMAL OPERATIONAL)', () => {
    AICircuitBreakerService.setCircuitBreaker(false);
    const check = AICircuitBreakerService.checkCircuitBreaker();

    expect(check.allowed).toBe(true);
  });

  it('should block AI execution with maintenance message when circuit breaker is opened', () => {
    AICircuitBreakerService.setCircuitBreaker(true);
    const check = AICircuitBreakerService.checkCircuitBreaker();

    expect(check.allowed).toBe(false);
    expect(check.message).toContain('temporarily paused by administrator');
  });

  it('should return system state including routing mode', () => {
    const state = AICircuitBreakerService.getState();
    expect(state).toHaveProperty('circuitBreakerOpen');
    expect(state).toHaveProperty('activeModel');
  });
});
