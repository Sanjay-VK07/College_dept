import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../../middlewares/authMiddleware';
import { StructuredLogger } from '../utils/structuredLogger';

export function aiErrorHandler(err: any, req: AuthRequest, res: Response, next: NextFunction) {
  const correlationId = `corr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const statusCode = err.status || err.statusCode || 500;
  const errorType = err.type || 'CONTROLLED_ERROR';

  // Log full detailed error internally with redaction
  StructuredLogger.error(`AI API Error: ${err.message || 'Unknown error'}`, {
    service: 'AI_MODULE',
    operation: req.path,
    userId: req.user?.id,
    correlationId,
    status: statusCode,
    errorCode: err.code || errorType,
    stack: err.stack,
  });

  // Never expose raw stack trace, SQL, database details, or provider internals to client
  return res.status(statusCode).json({
    success: false,
    type: errorType,
    correlationId,
    message: err.message && !err.stack ? err.message : 'An error occurred while processing your request. Please try again.',
  });
}
