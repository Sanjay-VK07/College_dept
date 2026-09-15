import { Response } from 'express';
import { AuthRequest } from '../../../middlewares/authMiddleware';
import { SolutionService } from '../services/solutionService';

export class AISolutionController {
  public static async generateSolution(req: AuthRequest, res: Response) {
    try {
      if (!req.user) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
      }

      const { questionId, generationRequestId } = req.body;
      const result = await SolutionService.generateSolution(req.user.id, req.user.role, {
        questionId,
        generationRequestId,
      });

      return res.status(200).json(result);
    } catch (error: any) {
      if (error.message.includes('Forbidden')) {
        return res.status(403).json({ success: false, message: error.message });
      }
      return res.status(400).json({ success: false, message: error.message });
    }
  }

  public static async getPendingSolutions(req: AuthRequest, res: Response) {
    try {
      if (!req.user) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
      }

      const status = req.query.status as any;
      const result = await SolutionService.getPendingSolutions({
        userId: req.user.id,
        role: req.user.role,
        status,
      });

      return res.status(200).json(result);
    } catch (error: any) {
      if (error.message.includes('Forbidden')) {
        return res.status(403).json({ success: false, message: error.message });
      }
      console.warn('[getPendingSolutions DB Offline Fallback]:', error?.message || error);
      return res.status(200).json({ success: true, data: [] });
    }
  }

  public static async approveSolution(req: AuthRequest, res: Response) {
    try {
      if (!req.user) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
      }

      const { id } = req.params;
      const result = await SolutionService.approveSolution(id, req.user.id, req.user.role);

      return res.status(200).json(result);
    } catch (error: any) {
      if (error.message.includes('Forbidden')) {
        return res.status(403).json({ success: false, message: error.message });
      }
      return res.status(400).json({ success: false, message: error.message });
    }
  }

  public static async rejectSolution(req: AuthRequest, res: Response) {
    try {
      if (!req.user) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
      }

      const { id } = req.params;
      const result = await SolutionService.rejectSolution(id, req.user.id, req.user.role);

      return res.status(200).json(result);
    } catch (error: any) {
      if (error.message.includes('Forbidden')) {
        return res.status(403).json({ success: false, message: error.message });
      }
      return res.status(400).json({ success: false, message: error.message });
    }
  }

  public static async editSolution(req: AuthRequest, res: Response) {
    try {
      if (!req.user) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
      }

      const { id } = req.params;
      const { draftAnswer, draftExplanation } = req.body;

      const result = await SolutionService.editSolution(id, req.user.id, req.user.role, {
        draftAnswer,
        draftExplanation,
      });

      return res.status(200).json(result);
    } catch (error: any) {
      if (error.message.includes('Forbidden')) {
        return res.status(403).json({ success: false, message: error.message });
      }
      return res.status(400).json({ success: false, message: error.message });
    }
  }
}
