import { Role, AIRequestStatus, AIRAGDecision, AIRAGTraceStatus } from '@prisma/client';
import { prisma } from '../../../config/prisma';
import { IntentService } from './intentService';
import { ContextService } from './contextService';
import { ConversationService } from './conversationService';
import { AIProviderService } from './aiProviderService';
import { RAGService } from './ragService';
import { RAGObservabilityService } from './ragObservabilityService';
import { AICircuitBreakerService } from './aiCircuitBreakerService';
import { AIGovernanceService } from './aiGovernanceService';
import { buildStudentPrompt } from '../prompts/studentPrompt';
import { buildFacultyPrompt } from '../prompts/facultyPrompt';
import { buildAdminPrompt } from '../prompts/adminPrompt';
import { ChatResponseData } from '../types/ai.types';
import { performance } from 'perf_hooks';
import { AIStatsService } from './aiStatsService';

export class AIChatService {
  /**
   * Enterprise State-Machine Driven AI Chat Orchestration Flow with RAG Observability & Provenance:
   * 1. Request validation
   * 2. Scoped Idempotency & Request Lifecycle State Check (PROCESSING / COMPLETED / FAILED)
   * 3. Completed Idempotent Replay Check (zero RAG calls, zero duplicate traces)
   * 4. Atomic processing lock acquisition for retries / new requests
   * 5. Initialize AIRAGTrace (status = PROCESSING)
   * 6. Intent classification & RAG decision
   * 7. Vector Search, RAG Quality Evaluation & Citation Provenance Validation
   * 8. AI Provider invocation with timing metrics
   * 9. Fail-safe provider handling (updates user message & trace status to FAILED on error)
   * 10. Save ASSISTANT response linked deterministically via parentUserMessageId
   * 11. Finalize AIRAGTrace (status = COMPLETED with totalDurationMs)
   */
  public static async processChatMessage(
    userId: string,
    role: Role,
    message: string,
    conversationId?: string,
    requestId?: string
  ): Promise<ChatResponseData> {
    const requestStartTime = performance.now();

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

    // 0. Circuit Breaker Pre-Flight Check
    const cbCheck = AICircuitBreakerService.checkCircuitBreaker();
    if (!cbCheck.allowed) {
      return {
        success: false,
        type: 'AI_PROVIDER_UNAVAILABLE',
        error: cbCheck.message || 'AI service is temporarily unavailable.',
      };
    }

    // 0.1 Safety & Governance Check
    const safetyResult = AIGovernanceService.inspectInputSafety(trimmedMsg);
    if (!safetyResult.safe) {
      return {
        success: false,
        type: 'PROMPT_INJECTION_DETECTED',
        error: safetyResult.violationReason || 'Input prompt violates safety policy.',
      };
    }

    let userMsg: any = null;
    let conversation: any = null;

    // 2. Scoped Idempotency & Request Lifecycle State Machine
    if (requestId) {
      const existingUserMsg = await ConversationService.findUserMessageByRequestId(requestId, userId);

      if (existingUserMsg) {
        conversation = existingUserMsg.conversation;

        if (existingUserMsg.status === AIRequestStatus.COMPLETED) {
          // Completed Idempotent Replay: Return existing ASSISTANT message
          // ZERO embedding calls, ZERO vector search, ZERO AI provider calls, ZERO duplicate AIRAGTrace rows
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

    // 4. Initialize AIRAGTrace (status = PROCESSING) with dual-path upsert/create logic
    let trace: any = null;
    try {
      trace = await RAGObservabilityService.createInitialTrace({
        requestId,
        conversationId: conversation.id,
        userId,
        userMessageId: userMsg.id,
      });
    } catch (traceErr: any) {
      console.warn('[AIChatService] Initial trace creation warning:', traceErr.message);
    }

    const traceId = trace ? trace.id : '';

    // --- Phase 2D Intent Routing ---
    
    // A. Predefined Database Query statistics routing
    const isStatsQuery = (role === Role.ADMIN || role === Role.FACULTY) &&
      (trimmedMsg.toLowerCase().includes('how many') ||
       trimmedMsg.toLowerCase().includes('count') ||
       trimmedMsg.toLowerCase().includes('average') ||
       trimmedMsg.toLowerCase().includes('statistics') ||
       trimmedMsg.toLowerCase().includes('scheduled this week') ||
       trimmedMsg.toLowerCase().includes('active exams') ||
       trimmedMsg.toLowerCase().includes('today') ||
       trimmedMsg.toLowerCase().includes('report') ||
       trimmedMsg.toLowerCase().includes('top 10') ||
       trimmedMsg.toLowerCase().includes('highest') ||
       trimmedMsg.toLowerCase().includes('present'));

    if (isStatsQuery) {
      try {
        const statsResponse = await AIStatsService.handleStatsQuery(trimmedMsg, role);
        const assistantMsg = await ConversationService.saveAssistantMessage(
          conversation.id,
          userMsg.id,
          statsResponse
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
          answer: assistantMsg.content,
          messageId: assistantMsg.id,
        };
      } catch (err: any) {
        await ConversationService.markUserMessageFailed(userMsg.id);
        return {
          success: false,
          type: 'AI_PROVIDER_UNAVAILABLE',
          conversationId: conversation.id,
          error: 'Failed to process database statistics query.',
        };
      }
    }

    // B. PYQ / Variant Question Generation routing
    const isVariantQuery = (role === Role.ADMIN || role === Role.FACULTY) &&
      (trimmedMsg.toLowerCase().includes('variant') ||
       trimmedMsg.toLowerCase().includes('pyq') ||
       trimmedMsg.toLowerCase().includes('change values') ||
       trimmedMsg.toLowerCase().includes('generate a question') ||
       trimmedMsg.toLowerCase().includes('generate question'));

    if (isVariantQuery) {
      try {
        let originalQuestionText = '';
        
        // Check if the user wants to pick a random question from bank
        const isRandomRequest = trimmedMsg.toLowerCase().includes('random') || 
                                trimmedMsg.toLowerCase().includes('from bank') || 
                                trimmedMsg.toLowerCase().includes('from database');
        
        if (isRandomRequest) {
          const qCount = await prisma.question.count();
          if (qCount > 0) {
            const randomIndex = Math.floor(Math.random() * qCount);
            const randomQ = await prisma.question.findFirst({
              skip: randomIndex,
            });
            if (randomQ) {
              originalQuestionText = randomQ.text;
            }
          }
        } else {
          // Extract pasted question
          const prefixes = [
            'generate variant of:',
            'generate variant of',
            'generate variant for:',
            'generate variant for',
            'variant of:',
            'variant of',
            'pyq:',
            'pyq'
          ];
          let foundPasted = '';
          for (const prefix of prefixes) {
            const idx = trimmedMsg.toLowerCase().indexOf(prefix);
            if (idx !== -1) {
              foundPasted = trimmedMsg.slice(idx + prefix.length).trim();
              break;
            }
          }
          if (foundPasted.length > 10) {
            originalQuestionText = foundPasted;
          } else {
            if (trimmedMsg.length > 50) {
              originalQuestionText = trimmedMsg;
            } else {
              const qCount = await prisma.question.count();
              if (qCount > 0) {
                const randomIndex = Math.floor(Math.random() * qCount);
                const randomQ = await prisma.question.findFirst({
                  skip: randomIndex,
                });
                if (randomQ) {
                  originalQuestionText = randomQ.text;
                }
              }
            }
          }
        }

        if (!originalQuestionText) {
          originalQuestionText = 'If a train runs at 60 km/h, how many seconds does it take to cross a 1.5 km long bridge? Options: A) 90s, B) 60s, C) 150s, D) 120s';
        }

        const variantPrompt = `
You are an expert GATE exam question variant generator.
The user has requested to generate a new question variant based on the following original question:
"${originalQuestionText}"

Your task:
1. Identify the core concepts, subjects, and topic of the question.
2. Change the numerical values, parameters, scenario details, or equations.
3. Formulate a brand new question with these modified values.
4. Generate new option choices (A, B, C, D) based on the new values.
5. Calculate the exact new correct option and write a detailed, step-by-step mathematical explanation showing how the solution is derived.
6. Return your response as a beautifully formatted markdown message. Show the Original Question, the New Generated Variant, the Option Choices, the Correct Answer, and the detailed Explanation.
`;

        const providerResult = await AIProviderService.generateResponse(
          variantPrompt,
          [],
          `Generate variant of: ${originalQuestionText}`
        );

        if (providerResult.success && providerResult.content) {
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
            answer: assistantMsg.content,
            messageId: assistantMsg.id,
          };
        }
      } catch (err: any) {
        console.error('[AIChatService.processChatMessage Variant Fallback Error]:', err);
      }
    }

    // C. RAG document search and Q&A routing
    try {
      const matchedChunks = await RAGService.searchChunks({
        query: trimmedMsg,
        userId,
        role,
        limit: 3,
      });

      if (matchedChunks.length > 0) {
        const ragResult = await RAGService.answerQuestion({
          query: trimmedMsg,
          userId,
          role,
          limit: 3,
        });

        let finalContent = ragResult.answer;
        if (ragResult.sources && ragResult.sources.length > 0) {
          const sourceList = Array.from(new Set(ragResult.sources.map(s => s.documentTitle)))
            .map(title => `- ${title}`)
            .join('\n');
          finalContent += `\n\n**Sources:**\n${sourceList}`;
        }

        const assistantMsg = await ConversationService.saveAssistantMessage(
          conversation.id,
          userMsg.id,
          finalContent
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
          answer: ragResult.answer,
          sources: ragResult.sources,
          messageId: assistantMsg.id,
        };
      }
    } catch (ragErr) {
      console.error('[AIChatService RAG Routing Fallback]:', ragErr);
      // Fall through to default chatbot on RAG search failure
    }

    // --- End Phase 2D Routing (Fallback to Phase 1 General Chat) ---

    // 5. Intent Classification
    const intent = IntentService.classifyIntent(trimmedMsg);

    // 6. RAG Pipeline Execution (If applicable)
    let ragResult: any = {
      ragDecision: AIRAGDecision.SKIPPED_GENERAL_KNOWLEDGE,
      ragUsed: false,
      contextText: '',
      sources: [],
      embeddingDurationMs: 0,
      vectorSearchDurationMs: 0,
      contextAssemblyDurationMs: 0,
    };

    // Trigger RAG for general knowledge or unknown inquiry if context exists
    if (
      intent === 'GENERAL_KNOWLEDGE' ||
      intent === 'UNKNOWN'
    ) {
      try {
        ragResult = await RAGService.executeRAGPipeline({
          userMessage: trimmedMsg,
          userId,
          role,
        });
      } catch (ragPipelineErr: any) {
        console.error('[AIChatService] RAG Pipeline error:', ragPipelineErr.message);
        ragResult.ragDecision = AIRAGDecision.FAILED;
        ragResult.errorCode = 'AI_RAG_UNAVAILABLE';
      }
    }

    // 7. Retrieve DB Verified Context Scoped to User & Intent
    const verifiedContext = await ContextService.getAuthorizedContext({
      userId,
      role,
      intent,
    });

    // Merge RAG context text if available
    if (ragResult.ragUsed && ragResult.contextText) {
      (verifiedContext as any).documentContext = ragResult.contextText;
    }

    // 8. Retrieve Recent History (last 10 messages)
    const recentHistory = await ConversationService.getRecentMessages(conversation.id, 10);

    // 9. Build Secure Role Prompt
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

    // 10. Invoke AI Provider with timing measurement
    const providerStartTime = performance.now();
    let providerResult;
    try {
      providerResult = await AIProviderService.generateResponse(systemPrompt, recentHistory, trimmedMsg);
    } catch (err: any) {
      const providerDurationMs = Math.round(performance.now() - providerStartTime);
      const totalDurationMs = Math.round(performance.now() - requestStartTime);

      await ConversationService.markUserMessageFailed(userMsg.id);
      if (traceId) {
        await RAGObservabilityService.markTraceFailed(
          traceId,
          requestId,
          'AI_PROVIDER_UNAVAILABLE',
          'Provider call threw exception',
          totalDurationMs
        );
      }

      return {
        success: false,
        type: 'AI_PROVIDER_UNAVAILABLE',
        conversationId: conversation.id,
        error: 'The AI service is currently unavailable. Please try again later.',
      };
    }

    const providerDurationMs = Math.round(performance.now() - providerStartTime);

    // 11. Provider Failure Handling (Update status to FAILED, NO fake messages saved)
    if (!providerResult.success || !providerResult.content) {
      const totalDurationMs = Math.round(performance.now() - requestStartTime);

      await ConversationService.markUserMessageFailed(userMsg.id);
      if (traceId) {
        await RAGObservabilityService.markTraceFailed(
          traceId,
          requestId,
          'AI_PROVIDER_UNAVAILABLE',
          providerResult.message || 'AI Provider returned unsuccessful response',
          totalDurationMs
        );
      }

      return {
        success: false,
        type: 'AI_PROVIDER_UNAVAILABLE',
        conversationId: conversation.id,
        error: providerResult.message || 'The AI service is currently unavailable. Please try again later.',
      };
    }

    // 12. Save ASSISTANT Response linked deterministically to USER message
    const assistantMsg = await ConversationService.saveAssistantMessage(
      conversation.id,
      userMsg.id,
      providerResult.content
    );

    // 13. Finalize AIRAGTrace (status = COMPLETED with totalDurationMs)
    const totalDurationMs = Math.round(performance.now() - requestStartTime);

    if (traceId) {
      const finalStatus =
        ragResult.ragDecision === AIRAGDecision.FAILED
          ? AIRAGTraceStatus.FAILED
          : ragResult.ragDecision === AIRAGDecision.RETRIEVAL_NO_RELEVANT
          ? AIRAGTraceStatus.NO_RELEVANT_CONTEXT
          : AIRAGTraceStatus.COMPLETED;

      await RAGObservabilityService.updateTrace(traceId, requestId, {
        ragDecision: ragResult.ragDecision,
        ragUsed: ragResult.ragUsed,
        status: finalStatus,
        embeddingDurationMs: ragResult.embeddingDurationMs || 0,
        vectorSearchDurationMs: ragResult.vectorSearchDurationMs || 0,
        contextAssemblyDurationMs: ragResult.contextAssemblyDurationMs || 0,
        providerDurationMs,
        totalDurationMs,
        authorizedChunksFound: ragResult.evaluation?.authorizedChunksFound || 0,
        relevantChunksUsed: ragResult.evaluation?.relevantChunksUsed || 0,
        sourceDocumentCount: ragResult.sources ? ragResult.sources.length : 0,
        qualityScore: ragResult.evaluation?.qualityScore || null,
        qualityClassification: ragResult.evaluation?.qualityClassification || null,
        fallbackReason: ragResult.fallbackReason || null,
        errorCode: ragResult.errorCode || null,
        assistantMessageId: assistantMsg.id,
      });
    }

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
      sources: ragResult.ragUsed ? ragResult.sources : undefined,
    } as any;
  }
}
