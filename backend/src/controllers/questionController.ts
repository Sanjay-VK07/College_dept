import { Response } from 'express';
import { AuthRequest } from '../middlewares/authMiddleware';
import { prisma } from '../config/prisma';
import { QuestionType, Difficulty } from '@prisma/client';
import { EmbeddingProvider } from '../modules/ai/services/embeddingProvider';

export class QuestionController {
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

      const embedding = await EmbeddingProvider.getEmbeddingOrEmpty(text);

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
          embedding,
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
