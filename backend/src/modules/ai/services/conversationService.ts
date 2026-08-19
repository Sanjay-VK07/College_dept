import { prisma } from '../../../config/prisma';
import { AIMessageRole, AIRequestStatus } from '@prisma/client';
import { ConversationSummary } from '../types/ai.types';

export class ConversationService {
  /**
   * Scoped lookup for existing USER message by requestId belonging strictly to the authenticated user.
   * Prevents cross-user data leakage (returns null if user does not own the message).
   */
  public static async findUserMessageByRequestId(requestId: string, userId: string): Promise<any | null> {
    if (!requestId) return null;
    return await prisma.aIMessage.findFirst({
      where: {
        requestId,
        conversation: { userId },
      },
      include: {
        conversation: true,
        assistantMessage: true,
      },
    });
  }

  /**
   * Retrieves the ASSISTANT response explicitly linked to a USER message via parentUserMessageId
   */
  public static async getLinkedAssistantMessage(parentUserMessageId: string): Promise<any | null> {
    return await prisma.aIMessage.findFirst({
      where: {
        parentUserMessageId,
        role: AIMessageRole.ASSISTANT,
      },
    });
  }

  /**
   * Atomically claims the processing lock for a user request if it is FAILED or has a stale lock (>= 2 mins).
   * Returns true if lock was acquired by this process, false otherwise.
   */
  public static async claimProcessingLock(userMessageId: string): Promise<boolean> {
    const staleCutoff = new Date(Date.now() - 2 * 60 * 1000);
    const claim = await prisma.aIMessage.updateMany({
      where: {
        id: userMessageId,
        OR: [
          { status: AIRequestStatus.FAILED },
          { status: AIRequestStatus.PROCESSING, processingStartedAt: { lt: staleCutoff } },
        ],
      },
      data: {
        status: AIRequestStatus.PROCESSING,
        processingStartedAt: new Date(),
      },
    });

    return claim.count === 1;
  }

  /**
   * Marks a user request message as FAILED when provider or processing encounters a terminal failure
   */
  public static async markUserMessageFailed(userMessageId: string): Promise<void> {
    await prisma.aIMessage.update({
      where: { id: userMessageId },
      data: {
        status: AIRequestStatus.FAILED,
        processingStartedAt: null,
      },
    });
  }

  /**
   * Gets an existing conversation owned strictly by the user, or creates a new one if conversationId is undefined.
   * Throws 404 if a conversationId is provided but not owned by the authenticated user.
   */
  public static async getOrCreateConversation(
    userId: string,
    conversationId?: string,
    initialTitle?: string
  ): Promise<any> {
    if (conversationId) {
      const existing = await prisma.aIConversation.findFirst({
        where: { id: conversationId, userId },
        include: {
          messages: {
            orderBy: { createdAt: 'asc' },
          },
        },
      });

      if (!existing) {
        const error: any = new Error('Conversation not found or access forbidden');
        error.status = 404;
        throw error;
      }

      return existing;
    }

    const title = initialTitle ? initialTitle.substring(0, 50) : 'New AI Consultation';
    return await prisma.aIConversation.create({
      data: {
        userId,
        title,
      },
      include: {
        messages: true,
      },
    });
  }

