import { Response } from 'express';
import { AuthRequest } from '../../../middlewares/authMiddleware';
import { QuestionBankService } from '../services/questionBankService';
import { QuestionPaperService } from '../services/questionPaperService';
import { prisma } from '../../../config/prisma';

export class QuestionPaperController {
  public static async getSubjects(req: AuthRequest, res: Response) {
    try {
      const subjects = await QuestionBankService.getSubjects();
      return res.status(200).json({ success: true, data: subjects });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  public static async getTopics(req: AuthRequest, res: Response) {
    try {
      const subjectId = (req.query.subjectId as string) || (req.params.subjectId as string);
      if (!subjectId) {
        return res.status(400).json({ success: false, message: 'subjectId parameter is required.' });
      }

      const topics = await QuestionBankService.getTopicAvailability(subjectId);
      return res.status(200).json({ success: true, data: topics });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  public static async getAvailability(req: AuthRequest, res: Response) {
    try {
      const subjectId = req.query.subjectId as string;
      const topicIdsStr = req.query.topicIds as string;

      if (!subjectId) {
        return res.status(400).json({ success: false, message: 'subjectId parameter is required.' });
      }

      const allTopics = await QuestionBankService.getTopicAvailability(subjectId);
      let filtered = allTopics;

      if (topicIdsStr) {
        const topicIds = topicIdsStr.split(',').map((id) => id.trim());
        filtered = allTopics.filter((t) => topicIds.includes(t.topicId));
      }

      return res.status(200).json({ success: true, data: filtered });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  public static async previewPaper(req: AuthRequest, res: Response) {
    try {
      const result = await QuestionPaperService.previewQuestionPaper(req.body);
      return res.status(200).json({ success: true, data: result });
    } catch (error: any) {
      return res.status(400).json({ success: false, message: error.message });
    }
  }

  public static async startShortfallGeneration(req: AuthRequest, res: Response) {
    try {
      if (!req.user) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
      }

      const result = await QuestionPaperService.startShortfallGeneration(req.user.id, req.user.role, req.body);
      return res.status(200).json({ success: true, data: result });
    } catch (error: any) {
      return res.status(400).json({ success: false, message: error.message });
    }
  }

  public static async getGenerationJobStatus(req: AuthRequest, res: Response) {
    try {
      const { jobId } = req.params;
      const job = await prisma.aIBatchGenerationJob.findUnique({
        where: { id: jobId },
      });

      if (!job) {
        return res.status(404).json({ success: false, message: `Generation job '${jobId}' not found.` });
      }

      const questions = await prisma.question.findMany({
        where: {
          generatedByAI: true,
          subtopic: {
            topicId: job.topicId || undefined,
          },
        },
        orderBy: { createdAt: 'desc' },
        take: job.verifiedCount || 20,
      });

      return res.status(200).json({
        success: true,
        job: {
          id: job.id,
          status: job.status,
          statusMessage: job.statusMessage,
          requestedCount: job.requestedCount,
          verifiedCount: job.verifiedCount,
          createdAt: job.createdAt,
          updatedAt: job.updatedAt,
        },
        questions,
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  public static async regenerateSelection(req: AuthRequest, res: Response) {
    try {
      const result = await QuestionPaperService.previewQuestionPaper(req.body);
      return res.status(200).json({ success: true, data: result });
    } catch (error: any) {
      return res.status(400).json({ success: false, message: error.message });
    }
  }

  public static async finalizePaper(req: AuthRequest, res: Response) {
    try {
      if (!req.user) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
      }

      const result = await QuestionPaperService.finalizeQuestionPaper(req.user.id, req.user.role, req.body);
      return res.status(200).json(result);
    } catch (error: any) {
      return res.status(400).json({ success: false, message: error.message });
    }
  }

  public static async publishExamination(req: AuthRequest, res: Response) {
    try {
      if (!req.user) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
      }

      const { id } = req.params;
      const result = await QuestionPaperService.publishExamination(id, req.user.id, req.user.role);
      return res.status(200).json(result);
    } catch (error: any) {
      return res.status(400).json({ success: false, message: error.message });
    }
  }

  public static async deleteQuestion(req: AuthRequest, res: Response) {
    try {
      if (!req.user) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
      }

      const { id } = req.params;
      await QuestionBankService.assertQuestionDeletionSafety(id);

      await prisma.question.delete({ where: { id } });
      return res.status(200).json({ success: true, message: 'Question deleted successfully.' });
    } catch (error: any) {
      return res.status(400).json({ success: false, message: error.message });
    }
  }

  public static async bulkDeleteQuestions(req: AuthRequest, res: Response) {
    try {
      if (!req.user) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
      }

      const { ids } = req.body;
      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ success: false, message: 'ids must be a non-empty array.' });
      }

      const { deletableIds, protectedIds } = await QuestionBankService.evaluateBulkQuestionDeletion(ids);

      if (deletableIds.length > 0) {
        await prisma.question.deleteMany({
          where: { id: { in: deletableIds } },
        });
      }

      return res.status(200).json({
        success: true,
        deletedCount: deletableIds.length,
        protectedCount: protectedIds.length,
        protectedDetails: protectedIds,
        message:
          protectedIds.length === 0
            ? `Successfully deleted ${deletableIds.length} questions.`
            : `Deleted ${deletableIds.length} question(s). ${protectedIds.length} question(s) were protected from deletion because they are used in active/completed examinations.`,
      });
    } catch (error: any) {
      return res.status(400).json({ success: false, message: error.message });
    }
  }

  /**
   * Resolves the raw JSONL content for these endpoints. A .zip is transparently unpacked here:
   * every .jsonl/.txt entry inside it is concatenated (newline-joined — safe, since JSONL is
   * just one JSON object per line and record order/content don't depend on file boundaries)
   * into a single combined stream, so a zip of several chapter files imports exactly like one
   * larger JSONL file under one shared target subject.
   */
  private static resolveJSONLContent(req: AuthRequest): { fileContent: Buffer | string; fileName: string } {
    if (req.file) {
      const { isZipFile, extractZipEntries } = require('../../../services/zipExtractionService');
      if (isZipFile(req.file.originalname, req.file.mimetype)) {
        const entries = extractZipEntries(req.file.buffer, ['.jsonl', '.txt']);
        if (entries.length === 0) {
          throw new Error('No .jsonl or .txt files found inside the uploaded zip.');
        }
        const combined = entries.map((e: { buffer: Buffer }) => e.buffer.toString('utf-8')).join('\n');
        return { fileContent: combined, fileName: `${req.file.originalname} (${entries.length} files combined)` };
      }
      return { fileContent: req.file.buffer, fileName: req.file.originalname };
    }
    if (req.body.fileContent) {
      return { fileContent: req.body.fileContent, fileName: 'Ch1_questions.jsonl' };
    }
    throw new Error('JSONL file upload or fileContent string is required.');
  }

  public static async previewJSONLImport(req: AuthRequest, res: Response) {
    try {
      const { fileContent, fileName } = QuestionPaperController.resolveJSONLContent(req);

      const { JSONLImportService } = require('../services/jsonlImportService');
      const preview = JSONLImportService.parseAndValidateJSONL(fileContent, fileName);
      return res.status(200).json({ success: true, data: preview });
    } catch (error: any) {
      return res.status(400).json({ success: false, message: error.message });
    }
  }

  public static async executeJSONLImport(req: AuthRequest, res: Response) {
    try {
      if (!req.user) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
      }

      const { fileContent, fileName } = QuestionPaperController.resolveJSONLContent(req);

      const { JSONLImportService } = require('../services/jsonlImportService');
      const result = await JSONLImportService.importJSONLToDatabase(fileContent, req.user.id, fileName, {
        subjectId: req.body.subjectId || undefined,
        subjectName: req.body.subjectName || undefined,
        subjectCode: req.body.subjectCode || undefined,
        department: req.body.department || undefined,
        moduleName: req.body.moduleName || undefined,
      });
      return res.status(200).json({ success: true, data: result });
    } catch (error: any) {
      return res.status(400).json({ success: false, message: error.message });
    }
  }

  public static async searchQuestionBank(req: AuthRequest, res: Response) {
    try {
      const query = (req.query.query as string) || '';
      const topic = (req.query.topic as string) || '';
      const verificationStatus = (req.query.verificationStatus as string) || '';
      const origin = (req.query.origin as string) || '';
      const page = parseInt((req.query.page as string) || '1', 10);
      const limit = parseInt((req.query.limit as string) || '50', 10);

      const where: any = {};

      if (query.trim()) {
        const q = query.trim();
        where.OR = [
          { customId: { contains: q, mode: 'insensitive' } },
          { text: { contains: q, mode: 'insensitive' } },
          { sourceHeading: { contains: q, mode: 'insensitive' } },
          { subtopic: { topic: { name: { contains: q, mode: 'insensitive' } } } },
        ];
      }

      if (topic.trim()) {
        where.OR = where.OR || [];
        where.OR.push(
          { sourceHeading: { equals: topic, mode: 'insensitive' } },
          { subtopic: { topic: { name: { equals: topic, mode: 'insensitive' } } } }
        );
      }

      if (verificationStatus.trim()) {
        where.verificationStatus = verificationStatus;
      }

      if (origin.trim()) {
        where.origin = origin;
      }

      const skip = (page - 1) * limit;

      const [total, questions] = await Promise.all([
        prisma.question.count({ where }),
        prisma.question.findMany({
          where,
          include: {
            subtopic: {
              include: { topic: { include: { module: { include: { subject: true } } } } },
            },
            sourceDocument: { select: { id: true, title: true, fileName: true } },
          },
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
        }),
      ]);

      return res.status(200).json({
        success: true,
        total,
        page,
        limit,
        data: questions,
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }
}
