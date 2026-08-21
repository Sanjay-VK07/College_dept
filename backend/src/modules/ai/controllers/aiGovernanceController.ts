import { Response } from 'express';
import { AuthRequest } from '../../../middlewares/authMiddleware';
import { TokenCostService } from '../services/tokenCostService';
import { AICircuitBreakerService } from '../services/aiCircuitBreakerService';
import { ModelEvaluationService } from '../services/modelEvaluationService';

export class AIGovernanceController {
  public static async getOverview(req: AuthRequest, res: Response) {
    try {
      if (!req.user || req.user.role !== 'ADMIN') {
        return res.status(403).json({ success: false, message: 'Forbidden: Admin access only.' });
      }

      const [costMetrics, evaluationOverview] = await Promise.all([
        TokenCostService.getSystemCostMetrics(),
        ModelEvaluationService.evaluateAllPipelines(),
      ]);

      const circuitBreakerState = AICircuitBreakerService.getState();

      return res.status(200).json({
        success: true,
        data: {
          costMetrics,
          circuitBreakerState,
          evaluationOverview,
        },
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  public static async setCircuitBreaker(req: AuthRequest, res: Response) {
    try {
      if (!req.user || req.user.role !== 'ADMIN') {
        return res.status(403).json({ success: false, message: 'Forbidden: Admin access only.' });
      }

      const { open } = req.body;
      const state = AICircuitBreakerService.setCircuitBreaker(Boolean(open));

      return res.status(200).json({
        success: true,
        message: open
          ? 'System Circuit Breaker ACTIVATED. AI operations paused.'
          : 'System Circuit Breaker DEACTIVATED. AI operations resumed.',
        data: state,
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  public static async getEvaluation(req: AuthRequest, res: Response) {
    try {
      if (!req.user || req.user.role !== 'ADMIN') {
        return res.status(403).json({ success: false, message: 'Forbidden: Admin access only.' });
      }

      const evaluation = await ModelEvaluationService.evaluateAllPipelines();

      return res.status(200).json({
        success: true,
        data: evaluation,
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }
}
