export class AICircuitBreakerService {
  private static circuitBreakerOpen: boolean = false;
  private static routingMode: 'PRIMARY' | 'FALLBACK' = 'PRIMARY';
  private static primaryModelName: string = 'gemini-1.5-flash';
  private static fallbackModelName: string = 'gemini-1.5-pro';

  /**
   * Pre-flight circuit breaker check before executing AI calls.
   */
  public static checkCircuitBreaker(): { allowed: boolean; message?: string } {
    if (this.circuitBreakerOpen) {
      return {
        allowed: false,
        message: 'AI operations are temporarily paused by administrator for maintenance.',
      };
    }
    return { allowed: true };
  }

  /**
   * Toggles the system circuit breaker state.
   */
  public static setCircuitBreaker(open: boolean): { circuitBreakerOpen: boolean } {
    this.circuitBreakerOpen = open;
    return { circuitBreakerOpen: this.circuitBreakerOpen };
  }

  /**
   * Gets current circuit breaker and model routing state.
   */
  public static getState() {
    return {
      circuitBreakerOpen: this.circuitBreakerOpen,
      routingMode: this.routingMode,
      primaryModelName: this.primaryModelName,
      fallbackModelName: this.fallbackModelName,
      activeModel: this.routingMode === 'PRIMARY' ? this.primaryModelName : this.fallbackModelName,
    };
  }

  /**
   * Sets active model routing mode.
   */
  public static setRoutingMode(mode: 'PRIMARY' | 'FALLBACK') {
    this.routingMode = mode;
    return this.getState();
  }
}
