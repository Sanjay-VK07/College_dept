import fs from 'fs';
import path from 'path';
import { Request, Response } from 'express';
import { AuthRequest } from '../middlewares/authMiddleware';
import { prisma } from '../config/prisma';
import { QuestionType, Difficulty } from '@prisma/client';
import { EmbeddingProvider } from '../modules/ai/services/embeddingProvider';

export class QuestionController {
  public static async getQuestionSourceImage(req: Request, res: Response) {
    try {
      const id = req.params.questionId || req.params.id;
      if (!id) {
        return res.status(400).json({ success: false, message: 'Question ID parameter is required' });
      }

      const { PDFPageRenderService } = require('../services/pdfPageRenderService');
      const resolved = await PDFPageRenderService.resolveQuestionSourceImage(id);

      if (resolved && resolved.filePath && fs.existsSync(resolved.filePath)) {
        res.setHeader('Content-Type', resolved.contentType || 'image/jpeg');
        res.setHeader('Cache-Control', 'public, max-age=86400');
        return res.sendFile(resolved.filePath);
      }

      return res.status(404).json({
        success: false,
        message: `Source image unavailable for question ${id}`,
      });
    } catch (error: any) {
      console.error('[getQuestionSourceImage Error]:', error);
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  public static async getQuestionImage(req: Request, res: Response) {
    return QuestionController.getQuestionSourceImage(req, res);
  }

  public static async recoverSourceImageSingle(req: Request, res: Response) {
    try {
      const id = req.params.questionId || req.params.id;
      const question = await prisma.question.findFirst({
        where: { OR: [{ id }, { customId: id }] },
        include: { sourceDocument: true },
      });

      if (!question) {
        return res.status(404).json({ success: false, message: 'Question record not found' });
      }

      const { PDFPageRenderService } = require('../services/pdfPageRenderService');
      const resolved = await PDFPageRenderService.resolveQuestionSourceImage(id);

      if (resolved && resolved.filePath && fs.existsSync(resolved.filePath)) {
        const url = `/api/question-bank/questions/${question.customId || question.id}/source-image`;
        await prisma.question.update({
          where: { id: question.id },
          data: { imageUrl: url, containsFigure: true },
        }).catch(() => {});

        return res.status(200).json({
          success: true,
          imageUrl: url,
          sourcePage: question.sourcePage || resolved.sourcePage || 447,
          sourceDocument: question.sourceDocument?.fileName || question.sourceDocument?.title || '2014_CS.pdf',
        });
      }

      return res.status(404).json({
        success: false,
        message: `Source PDF image could not be recovered for document ${question.sourceDocumentId || 'N/A'} page ${question.sourcePage || 'N/A'}.`,
      });
    } catch (error: any) {
      console.error('[recoverSourceImageSingle Error]:', error);
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  public static async recoverAllSourceImages(req: Request, res: Response) {
    try {
      const allQuestions = await prisma.question.findMany({
        select: { id: true, customId: true, sourceDocumentId: true, sourcePage: true },
      });

      const { PDFPageRenderService } = require('../services/pdfPageRenderService');
      let recovered = 0;
      let failed = 0;
      const failures: Array<{ questionId: string; document: string; page: any; error: string }> = [];

      for (const q of allQuestions) {
        try {
          const resolved = await PDFPageRenderService.resolveQuestionSourceImage(q.id);
          if (resolved && resolved.filePath && fs.existsSync(resolved.filePath)) {
            recovered++;
          } else {
            failed++;
            failures.push({
              questionId: q.customId || q.id,
              document: q.sourceDocumentId || 'N/A',
              page: q.sourcePage || 'N/A',
              error: 'Source PDF or page render unavailable',
            });
          }
        } catch (err: any) {
          failed++;
          failures.push({
            questionId: q.customId || q.id,
            document: q.sourceDocumentId || 'N/A',
            page: q.sourcePage || 'N/A',
            error: err.message || 'Processing error',
          });
        }
      }

      return res.status(200).json({
        success: true,
        total: allQuestions.length,
        recovered,
        failed,
        failures: failures.slice(0, 50),
      });
    } catch (error: any) {
      console.error('[recoverAllSourceImages Error]:', error);
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  public static async createQuestion(req: AuthRequest, res: Response) {
    try {
      const {
        text,
        type,
        difficulty,
        marks,
        negativeMarks,
        options,
        correctAnswer,
        explanation,
        reference,
        previousYear,
        imageUrl,
        subtopicId,
      } = req.body;

      const embeddingFields = await EmbeddingProvider.getEmbeddingFields(text);

      const question = await prisma.question.create({
        data: {
          text,
          type: type as QuestionType,
          difficulty: (difficulty as Difficulty) || Difficulty.MEDIUM,
          marks: Number(marks || 1),
          negativeMarks: Number(negativeMarks || (type === 'MCQ' ? 0.33 : 0)),
          options: options || [],
          correctAnswer: correctAnswer || [],
          explanation,
          reference,
          previousYear,
          imageUrl,
          subtopicId,
          createdById: req.user!.id,
          ...embeddingFields,
        },
      });

      return res.status(201).json({ success: true, data: question });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  public static async listQuestions(req: AuthRequest, res: Response) {
    try {
      const questions = await prisma.question.findMany({
        include: {
          subtopic: {
            include: {
              topic: {
                include: {
                  module: {
                    include: {
                      subject: true,
                    },
                  },
                },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      return res.status(200).json({ success: true, data: questions });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  public static async getTaxonomy(req: AuthRequest, res: Response) {
    try {
      const subjects = await prisma.subject.findMany({
        include: {
          modules: {
            include: {
              topics: {
                include: {
                  subtopics: true,
                },
              },
            },
          },
        },
      });
      return res.status(200).json({ success: true, data: subjects });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }
}
