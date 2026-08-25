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
   * POST /api/ai/chat/stream
   * Real-time Server-Sent Events (SSE) AI streaming response endpoint
   */
  public static async postChatMessageStream(req: AuthRequest, res: Response) {
    const userId = req.user!.id;
    const role = req.user!.role;
    const { message, conversationId, requestId } = req.body || {};
    const reqId = requestId || `req-${Date.now()}`;

    // 1. Input Validation before sending headers
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Message content must be a non-empty string.',
      });
    }

    if (message.length > 4000) {
      return res.status(400).json({
        success: false,
        message: 'Message content exceeds maximum allowed length of 4000 characters.',
      });
    }

    // 2. Set SSE Headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    if (typeof (res as any).flushHeaders === 'function') {
      (res as any).flushHeaders();
    }

    console.log(`[STREAM] request started requestId=${reqId} userId=${userId}`);

    const abortController = new AbortController();
    let isCompleted = false;

    const onClose = () => {
      if (!isCompleted && !res.writableEnded) {
        console.log(`[STREAM] client disconnected requestId=${reqId}`);
        console.log(`[STREAM] aborting Ollama request requestId=${reqId}`);
        abortController.abort();
      }
    };

    req.on('close', onClose);

    const sendSSE = (event: string, data: any) => {
      if (!res.writableEnded) {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      }
    };

    try {
      await AIChatService.processChatMessageStream({
        userId,
        role,
        message: message.trim(),
        conversationId,
        requestId: reqId,
        signal: abortController.signal,
        sendSSE,
      });

      isCompleted = true;
      req.off('close', onClose);

      if (!res.writableEnded) {
        console.log(`[STREAM] stream completed normally requestId=${reqId}`);
        res.end();
      }
    } catch (error: any) {
      isCompleted = true;
      req.off('close', onClose);

      if (error.name === 'AbortError' || abortController.signal.aborted) {
        console.log(`[STREAM] Ollama stream terminated requestId=${reqId}`);
      } else {
        console.error(`[STREAM Error] requestId=${reqId}:`, error.message);
        sendSSE('error', {
          code: error.code || 'AI_STREAM_ERROR',
          message: 'An error occurred while streaming the AI response. Please try again later.',
        });
      }

      if (!res.writableEnded) {
        res.end();
      }
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