  /**
   * Retrieves all conversations belonging strictly to the authenticated user
   */
  public static async getUserConversations(userId: string): Promise<ConversationSummary[]> {
    const list = await prisma.aIConversation.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      take: 20,
      include: {
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    return list.map((c) => ({
      id: c.id,
      title: c.title,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      lastMessage: c.messages[0]?.content || '',
    }));
  }

  /**
   * Gets a specific conversation by ID with strict ownership validation
   */
  public static async getConversationById(userId: string, conversationId: string): Promise<any> {
    const conversation = await prisma.aIConversation.findFirst({
      where: { id: conversationId, userId },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!conversation) {
      const error: any = new Error('Conversation not found or access forbidden');
      error.status = 404;
      throw error;
    }

    return conversation;
  }

  /**
   * Deletes a conversation owned by the authenticated user
   */
  public static async deleteConversation(userId: string, conversationId: string): Promise<boolean> {
    const existing = await prisma.aIConversation.findFirst({
      where: { id: conversationId, userId },
    });

    if (!existing) {
      const error: any = new Error('Conversation not found or access forbidden');
      error.status = 404;
      throw error;
    }

    await prisma.aIConversation.delete({
      where: { id: conversationId },
    });

    return true;
  }

  /**
   * Saves a USER message initialized with status PROCESSING and processingStartedAt = now().
   * Handles concurrent insert race conditions gracefully via P2002 catch.
   */
  public static async saveUserMessage(conversationId: string, content: string, requestId?: string): Promise<any> {
    if (requestId) {
      try {
        const message = await prisma.aIMessage.create({
          data: {
            conversationId,
            requestId,
            role: AIMessageRole.USER,
            status: AIRequestStatus.PROCESSING,
            processingStartedAt: new Date(),
            content,
          },
        });

        await this.updateConversationTitleAndTimestamp(conversationId, content);
        return message;
      } catch (error: any) {
        if (error?.code === 'P2002') {
          const existing = await prisma.aIMessage.findUnique({
            where: { requestId },
            include: { conversation: true, assistantMessage: true },
          });
          if (existing) return existing;
        }
        throw error;
      }
    }

    const message = await prisma.aIMessage.create({
      data: {
        conversationId,
        role: AIMessageRole.USER,
        status: AIRequestStatus.PROCESSING,
        processingStartedAt: new Date(),
        content,
      },
    });

    await this.updateConversationTitleAndTimestamp(conversationId, content);
    return message;
  }

  /**
   * Saves an ASSISTANT message explicitly linked to its parent USER message via parentUserMessageId,
   * and transitions the parent USER message status to COMPLETED with processingStartedAt = null.
   */
  public static async saveAssistantMessage(
    conversationId: string,
    parentUserMessageId: string,
    content: string
  ): Promise<any> {
    try {
      return await prisma.$transaction(async (tx) => {
        const assistantMessage = await tx.aIMessage.create({
          data: {
            conversationId,
            parentUserMessageId,
            role: AIMessageRole.ASSISTANT,
            status: AIRequestStatus.COMPLETED,
            content,
          },
        });

        await tx.aIMessage.update({
          where: { id: parentUserMessageId },
          data: {
            status: AIRequestStatus.COMPLETED,
            processingStartedAt: null,
          },
        });

        await tx.aIConversation.update({
          where: { id: conversationId },
          data: { updatedAt: new Date() },
        });

        return assistantMessage;
      });
    } catch (error: any) {
      if (error?.code === 'P2002') {
        // Unique constraint violation on parentUserMessageId - assistant response already created concurrently
        const existingAssistant = await prisma.aIMessage.findFirst({
          where: {
            parentUserMessageId,
            role: AIMessageRole.ASSISTANT,
          },
        });
        if (existingAssistant) return existingAssistant;
      }
      throw error;
    }
  }

  /**
   * Helper to update title and updatedAt on conversation
   */
  private static async updateConversationTitleAndTimestamp(conversationId: string, content: string): Promise<void> {
    const conv = await prisma.aIConversation.findUnique({
      where: { id: conversationId },
      select: { title: true },
    });

    if (conv && (conv.title === 'New AI Consultation' || !conv.title)) {
      const newTitle = content.length > 40 ? content.substring(0, 40) + '...' : content;
      await prisma.aIConversation.update({
        where: { id: conversationId },
        data: { title: newTitle, updatedAt: new Date() },
      });
    } else {
      await prisma.aIConversation.update({
        where: { id: conversationId },
        data: { updatedAt: new Date() },
      });
    }
  }

  /**
   * Loads recent messages for provider context (limited to recent 10 messages)
   */
  public static async getRecentMessages(
    conversationId: string,
    limit = 10
  ): Promise<Array<{ role: 'user' | 'assistant'; content: string }>> {
    const msgs = await prisma.aIMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return msgs.reverse().map((m) => ({
      role: m.role === AIMessageRole.ASSISTANT ? 'assistant' : 'user',
      content: m.content,
    }));
  }
}

