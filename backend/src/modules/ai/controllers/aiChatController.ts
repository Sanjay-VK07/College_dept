import { Response } from 'express';
import { AuthRequest } from '../../../middlewares/authMiddleware';
import { AIChatService } from '../services/aiChatService';
import { ConversationService } from '../services/conversationService';
import { FeedbackService } from '../services/feedbackService';

export class AIChatController {
  /**
   * POST /api/ai/chat
   * Hardened AI chat endpoint with intent classification, context verification, and idempotency
   */
  public static async postChatMessage(req: AuthRequest, res: Response) {
    try {
      const userId = req.user!.id;
      const role = req.user!.role;
      const { message, conversationId, requestId } = req.body;

      const result = await AIChatService.processChatMessage(userId, role, message, conversationId, requestId);

      if (!result.success) {
        return res.status(200).json({
          success: false,
          type: result.type || 'AI_PROVIDER_UNAVAILABLE',
          message: result.error || 'The AI service is currently unavailable. Please try again later.',
        });
      }

      return res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      console.error('[AIChatController.postChatMessage Error]:', error);
      return res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Failed to process AI chat message',
      });
    }
  }

  /**
   * GET /api/ai/conversations
   */
  public static async getConversations(req: AuthRequest, res: Response) {
    try {
      const userId = req.user!.id;
      const conversations = await ConversationService.getUserConversations(userId);

      return res.status(200).json({
        success: true,
        data: conversations,
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to load conversations',
      });
    }
  }

  /**
   * GET /api/ai/conversations/:conversationId
   */
  public static async getConversationById(req: AuthRequest, res: Response) {
    try {
      const userId = req.user!.id;
      const { conversationId } = req.params;

      const conversation = await ConversationService.getConversationById(userId, conversationId);

      return res.status(200).json({
        success: true,
        data: conversation,
      });
    } catch (error: any) {
      return res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Failed to retrieve conversation',
      });
    }
  }

  /**
   * DELETE /api/ai/conversations/:conversationId
   */
  public static async deleteConversation(req: AuthRequest, res: Response) {
    try {
      const userId = req.user!.id;
      const { conversationId } = req.params;

      await ConversationService.deleteConversation(userId, conversationId);

      return res.status(200).json({
        success: true,
        message: 'Conversation deleted successfully',
      });
    } catch (error: any) {
      return res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Failed to delete conversation',
      });
    }
  }

  /**
   * POST /api/ai/messages/:messageId/feedback
   * Submits or updates feedback for an assistant message
   */
  public static async postMessageFeedback(req: AuthRequest, res: Response) {
    try {
      const userId = req.user!.id;
      const { messageId } = req.params;
      const { rating, category, comment } = req.body;

      if (!rating || !['HELPFUL', 'NOT_HELPFUL'].includes(rating)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid feedback rating. Must be HELPFUL or NOT_HELPFUL.',
        });
      }

      const feedback = await FeedbackService.submitFeedback({
        messageId,
        userId,
        rating,
        category,
        comment,
      });

      return res.status(200).json({
        success: true,
        data: feedback,
      });
    } catch (error: any) {
      return res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Failed to submit feedback',
      });
    }
  }

  /**
   * GET /api/ai/messages/:messageId/feedback
   * Retrieves active feedback for an assistant message
   */
  public static async getMessageFeedback(req: AuthRequest, res: Response) {
    try {
      const userId = req.user!.id;
      const { messageId } = req.params;

      const feedback = await FeedbackService.getFeedbackForMessage(messageId, userId);

      return res.status(200).json({
        success: true,
        data: feedback,
      });
    } catch (error: any) {
      return res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Failed to retrieve feedback',
      });
    }
  }
}
