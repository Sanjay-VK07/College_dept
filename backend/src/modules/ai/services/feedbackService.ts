import { prisma } from '../../../config/prisma';
import { AIFeedbackRating, AIFeedbackCategory, AIMessageRole } from '@prisma/client';

export interface SubmitFeedbackParams {
  messageId: string;
  userId: string;
  rating: AIFeedbackRating;
  category?: AIFeedbackCategory;
  comment?: string;
}

export class FeedbackService {
  /**
   * Submits or updates feedback for an ASSISTANT message owned by the authenticated user.
   * Database-level query strictly enforces cross-user isolation.
   */
  public static async submitFeedback(params: SubmitFeedbackParams) {
    const { messageId, userId, rating, category, comment } = params;

    // 1. Database-level ownership & role verification
    const message = await prisma.aIMessage.findFirst({
      where: {
        id: messageId,
        role: AIMessageRole.ASSISTANT,
        conversation: {
          userId,
        },
      },
    });

    if (!message) {
      const err: any = new Error(
        'Forbidden: You can only submit feedback for assistant messages in your own conversations.'
      );
      err.status = 403;
      throw err;
    }

    // 2. Upsert feedback record via composite key @@unique([messageId, userId])
    const feedback = await prisma.aIFeedback.upsert({
      where: {
        messageId_userId: {
          messageId,
          userId,
        },
      },
      update: {
        rating,
        category: category || null,
        comment: comment ? comment.trim() : null,
      },
      create: {
        messageId,
        userId,
        rating,
        category: category || null,
        comment: comment ? comment.trim() : null,
      },
    });

    return feedback;
  }

  /**
   * Retrieves active feedback for an assistant message owned by the authenticated user.
   */
  public static async getFeedbackForMessage(messageId: string, userId: string) {
    // Database-level ownership check
    const message = await prisma.aIMessage.findFirst({
      where: {
        id: messageId,
        role: AIMessageRole.ASSISTANT,
        conversation: {
          userId,
        },
      },
    });

    if (!message) {
      const err: any = new Error(
        'Forbidden: You can only view feedback for assistant messages in your own conversations.'
      );
      err.status = 403;
      throw err;
    }

    return await prisma.aIFeedback.findUnique({
      where: {
        messageId_userId: {
          messageId,
          userId,
        },
      },
    });
  }
}
