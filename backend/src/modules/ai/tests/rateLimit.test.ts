import { createAIRateLimiter, clearRateLimitStore } from '../../../middlewares/rateLimiter';

describe('Phase 8 Rate Limiting & Abuse Prevention Tests', () => {
  beforeEach(() => {
    clearRateLimitStore();
  });

  it('should enforce rate limit and return HTTP 429 when max requests threshold is exceeded', () => {
    const limiter = createAIRateLimiter({ maxRequests: 2, featureName: 'TestFeature', windowMs: 60000 });
    const req: any = { ip: '127.0.0.1', headers: {}, socket: {} };
    const res: any = {
      setHeader: jest.fn(),
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    const next = jest.fn();

    // 1st & 2nd call pass
    limiter(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);

    limiter(req, res, next);
    expect(next).toHaveBeenCalledTimes(2);

    // 3rd call exceeds threshold -> 429
    limiter(req, res, next);
    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        type: 'AI_RATE_LIMITED',
      })
    );
  });
});
