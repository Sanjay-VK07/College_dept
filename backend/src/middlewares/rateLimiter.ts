import { Response, NextFunction } from 'express';
import { AuthRequest } from './authMiddleware';

interface RateLimiterOptions {
  windowMs?: number;
  maxRequests: number;
  featureName: string;
}

interface RateLimitRecord {
  count: number;
  resetTime: number;
}

const rateLimitStore = new Map<string, RateLimitRecord>();

// Cleanup stale entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of rateLimitStore.entries()) {
    if (now > record.resetTime) {
      rateLimitStore.delete(key);
    }
  }
}, 300000);

export function createAIRateLimiter(options: RateLimiterOptions) {
  const windowMs = options.windowMs || 60000; // 1 minute window
  const maxRequests = options.maxRequests;
  const featureName = options.featureName;

  return (req: AuthRequest, res: Response, next: NextFunction) => {
    const userId = req.user?.id;
    const clientIp = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
    const key = `${featureName}:${userId ? `user_${userId}` : `ip_${clientIp}`}`;

    const now = Date.now();
    let record = rateLimitStore.get(key);

    if (!record || now > record.resetTime) {
      record = { count: 1, resetTime: now + windowMs };
      rateLimitStore.set(key, record);
      return next();
    }

    if (record.count >= maxRequests) {
      const retryAfterSec = Math.ceil((record.resetTime - now) / 1000);
      res.setHeader('Retry-After', String(retryAfterSec));
      return res.status(429).json({
        success: false,
        type: 'AI_RATE_LIMITED',
        message: `Rate limit exceeded for ${featureName}. Maximum ${maxRequests} requests per minute allowed. Try again in ${retryAfterSec}s.`,
      });
    }

    record.count++;
    return next();
  };
}

export function clearRateLimitStore() {
  rateLimitStore.clear();
}
