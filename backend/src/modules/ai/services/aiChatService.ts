import { Role, AIRequestStatus } from '@prisma/client';
import { IntentService } from './intentService';
import { ContextService } from './contextService';
import { ConversationService } from './conversationService';
import { AIProviderService } from './aiProviderService';
import { buildStudentPrompt } from '../prompts/studentPrompt';
import { buildFacultyPrompt } from '../prompts/facultyPrompt';
import { buildAdminPrompt } from '../prompts/adminPrompt';
import { ChatResponseData } from '../types/ai.types';

export class AIChatService {
  /**
   * Enterprise State-Machine Driven AI Chat Orchestration Flow:
   * 1. Request validation
   * 2. Scoped Idempotency & Request Lifecycle State Check (PROCESSING / COMPLETED / FAILED)
   * 3. Atomic processing lock acquisition for retries / new requests
   * 4. Strict conversation ownership check
   * 5. Intent classification & authorized context retrieval
   * 6. AI Provider invocation
   * 7. Fail-safe provider handling (updates user message status to FAILED on error, no fake messages)
   * 8. Deterministic assistant message saving linked via parentUserMessageId
   */
  public static async processChatMessage(
    userId: string,
    role: Role,
    message: string,
    conversationId?: string,
    requestId?: string
  ): Promise<ChatResponseData> {
    // 1. Request Validation
    if (!message || message.trim().length === 0) {
      const err: any = new Error('Message content cannot be empty.');
      err.status = 400;
      throw err;
    }

    const trimmedMsg = message.trim();
    if (trimmedMsg.length > 2000) {
      const err: any = new Error('Message length exceeds maximum limit of 2000 characters.');
      err.status = 400;
      throw err;
    }

    let userMsg: any = null;
    let conversation: any = null;

    // 2. Scoped Idempotency & Request Lifecycle State Machine
    if (requestId) {
      const existingUserMsg = await ConversationService.findUserMessageByRequestId(requestId, userId);

      if (existingUserMsg) {
        conversation = existingUserMsg.conversation;

        if (existingUserMsg.status === AIRequestStatus.COMPLETED) {
          // Return existing ASSISTANT message deterministically linked via parentUserMessageId
          const assistantMsg =
            existingUserMsg.assistantMessage ||
            (await ConversationService.getLinkedAssistantMessage(existingUserMsg.id));

          if (assistantMsg) {
            return {
              success: true,
              type: 'SUCCESS',
              conversationId: conversation.id,
              title: conversation.title || 'AI Consultation',
              message: {
                id: assistantMsg.id,
                role: assistantMsg.role,
                content: assistantMsg.content,
                createdAt: assistantMsg.createdAt,
              },
            };
          }
        }

        // Check lock age for in-flight requests (2-minute lock timeout)
        const lockAgeMs = existingUserMsg.processingStartedAt
          ? Date.now() - new Date(existingUserMsg.processingStartedAt).getTime()
          : 999999;

        if (existingUserMsg.status === AIRequestStatus.PROCESSING && lockAgeMs < 2 * 60 * 1000) {
          return {
            success: false,
            type: 'AI_REQUEST_IN_PROGRESS',
            conversationId: conversation.id,
            error: 'Your request is currently being processed. Please wait a moment.',
          };
        }

        // FAILED or Stale PROCESSING state: Attempt atomic lock acquisition for retry
        const claimed = await ConversationService.claimProcessingLock(existingUserMsg.id);
        if (!claimed) {
          return {
            success: false,
            type: 'AI_REQUEST_IN_PROGRESS',
            conversationId: conversation.id,
            error: 'Your request is currently being processed by another task. Please wait a moment.',
          };
        }

        userMsg = existingUserMsg;
      }
    }

    // 3. Validate / Create Conversation & User Message (If new request)
    if (!userMsg) {
      conversation = await ConversationService.getOrCreateConversation(userId, conversationId, trimmedMsg);
      userMsg = await ConversationService.saveUserMessage(conversation.id, trimmedMsg, requestId);
    }

    // 4. Intent Classification
    const intent = IntentService.classifyIntent(trimmedMsg);

    // 5. Retrieve Recent History (last 10 messages)
    const recentHistory = await ConversationService.getRecentMessages(conversation.id, 10);

    // 6. Retrieve Verified Context Scoped to User & Intent
    const verifiedContext = await ContextService.getAuthorizedContext({
      userId,
      role,
      intent,
    });

    // 7. Build Secure Role Prompt
    let systemPrompt = '';
    if (role === Role.STUDENT) {
      systemPrompt = buildStudentPrompt(verifiedContext);
    } else if (role === Role.FACULTY) {
      systemPrompt = buildFacultyPrompt(verifiedContext);
    } else if (role === Role.ADMIN) {
      systemPrompt = buildAdminPrompt(verifiedContext);
    } else {
      systemPrompt = buildStudentPrompt(verifiedContext);
    }

    // 8. Call AI Provider
    let providerResult;
    try {
      providerResult = await AIProviderService.generateResponse(systemPrompt, recentHistory, trimmedMsg);
    } catch (err: any) {
      await ConversationService.markUserMessageFailed(userMsg.id);
      return {
        success: false,
        type: 'AI_PROVIDER_UNAVAILABLE',
        conversationId: conversation.id,
        error: 'The AI service is currently unavailable. Please try again later.',
      };
    }

    // 9. Provider Failure Handling (Update status to FAILED, NO fake messages saved)
    if (!providerResult.success || !providerResult.content) {
      await ConversationService.markUserMessageFailed(userMsg.id);
      return {
        success: false,
        type: 'AI_PROVIDER_UNAVAILABLE',
        conversationId: conversation.id,
        error: providerResult.message || 'The AI service is currently unavailable. Please try again later.',
      };
    }

    // 10. Save ASSISTANT Response linked deterministically to USER message
    const assistantMsg = await ConversationService.saveAssistantMessage(
      conversation.id,
      userMsg.id,
      providerResult.content
    );

    return {
      success: true,
      type: 'SUCCESS',
      conversationId: conversation.id,
      title: conversation.title || 'AI Consultation',
      message: {
        id: assistantMsg.id,
        role: assistantMsg.role,
        content: assistantMsg.content,
        createdAt: assistantMsg.createdAt,
      },
    };
  }
}

