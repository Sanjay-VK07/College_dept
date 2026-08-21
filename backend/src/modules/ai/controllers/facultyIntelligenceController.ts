import { Response } from 'express';
import { AuthRequest } from '../../../middlewares/authMiddleware';
import { QuestionBankIntelligenceService } from '../services/questionBankIntelligenceService';
import { QuestionQualityService } from '../services/questionQualityService';
import { ExamIntelligenceService } from '../services/examIntelligenceService';
import { CohortIntelligenceService } from '../services/cohortIntelligenceService';
import { FacultyRecommendationService } from '../services/facultyRecommendationService';

export class FacultyIntelligenceController {
  public static async getOverview(req: AuthRequest, res: Response) {
    try {
      if (!req.user || (req.user.role !== 'FACULTY' && req.user.role !== 'ADMIN')) {
        return res.status(403).json({ success: false, message: 'Forbidden: Faculty and Admin access only.' });
      }

      const department = req.user.department || 'Computer Science and Engineering';

      const [questionBankHealth, cohortOverview, examsIntelligence] = await Promise.all([
        QuestionBankIntelligenceService.getQuestionBankHealth(),
        CohortIntelligenceService.getCohortIntelligence(department),
        ExamIntelligenceService.getAllExamsIntelligence(),
      ]);

      const recommendations = FacultyRecommendationService.generateRecommendationsFromData(
        questionBankHealth,
        cohortOverview,
        examsIntelligence
      );

      return res.status(200).json({
        success: true,
        data: {
          questionBankHealth,
          cohortOverview,
          examsIntelligence,
          recommendations,
        },
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  public static async getQuestionAnalysis(req: AuthRequest, res: Response) {
    try {
      if (!req.user || (req.user.role !== 'FACULTY' && req.user.role !== 'ADMIN')) {
        return res.status(403).json({ success: false, message: 'Forbidden: Faculty and Admin access only.' });
      }

      const { id } = req.params;
      const analysis = await QuestionQualityService.analyzeQuestionQuality(id);

      return res.status(200).json({
        success: true,
        data: analysis,
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  public static async getExamAnalysis(req: AuthRequest, res: Response) {
    try {
      if (!req.user || (req.user.role !== 'FACULTY' && req.user.role !== 'ADMIN')) {
        return res.status(403).json({ success: false, message: 'Forbidden: Faculty and Admin access only.' });
      }

      const { id } = req.params;
      const metrics = await ExamIntelligenceService.getExamIntelligence(id);

      if (!metrics) {
        return res.status(404).json({ success: false, message: 'Exam not found.' });
      }

      return res.status(200).json({
        success: true,
        data: metrics,
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  public static async getCohortAnalysis(req: AuthRequest, res: Response) {
    try {
      if (!req.user || (req.user.role !== 'FACULTY' && req.user.role !== 'ADMIN')) {
        return res.status(403).json({ success: false, message: 'Forbidden: Faculty and Admin access only.' });
      }

      const department = (req.query.department as string) || req.user.department || 'Computer Science and Engineering';
      const cohortOverview = await CohortIntelligenceService.getCohortIntelligence(department);

      return res.status(200).json({
        success: true,
        data: cohortOverview,
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }
}
