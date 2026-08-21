import { Response } from 'express';
import { AuthRequest } from '../../../middlewares/authMiddleware';
import { RAGService } from '../services/ragService';
import { QuestionGenerationService } from '../services/questionGenerationService';
import { PracticeService } from '../services/practiceService';
import { AIStatsService } from '../services/aiStatsService';
import { ConversationService } from '../services/conversationService';
import { prisma } from '../../../config/prisma';
import { Role, QuestionType, Difficulty, AIQuestionReviewStatus } from '@prisma/client';
import { AuditLogger } from '../../../services/auditLogger';

export class AIAssistantController {
  /**
   * POST /api/ai/ask
   * One-off RAG Question Answering Endpoint
   */
  public static async askQuestion(req: AuthRequest, res: Response) {
    try {
      const userId = req.user!.id;
      const role = req.user!.role;
      const { question } = req.body;

      if (!question || question.trim().length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Question content cannot be empty.',
        });
      }

      // Log audit search
      await AuditLogger.log({
        userId,
        action: 'AI_QUESTION_ASKED',
        resource: 'RAGService',
        details: `Asked: "${question.substring(0, 150)}"`,
      });

      const result = await RAGService.answerQuestion({
        query: question.trim(),
        userId,
        role,
      });

      return res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      console.error('[AIAssistantController.askQuestion Error]:', error);
      return res.status(500).json({
        success: false,
        message: 'The AI service is currently unavailable. Please try again later.',
      });
    }
  }

  /**
   * POST /api/ai/conversations/:conversationId/rename
   */
  public static async renameConversation(req: AuthRequest, res: Response) {
    try {
      const userId = req.user!.id;
      const { conversationId } = req.params;
      const { title } = req.body;

      if (!title || title.trim().length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Conversation title cannot be empty.',
        });
      }

      // Ownership check
      const conversation = await prisma.aIConversation.findFirst({
        where: { id: conversationId, userId },
      });

      if (!conversation) {
        return res.status(403).json({
          success: false,
          message: 'Conversation not found or access forbidden.',
        });
      }

      const updated = await prisma.aIConversation.update({
        where: { id: conversationId },
        data: { title: title.trim().substring(0, 100) },
      });

      return res.status(200).json({
        success: true,
        data: updated,
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to rename conversation.',
      });
    }
  }

  /**
   * POST /api/ai/generate-questions
   */
  public static async generateQuestions(req: AuthRequest, res: Response) {
    try {
      const userId = req.user!.id;
      const role = req.user!.role;

      if (role !== Role.ADMIN && role !== Role.FACULTY) {
        return res.status(403).json({
          success: false,
          message: 'Forbidden: Only Faculty and Admin can generate questions.',
        });
      }

      const { subject, topic, difficulty, questionType, count, marks, negativeMarking, documentIds } = req.body;

      if (!subject || !topic || !questionType || !difficulty || !count) {
        return res.status(400).json({
          success: false,
          message: 'Missing required question generation parameters (subject, topic, questionType, difficulty, count).',
        });
      }

      const questions = await QuestionGenerationService.generateQuestionsDirect({
        subject,
        topic,
        difficulty: difficulty as Difficulty,
        questionType: questionType as QuestionType,
        count: parseInt(count, 10),
        marks: parseFloat(marks || 1),
        negativeMarking: parseFloat(negativeMarking || 0),
        documentIds,
        userId,
        role,
      });

      return res.status(200).json({
        success: true,
        data: questions,
      });
    } catch (error: any) {
      console.error('[AIAssistantController.generateQuestions Error]:', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to generate questions.',
      });
    }
  }

  /**
   * POST /api/ai/save-generated-question
   */
  public static async saveGeneratedQuestion(req: AuthRequest, res: Response) {
    try {
      const userId = req.user!.id;
      const role = req.user!.role;

      if (role !== Role.ADMIN && role !== Role.FACULTY) {
        return res.status(403).json({
          success: false,
          message: 'Forbidden: Only Faculty and Admin can save questions to the Question Bank.',
        });
      }

      const { question } = req.body;

      if (!question || !question.text || !question.type || !question.subtopicId) {
        return res.status(400).json({
          success: false,
          message: 'Invalid question object or missing required fields.',
        });
      }

      // Save question
      const newQuestion = await prisma.question.create({
        data: {
          text: question.text,
          type: question.type as QuestionType,
          difficulty: (question.difficulty || 'MEDIUM') as Difficulty,
          marks: parseFloat(question.marks || 1),
          negativeMarks: parseFloat(question.negativeMarks || 0),
          options: question.options || [],
          correctAnswer: question.correctAnswer,
          explanation: question.explanation,
          subtopicId: question.subtopicId,
          createdById: userId,
          generatedByAI: true,
          generationModel: process.env.AI_MODEL || 'gemini-1.5-flash',
          reviewStatus: AIQuestionReviewStatus.APPROVED, // Review approved by Faculty/Admin
        },
      });

      // Save sources if present
      if (Array.isArray(question.sources)) {
        for (const s of question.sources) {
          if (s.documentId) {
            await prisma.questionAISource.create({
              data: {
                questionId: newQuestion.id,
                documentId: s.documentId,
                chunkId: s.chunkId || null,
              },
            });
          }
        }
      }

      // Log Audit Log Question Approved
      await AuditLogger.log({
        userId,
        action: 'AI_QUESTION_APPROVED',
        resource: 'Question',
        details: `Approved AI generated question id: ${newQuestion.id}`,
      });

      return res.status(200).json({
        success: true,
        data: newQuestion,
      });
    } catch (error: any) {
      console.error('[AIAssistantController.saveGeneratedQuestion Error]:', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to save question to the bank.',
      });
    }
  }

  /**
   * POST /api/ai/practice
   */
  public static async generatePracticeSet(req: AuthRequest, res: Response) {
    try {
      const userId = req.user!.id;
      const role = req.user!.role;

      if (role !== Role.STUDENT) {
        return res.status(403).json({
          success: false,
          message: 'Practice mode is exclusively available for Students.',
        });
      }

      const { subject, topic, difficulty, count } = req.body;

      if (!subject || !topic || !difficulty || !count) {
        return res.status(400).json({
          success: false,
          message: 'Missing parameters (subject, topic, difficulty, count).',
        });
      }

      const practiceSet = await PracticeService.generatePracticeSet({
        subject,
        topic,
        difficulty: difficulty as Difficulty,
        count: parseInt(count, 10),
        userId,
      });

      return res.status(200).json({
        success: true,
        data: practiceSet,
      });
    } catch (error: any) {
      console.error('[AIAssistantController.generatePracticeSet Error]:', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to generate practice questions.',
      });
    }
  }

  /**
   * POST /api/ai/practice/submit
   */
  public static async submitPracticeSet(req: AuthRequest, res: Response) {
    try {
      const userId = req.user!.id;
      const role = req.user!.role;

      if (role !== Role.STUDENT) {
        return res.status(403).json({
          success: false,
          message: 'Only students can submit practice sets.',
        });
      }

      const { subject, topic, difficulty, questions, answers } = req.body;

      if (!subject || !topic || !difficulty || !Array.isArray(questions) || !Array.isArray(answers)) {
        return res.status(400).json({
          success: false,
          message: 'Missing submission payload.',
        });
      }

      const result = await PracticeService.submitPracticeSet({
        subject,
        topic,
        difficulty: difficulty as Difficulty,
        questions,
        answers,
        userId,
      });

      return res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      console.error('[AIAssistantController.submitPracticeSet Error]:', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to submit practice set results.',
      });
    }
  }

  /**
   * GET /api/ai/performance-insights
   */
  public static async getPerformanceInsights(req: AuthRequest, res: Response) {
    try {
      const userId = req.user!.id;
      const role = req.user!.role;

      if (role !== Role.STUDENT) {
        return res.status(403).json({
          success: false,
          message: 'Performance insights are strictly for Students.',
        });
      }

      const insights = await AIStatsService.getStudentPerformanceInsights(userId);

      // Log Audit Log Performance Analysis
      await AuditLogger.log({
        userId,
        action: 'AI_PERFORMANCE_ANALYSIS',
        resource: 'TestAssignment',
        details: `Queried performance analytics insights.`,
      });

      if (!insights) {
        return res.status(200).json({
          success: true,
          data: {
            message: 'No sufficient performance data available.',
          },
        });
      }

      return res.status(200).json({
        success: true,
        data: insights,
      });
    } catch (error: any) {
      console.error('[AIAssistantController.getPerformanceInsights Error]:', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to retrieve performance insights.',
      });
    }
  }

  /**
   * GET /api/ai/practice/attempts
   */
  public static async getPracticeAttempts(req: AuthRequest, res: Response) {
    try {
      const userId = req.user!.id;
      const role = req.user!.role;

      if (role !== Role.STUDENT) {
        return res.status(403).json({
          success: false,
          message: 'Practice attempts list is restricted to Students.',
        });
      }

      const attempts = await prisma.aIPracticeAttempt.findMany({
        where: { studentId: userId },
        orderBy: { createdAt: 'desc' },
      });

      return res.status(200).json({
        success: true,
        data: attempts,
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to retrieve practice history.',
      });
    }
  }

  /**
   * GET /api/ai/practice/recommendations
   */
  public static async getStudentRecommendations(req: AuthRequest, res: Response) {
    try {
      if (!req.user) {
        return res.status(401).json({ success: false, message: 'Unauthenticated.' });
      }

      const userId = req.user.id;
      const role = req.user.role;

      if (role !== Role.STUDENT) {
        return res.status(403).json({
          success: false,
          message: 'Student recommendations are strictly for Students.',
        });
      }

      const insights = await AIStatsService.getStudentPerformanceInsights(userId);

      return res.status(200).json({
        success: true,
        data: {
          recommendations: insights?.recommendations || [],
          weakTopics: insights?.weakTopics || [],
          weakSubjects: insights?.weakSubjects || [],
        },
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to retrieve student recommendations.';
      console.error('[AIAssistantController.getStudentRecommendations Error]:', error);
      return res.status(500).json({
        success: false,
        message,
      });
    }
  }
}

