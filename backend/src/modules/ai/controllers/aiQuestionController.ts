import { Response } from 'express';
import { AuthRequest } from '../../../middlewares/authMiddleware';
import { QuestionGenerationService } from '../services/questionGenerationService';

export class AIQuestionController {
  public static async generateQuestions(req: AuthRequest, res: Response) {
    try {
      if (!req.user) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
      }

      const { subjectId, moduleId, topicId, subtopicId, questionType, difficulty, count, documentId, generationRequestId } = req.body;

      const result = await QuestionGenerationService.generateQuestions(
        req.user.id,
        req.user.role,
        {
          subjectId,
          moduleId,
          topicId,
          subtopicId,
          questionType,
          difficulty,
          count: count ? Number(count) : 1,
          documentId,
          generationRequestId,
        }
      );

      return res.status(200).json(result);
    } catch (error: any) {
      if (error.message.includes('Forbidden')) {
        return res.status(403).json({ success: false, message: error.message });
      }
      return res.status(400).json({ success: false, message: error.message });
    }
  }

  public static async getPendingQuestions(req: AuthRequest, res: Response) {
    try {
      if (!req.user) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
      }

      const status = req.query.status as any;
      const page = req.query.page ? Number(req.query.page) : 1;
      const limit = req.query.limit ? Number(req.query.limit) : 10;

      const result = await QuestionGenerationService.getPendingQuestions({
        userId: req.user.id,
        role: req.user.role,
        status,
        page,
        limit,
      });

      return res.status(200).json(result);
    } catch (error: any) {
      if (error.message.includes('Forbidden')) {
        return res.status(403).json({ success: false, message: error.message });
      }
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  public static async approveQuestion(req: AuthRequest, res: Response) {
    try {
      if (!req.user) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
      }

      const { id } = req.params;
      const result = await QuestionGenerationService.approveQuestion(id, req.user.id, req.user.role);

      return res.status(200).json(result);
    } catch (error: any) {
      if (error.message.includes('Forbidden')) {
        return res.status(403).json({ success: false, message: error.message });
      }
      return res.status(400).json({ success: false, message: error.message });
    }
  }

  public static async rejectQuestion(req: AuthRequest, res: Response) {
    try {
      if (!req.user) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
      }

      const { id } = req.params;
      const result = await QuestionGenerationService.rejectQuestion(id, req.user.id, req.user.role);

      return res.status(200).json(result);
    } catch (error: any) {
      if (error.message.includes('Forbidden')) {
        return res.status(403).json({ success: false, message: error.message });
      }
      return res.status(400).json({ success: false, message: error.message });
    }
  }

  public static async editQuestion(req: AuthRequest, res: Response) {
    try {
      if (!req.user) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
      }

      const { id } = req.params;
      const { stem, type, difficulty, options, correctAnswer, explanation } = req.body;

      const result = await QuestionGenerationService.editQuestion(id, req.user.id, req.user.role, {
        stem,
        type,
        difficulty,
        options,
        correctAnswer,
        explanation,
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
