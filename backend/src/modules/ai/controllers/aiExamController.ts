import { Response } from 'express';
import { AuthRequest } from '../../../middlewares/authMiddleware';
import { ExamAssemblyService } from '../services/examAssemblyService';
import { ExamValidationService } from '../services/examValidationService';

type ValidationResult<T> =
  | { isPresent: false; isValid: true; value: undefined }
  | { isPresent: true; isValid: true; value: T }
  | { isPresent: true; isValid: false; error: string };

function parseOptionalPositiveInteger(val: unknown, paramName: string): ValidationResult<number> {
  if (val === undefined) {
    return { isPresent: false, isValid: true, value: undefined };
  }

  if (typeof val === 'number') {
    if (Number.isFinite(val) && Number.isInteger(val) && val > 0) {
      return { isPresent: true, isValid: true, value: val };
    }
    return { isPresent: true, isValid: false, error: `${paramName} must be a positive integer.` };
  }

  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (/^\d+$/.test(trimmed)) {
      const num = Number(trimmed);
      if (num > 0 && Number.isSafeInteger(num)) {
        return { isPresent: true, isValid: true, value: num };
      }
    }
    return { isPresent: true, isValid: false, error: `${paramName} must be a valid positive integer.` };
  }

  return { isPresent: true, isValid: false, error: `${paramName} must be a valid positive integer.` };
}

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

      const countResult = parseOptionalPositiveInteger(questionCount, 'questionCount');
      if (!countResult.isValid) {
        return res.status(400).json({ success: false, message: countResult.error });
      }

      const durationResult = parseOptionalPositiveInteger(durationMinutes, 'durationMinutes');
      if (!durationResult.isValid) {
        return res.status(400).json({ success: false, message: durationResult.error });
      }

      const validQuestionCount = countResult.isPresent ? countResult.value : 10;
      const validDurationMinutes = durationResult.isPresent ? durationResult.value : 180;

      const result = await ExamAssemblyService.assembleExam(req.user.id, req.user.role, {
        examGenerationRequestId,
        title,
        description,
        subjectId,
        moduleIds,
        topicIds,
        questionTypes,
        difficultyDistribution,
        questionCount: validQuestionCount,
        targetDepartment,
        durationMinutes: validDurationMinutes,
      });

      return res.status(200).json(result);
    } catch (error: any) {
      if (error.message && error.message.includes('Forbidden')) {
        return res.status(403).json({ success: false, message: error.message });
      }
      return res.status(400).json({ success: false, message: error.message });
    }
  }

  public static async assembleDraft(req: AuthRequest, res: Response) {
    return AIExamController.assembleExam(req, res);
  }

  public static async validateExamBalance(req: AuthRequest, res: Response) {
    try {
      if (!req.user) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
      }

      // 1. Validate selectedQuestions payload
      let selectedQuestions: any[];
      if (req.body.selectedQuestions === undefined) {
        selectedQuestions = [];
      } else if (Array.isArray(req.body.selectedQuestions)) {
        selectedQuestions = req.body.selectedQuestions;
      } else {
        return res.status(400).json({
          success: false,
          message: 'selectedQuestions must be an array of questions if provided.',
        });
      }

      // 2. Validate questionCount & requestedCount
      const qcResult = parseOptionalPositiveInteger(req.body.questionCount, 'questionCount');
      if (!qcResult.isValid) {
        return res.status(400).json({ success: false, message: qcResult.error });
      }

      const rcResult = parseOptionalPositiveInteger(req.body.requestedCount, 'requestedCount');
      if (!rcResult.isValid) {
        return res.status(400).json({ success: false, message: rcResult.error });
      }

      // 3. Handle conflict if BOTH questionCount and requestedCount are provided
      if (qcResult.isPresent && rcResult.isPresent && qcResult.value !== rcResult.value) {
        return res.status(400).json({
          success: false,
          message: `Conflicting parameters: questionCount (${qcResult.value}) and requestedCount (${rcResult.value}) must be identical if both are provided.`,
        });
      }

      // Determine requestedCount: supplied value or fallback to selectedQuestions.length
      const requestedCount = qcResult.isPresent
        ? qcResult.value
        : rcResult.isPresent
        ? rcResult.value
        : selectedQuestions.length;

      const targetDifficulty = req.body.targetDifficulty || req.body.difficultyDistribution;

      const result = ExamValidationService.validateExamAssembly({
        selectedQuestions,
        requestedCount,
        targetDifficulty,
      });

      return res.status(200).json({ success: true, data: result });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to validate exam balance';
      if (message.includes('Forbidden')) {
        return res.status(403).json({ success: false, message });
      }
      return res.status(400).json({ success: false, message });
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
      if (error.message && error.message.includes('Forbidden')) {
        return res.status(403).json({ success: false, message: error.message });
      }
      return res.status(400).json({ success: false, message: error.message });
    }
  }
}


