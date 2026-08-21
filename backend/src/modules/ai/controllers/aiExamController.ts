import { Response } from 'express';
import { AuthRequest } from '../../../middlewares/authMiddleware';
import { ExamAssemblyService } from '../services/examAssemblyService';

export class AIExamController {
  public static async assembleExam(req: AuthRequest, res: Response) {
    try {
      if (!req.user) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
      }

      const {
        examGenerationRequestId,
        title,
        description,
        subjectId,
        moduleIds,
        topicIds,
        questionTypes,
        difficultyDistribution,
        questionCount,
        targetDepartment,
        durationMinutes,
      } = req.body;

      const result = await ExamAssemblyService.assembleExam(req.user.id, req.user.role, {
        examGenerationRequestId,
        title,
        description,
        subjectId,
        moduleIds,
        topicIds,
        questionTypes,
        difficultyDistribution,
        questionCount: questionCount ? Number(questionCount) : 10,
        targetDepartment,
        durationMinutes: durationMinutes ? Number(durationMinutes) : 180,
      });

      return res.status(200).json(result);
    } catch (error: any) {
      if (error.message.includes('Forbidden')) {
        return res.status(403).json({ success: false, message: error.message });
      }
      return res.status(400).json({ success: false, message: error.message });
    }
  }

  public static async approveExamDraft(req: AuthRequest, res: Response) {
    try {
      if (!req.user) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
      }

      const { id } = req.params;
      const result = await ExamAssemblyService.approveExamDraft(id, req.user.id, req.user.role);

      return res.status(200).json(result);
    } catch (error: any) {
      if (error.message.includes('Forbidden')) {
        return res.status(403).json({ success: false, message: error.message });
      }
      return res.status(400).json({ success: false, message: error.message });
    }
  }
}
