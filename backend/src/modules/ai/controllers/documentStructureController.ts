import { Response } from 'express';
import { AuthRequest } from '../../../middlewares/authMiddleware';
import { prisma } from '../../../config/prisma';
import { PDFQuestionImportService } from '../services/pdfQuestionImportService';

export class DocumentStructureController {
  /**
   * Enqueues structure extraction for an already-uploaded document. The in-process worker
   * (documentProcessingWorker.ts) picks up QUEUED jobs on its next poll tick.
   */
  public static async enqueueProcessing(req: AuthRequest, res: Response) {
    try {
      const { documentId } = req.params;

      const document = await prisma.aIDocument.findUnique({ where: { id: documentId } });
      if (!document) {
        return res.status(404).json({ success: false, message: 'Document not found.' });
      }

      const job = await prisma.documentProcessingJob.upsert({
        where: { documentId },
        create: { documentId, status: 'QUEUED' },
        update: { status: 'QUEUED', error: null, statusMessage: null },
      });

      return res.status(202).json({ success: true, message: 'Document structure processing enqueued.', data: job });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  public static async getProcessingStatus(req: AuthRequest, res: Response) {
    try {
      const { documentId } = req.params;
      const job = await prisma.documentProcessingJob.findUnique({ where: { documentId } });

      if (!job) {
        return res.status(404).json({ success: false, message: 'No processing job found for this document.' });
      }

      return res.status(200).json({ success: true, data: job });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Enqueues extraction of real questions from an uploaded PDF into the live Question Bank,
   * honoring a custom target count and safe for large PDFs (page-batched internally — see
   * pdfQuestionImportService.ts). Poll GET /ai/questions/batch-status/:generationRequestId for
   * progress, same endpoint already used for AI batch generation.
   */
  public static async enqueueQuestionImport(req: AuthRequest, res: Response) {
    try {
      const { documentId } = req.params;
      const { subtopicId, targetCount } = req.body;

      if (!subtopicId) {
        return res.status(400).json({ success: false, message: 'subtopicId is required.' });
      }

      const result = await PDFQuestionImportService.enqueueImport({
        userId: req.user!.id,
        role: req.user!.role,
        documentId,
        subtopicId,
        targetCount: targetCount ? Number(targetCount) : undefined,
      });

      return res.status(202).json(result);
    } catch (error: any) {
      if (error.message.includes('Forbidden')) {
        return res.status(403).json({ success: false, message: error.message });
      }
      return res.status(400).json({ success: false, message: error.message });
    }
  }

  public static async getExtractedQuestions(req: AuthRequest, res: Response) {
    try {
      const { documentId } = req.params;

      const questions = await prisma.extractedQuestion.findMany({
        where: { documentId },
        include: {
          sourcePage: { select: { pageNumber: true, pageType: true } },
          mappedAnswer: {
            include: { sourcePage: { select: { pageNumber: true } } },
          },
        },
        orderBy: [{ sourcePage: { pageNumber: 'asc' } }, { rawQuestionId: 'asc' }],
      });

      return res.status(200).json({ success: true, data: questions });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }
}
