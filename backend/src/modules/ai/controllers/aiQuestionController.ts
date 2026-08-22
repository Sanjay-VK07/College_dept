import { Response } from 'express';
import { AuthRequest } from '../../../middlewares/authMiddleware';
import { QuestionGenerationService } from '../services/questionGenerationService';
import { AIBatchQuestionGenerationService } from '../services/aiBatchQuestionGenerationService';
import { GenerationDistributionService } from '../services/generationDistributionService';
import { SyllabusClassificationService } from '../services/syllabusClassificationService';

export class AIQuestionController {
  /**
   * Primary endpoint for source-grounded batch GATE question generation (50 - 500+ questions).
   */
  public static async generateBatchQuestions(req: AuthRequest, res: Response) {
    try {
      if (!req.user) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
      }

      const {
        totalQuestions,
        difficultyDistribution,
        typeDistribution,
        negativeMarking,
        solutionVisibility,
        sourceReferences,
        selectedResourceIds,
        subjectId,
        moduleId,
        topicId,
        subtopicId,
        generationRequestId,
      } = req.body;

      const result = await AIBatchQuestionGenerationService.generateBatch(
        req.user.id,
        req.user.role,
        {
          totalQuestions: totalQuestions ? Number(totalQuestions) : 50,
          difficultyDistribution: difficultyDistribution || { EASY: 20, MEDIUM: 50, HARD: 30 },
          typeDistribution: typeDistribution || { MCQ: 60, MSQ: 10, NAT: 30 },
          negativeMarking,
          solutionVisibility,
          sourceReferences,
          selectedResourceIds,
          subjectId,
          moduleId,
          topicId,
          subtopicId,
          generationRequestId,
        }
      );

      if (result.status === 'INVALID_GENERATION_COUNT') {
        return res.status(400).json(result);
      }

      return res.status(200).json(result);
    } catch (error: any) {
      if (error.message.includes('Forbidden')) {
        return res.status(403).json({ success: false, message: error.message });
      }
      return res.status(400).json({ success: false, message: error.message });
    }
  }

  /**
   * Status polling for active batch generation job.
   */
  public static async getBatchJobStatus(req: AuthRequest, res: Response) {
    try {
      if (!req.user) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
      }

      const { generationRequestId } = req.params;
      const result = await AIBatchQuestionGenerationService.getBatchJobStatus(generationRequestId);

      return res.status(200).json(result);
    } catch (error: any) {
      return res.status(404).json({ success: false, message: error.message });
    }
  }

  /**
   * Get configured minimum and maximum generation question bounds.
   */
  public static async getMinMaxConfig(req: AuthRequest, res: Response) {
    try {
      const config = await GenerationDistributionService.getMinMaxConfig();
      return res.status(200).json({ success: true, ...config });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Admin-configurable maximum question count update.
   */
  public static async updateAdminMaxConfig(req: AuthRequest, res: Response) {
    try {
      if (!req.user || req.user.role !== 'ADMIN') {
        return res.status(403).json({ success: false, message: 'Forbidden: Admin access required.' });
      }

      const { maxCount } = req.body;
      const updatedConfig = await GenerationDistributionService.updateAdminMaxConfig(Number(maxCount));

      return res.status(200).json({
        success: true,
        message: 'Admin maximum question generation count updated successfully.',
        ...updatedConfig,
      });
    } catch (error: any) {
      return res.status(400).json({ success: false, message: error.message });
    }
  }

  /**
   * Faculty/Admin document classification correction.
   */
  public static async updateDocumentClassification(req: AuthRequest, res: Response) {
    try {
      if (!req.user || (req.user.role !== 'FACULTY' && req.user.role !== 'ADMIN')) {
        return res.status(403).json({ success: false, message: 'Forbidden: Access denied.' });
      }

      const { documentId } = req.params;
      const { subjectId, moduleId, topicId, subtopicId } = req.body;

      const result = await SyllabusClassificationService.updateDocumentClassification(documentId, {
        subjectId,
        moduleId,
        topicId,
        subtopicId,
      });

      return res.status(200).json(result);
    } catch (error: any) {
      return res.status(400).json({ success: false, message: error.message });
    }
  }

  /**
   * Single/Pipeline question generation (backward compatibility).
   */
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
