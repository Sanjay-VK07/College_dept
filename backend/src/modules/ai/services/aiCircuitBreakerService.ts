import { prisma } from '../../../config/prisma';

export interface CircuitBreakerState {
  circuitBreakerOpen: boolean;
  routingMode: 'PRIMARY' | 'FALLBACK';
  primaryModelName: string;
  fallbackModelName: string;
  activeModel: string;
  updatedAt?: string;
  reason?: string;
}

export class AICircuitBreakerService {
  private static SETTING_KEY = 'AI_CIRCUIT_BREAKER_STATE';
  private static cachedState: CircuitBreakerState = {
    circuitBreakerOpen: false,
    routingMode: 'PRIMARY',
    primaryModelName: 'gemini-1.5-flash',
    fallbackModelName: 'gemini-1.5-pro',
    activeModel: 'gemini-1.5-flash',
  };
  private static lastCacheFetchTime: number = 0;
  private static CACHE_TTL_MS = 2000; // 2-second in-memory TTL cache

  /**
   * Synchronous pre-flight circuit breaker check using cached state for fast execution.
   */
  public static checkCircuitBreaker(): { allowed: boolean; message?: string } {
    // Background async refresh if TTL expired
    if (Date.now() - this.lastCacheFetchTime > this.CACHE_TTL_MS) {
      this.getStateAsync().catch(() => {});
    }

    if (this.cachedState.circuitBreakerOpen) {
      return {
        allowed: false,
        message: 'AI operations are temporarily paused by administrator for maintenance.',
      };
    }
    return { allowed: true };
  }

  /**
   * Asynchronously fetches current circuit state from DB with TTL caching.
   */
  public static async getStateAsync(): Promise<CircuitBreakerState> {
    const now = Date.now();
    if (now - this.lastCacheFetchTime < this.CACHE_TTL_MS) {
      return this.cachedState;
    }

    try {
      const setting = await prisma.systemSetting.findUnique({
        where: { key: this.SETTING_KEY },
      });

      if (setting && setting.value) {
        const parsed = JSON.parse(setting.value);
        this.cachedState = {
          circuitBreakerOpen: Boolean(parsed.circuitBreakerOpen),
          routingMode: parsed.routingMode === 'FALLBACK' ? 'FALLBACK' : 'PRIMARY',
          primaryModelName: parsed.primaryModelName || 'gemini-1.5-flash',
          fallbackModelName: parsed.fallbackModelName || 'gemini-1.5-pro',
          activeModel: parsed.routingMode === 'FALLBACK' ? (parsed.fallbackModelName || 'gemini-1.5-pro') : (parsed.primaryModelName || 'gemini-1.5-flash'),
          updatedAt: setting.updatedAt.toISOString(),
          reason: parsed.reason || 'Admin state update',
        };
      }
    } catch (err) {
      // Graceful fallback to existing cachedState if DB is unreachable
    }

    this.lastCacheFetchTime = now;
    return this.cachedState;
  }

  /**
   * Synchronous getter for current state.
   */
  public static getState(): CircuitBreakerState {
    return this.cachedState;
  }

  /**
   * Toggles circuit breaker state and persists to database across all backend instances.
   */
  public static async setCircuitBreaker(open: boolean, updatedById?: string, reason?: string): Promise<CircuitBreakerState> {
    const currentState = await this.getStateAsync();
    const newState: CircuitBreakerState = {
      ...currentState,
      circuitBreakerOpen: open,
      updatedAt: new Date().toISOString(),
      reason: reason || (open ? 'Admin paused AI operations' : 'Admin resumed AI operations'),
    };

    try {
      await prisma.systemSetting.upsert({
        where: { key: this.SETTING_KEY },
        update: {
          value: JSON.stringify(newState),
          description: 'Distributed AI Circuit Breaker Control State',
        },
        create: {
          key: this.SETTING_KEY,
          value: JSON.stringify(newState),
          description: 'Distributed AI Circuit Breaker Control State',
        },
      });

      if (updatedById) {
        await prisma.auditLog.create({
          data: {
            userId: updatedById,
            action: open ? 'PAUSE_AI_CIRCUIT' : 'RESUME_AI_CIRCUIT',
            resource: 'AICircuitBreaker',
            details: `AI Circuit Breaker set to ${open ? 'PAUSED' : 'ACTIVE'}. Reason: ${newState.reason}`,
          },
        });
      }
    } catch (err) {
      console.error('[AICircuitBreakerService] Error persisting state to DB:', err);
    }

    this.cachedState = newState;
    this.lastCacheFetchTime = Date.now();
    return newState;
  }

  /**
   * Sets active model routing mode and persists to database.
   */
  public static async setRoutingMode(mode: 'PRIMARY' | 'FALLBACK'): Promise<CircuitBreakerState> {
    const currentState = await this.getStateAsync();
    const newState: CircuitBreakerState = {
      ...currentState,
      routingMode: mode,
      activeModel: mode === 'PRIMARY' ? currentState.primaryModelName : currentState.fallbackModelName,
      updatedAt: new Date().toISOString(),
    };

    try {
      await prisma.systemSetting.upsert({
        where: { key: this.SETTING_KEY },
        update: { value: JSON.stringify(newState) },
        create: { key: this.SETTING_KEY, value: JSON.stringify(newState), description: 'Distributed AI Circuit Breaker Control State' },
      });
    } catch (err) {
      console.error('[AICircuitBreakerService] Error persisting routing mode:', err);
    }

    this.cachedState = newState;
    this.lastCacheFetchTime = Date.now();
    return newState;
  }
}
