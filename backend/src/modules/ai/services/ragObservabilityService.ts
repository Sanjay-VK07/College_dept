import { prisma } from '../../../config/prisma';
import {
  AIRAGDecision,
  AIRAGTraceStatus,
  AIRAGQualityClassification,
  AIRAGTrace,
} from '@prisma/client';
import { performance } from 'perf_hooks';

export interface CreateTraceParams {
  requestId?: string;
  conversationId: string;
  userId: string;
  userMessageId?: string;
}

export interface UpdateTraceMetricsParams {
  ragDecision?: AIRAGDecision;
  ragUsed?: boolean;
  status?: AIRAGTraceStatus;
  embeddingDurationMs?: number;
  vectorSearchDurationMs?: number;
  contextAssemblyDurationMs?: number;
  providerDurationMs?: number;
  totalDurationMs?: number;
  authorizedChunksFound?: number;
  relevantChunksUsed?: number;
  sourceDocumentCount?: number;
  qualityScore?: number;
  qualityClassification?: AIRAGQualityClassification;
  fallbackReason?: string;
  errorCode?: string;
  assistantMessageId?: string;
}

export class RAGObservabilityService {
  /**
   * Starts a high-precision performance timer using perf_hooks performance.now()
   */
  public static startTimer(): () => number {
    const startTime = performance.now();
    return () => Math.round(performance.now() - startTime);
  }

  /**
   * Initializes or updates an AIRAGTrace row in PROCESSING status.
   * Dual-path logic: uses upsert if requestId exists, create if requestId is null/undefined.
   */
  public static async createInitialTrace(params: CreateTraceParams): Promise<AIRAGTrace> {
    const { requestId, conversationId, userId, userMessageId } = params;

    // Validate ownership/linkage integrity if userMessageId is provided
    if (userMessageId) {
      const userMsg = await prisma.aIMessage.findFirst({
        where: {
          id: userMessageId,
          conversationId,
          conversation: { userId },
        },
      });

      if (!userMsg) {
        console.warn(
          `[RAGObservabilityService] User message ID ${userMessageId} does not match conversation ${conversationId} or user ${userId}. Omitting userMessageId.`
        );
      }
    }

    const initialData = {
      conversationId,
      userId,
      userMessageId: userMessageId || null,
      ragDecision: AIRAGDecision.SKIPPED_GENERAL_KNOWLEDGE,
      ragUsed: false,
      status: AIRAGTraceStatus.PROCESSING,
      embeddingDurationMs: 0,
      vectorSearchDurationMs: 0,
      contextAssemblyDurationMs: 0,
      providerDurationMs: 0,
      totalDurationMs: 0,
      authorizedChunksFound: 0,
      relevantChunksUsed: 0,
      sourceDocumentCount: 0,
    };

    if (requestId) {
      return await prisma.aIRAGTrace.upsert({
        where: { requestId },
        create: {
          requestId,
          ...initialData,
        },
        update: {
          status: AIRAGTraceStatus.PROCESSING,
        },
      });
    } else {
      return await prisma.aIRAGTrace.create({
        data: initialData,
      });
    }
  }

  /**
   * Incrementally updates metrics or finalizes an AIRAGTrace execution.
   */
  public static async updateTrace(
    traceId: string,
    requestId: string | undefined,
    metrics: UpdateTraceMetricsParams
  ): Promise<AIRAGTrace | null> {
    try {
      // Validate assistantMessageId linkage integrity if provided
      if (metrics.assistantMessageId) {
        const trace = await prisma.aIRAGTrace.findUnique({ where: { id: traceId } });
        if (trace) {
          const assistantMsg = await prisma.aIMessage.findFirst({
            where: {
              id: metrics.assistantMessageId,
              conversationId: trace.conversationId,
              conversation: { userId: trace.userId },
            },
          });

          if (!assistantMsg) {
            console.warn(
              `[RAGObservabilityService] Assistant message ${metrics.assistantMessageId} ownership check failed. Omitted.`
            );
            metrics.assistantMessageId = undefined;
          }
        }
      }

      const updateData: any = {};
      if (metrics.ragDecision !== undefined) updateData.ragDecision = metrics.ragDecision;
      if (metrics.ragUsed !== undefined) updateData.ragUsed = metrics.ragUsed;
      if (metrics.status !== undefined) updateData.status = metrics.status;
      if (metrics.embeddingDurationMs !== undefined) updateData.embeddingDurationMs = metrics.embeddingDurationMs;
      if (metrics.vectorSearchDurationMs !== undefined) updateData.vectorSearchDurationMs = metrics.vectorSearchDurationMs;
      if (metrics.contextAssemblyDurationMs !== undefined) updateData.contextAssemblyDurationMs = metrics.contextAssemblyDurationMs;
      if (metrics.providerDurationMs !== undefined) updateData.providerDurationMs = metrics.providerDurationMs;
      if (metrics.totalDurationMs !== undefined) updateData.totalDurationMs = metrics.totalDurationMs;
      if (metrics.authorizedChunksFound !== undefined) updateData.authorizedChunksFound = metrics.authorizedChunksFound;
      if (metrics.relevantChunksUsed !== undefined) updateData.relevantChunksUsed = metrics.relevantChunksUsed;
      if (metrics.sourceDocumentCount !== undefined) updateData.sourceDocumentCount = metrics.sourceDocumentCount;
      if (metrics.qualityScore !== undefined) updateData.qualityScore = metrics.qualityScore;
      if (metrics.qualityClassification !== undefined) updateData.qualityClassification = metrics.qualityClassification;
      if (metrics.fallbackReason !== undefined) updateData.fallbackReason = metrics.fallbackReason;
      if (metrics.errorCode !== undefined) updateData.errorCode = metrics.errorCode;
      if (metrics.assistantMessageId !== undefined) updateData.assistantMessageId = metrics.assistantMessageId;

      if (requestId) {
        return await prisma.aIRAGTrace.upsert({
          where: { requestId },
          create: {
            requestId,
            conversationId: 'unknown',
            userId: 'unknown',
            ragDecision: metrics.ragDecision || AIRAGDecision.FAILED,
            status: metrics.status || AIRAGTraceStatus.FAILED,
            ...updateData,
          },
          update: updateData,
        });
      } else {
        return await prisma.aIRAGTrace.update({
          where: { id: traceId },
          data: updateData,
        });
      }
    } catch (error: any) {
      console.error('[RAGObservabilityService] Failed to update trace:', error.message || error);
      return null;
    }
  }

  /**
   * Finalizes trace as FAILED when an error occurs during execution.
   */
  public static async markTraceFailed(
    traceId: string,
    requestId: string | undefined,
    errorCode: string,
    fallbackReason?: string,
    totalDurationMs?: number
  ): Promise<void> {
    await this.updateTrace(traceId, requestId, {
      status: AIRAGTraceStatus.FAILED,
      ragDecision: AIRAGDecision.FAILED,
      errorCode,
      fallbackReason: fallbackReason || errorCode,
      totalDurationMs,
    });
  }

  /**
   * Aggregates RAG operational metrics for Admin monitoring dashboard.
   */
  public static async getAdminMetrics(timeframe: string = '24h') {
    const now = new Date();
    let startDate = new Date();

    switch (timeframe) {
      case '1h':
        startDate = new Date(now.getTime() - 60 * 60 * 1000);
        break;
      case '24h':
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case '7d':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case 'all':
        startDate = new Date(0);
        break;
      default:
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    }

    const where = { createdAt: { gte: startDate } };

    const totalRequests = await prisma.aIRAGTrace.count({ where });
    if (totalRequests === 0) {
      return {
        hasData: false,
        totalRequests: 0,
        ragRequests: 0,
        ragUsageRate: '0.0%',
        averageEmbeddingLatency: 0,
        averageVectorSearchLatency: 0,
        averageContextAssemblyLatency: 0,
        averageProviderLatency: 0,
        averageTotalLatency: 0,
        confidenceDistribution: {
          highConfidence: 0,
          mediumConfidence: 0,
          lowConfidence: 0,
          noRelevantContext: 0,
          retrievalFailed: 0,
        },
        failureDistribution: {
          noRelevantContext: 0,
          aiRagUnavailable: 0,
          embeddingFailed: 0,
          vectorSearchFailed: 0,
          contextAssemblyFailed: 0,
          aiProviderUnavailable: 0,
        },
        noRelevantContextRate: '0.0%',
      };
    }

    const [ragRequests, aggregations, qualityCounts, statusCounts] = await Promise.all([
      prisma.aIRAGTrace.count({ where: { ...where, ragUsed: true } }),
      prisma.aIRAGTrace.aggregate({
        where,
        _avg: {
          embeddingDurationMs: true,
          vectorSearchDurationMs: true,
          contextAssemblyDurationMs: true,
          providerDurationMs: true,
          totalDurationMs: true,
        },
      }),
      prisma.aIRAGTrace.groupBy({
        by: ['qualityClassification'],
        where,
        _count: { _all: true },
      }),
      prisma.aIRAGTrace.groupBy({
        by: ['status', 'errorCode'],
        where,
        _count: { _all: true },
      }),
    ]);

    const confidenceDistribution = {
      highConfidence: 0,
      mediumConfidence: 0,
      lowConfidence: 0,
      noRelevantContext: 0,
      retrievalFailed: 0,
    };

    for (const q of qualityCounts) {
      if (q.qualityClassification === AIRAGQualityClassification.HIGH_CONFIDENCE) {
        confidenceDistribution.highConfidence = q._count._all;
      } else if (q.qualityClassification === AIRAGQualityClassification.MEDIUM_CONFIDENCE) {
        confidenceDistribution.mediumConfidence = q._count._all;
      } else if (q.qualityClassification === AIRAGQualityClassification.LOW_CONFIDENCE) {
        confidenceDistribution.lowConfidence = q._count._all;
      } else if (q.qualityClassification === AIRAGQualityClassification.NO_RELEVANT_CONTEXT) {
        confidenceDistribution.noRelevantContext = q._count._all;
      } else if (q.qualityClassification === AIRAGQualityClassification.RETRIEVAL_FAILED) {
        confidenceDistribution.retrievalFailed = q._count._all;
      }
    }

    const failureDistribution = {
      noRelevantContext: 0,
      aiRagUnavailable: 0,
      embeddingFailed: 0,
      vectorSearchFailed: 0,
      contextAssemblyFailed: 0,
      aiProviderUnavailable: 0,
    };

    for (const s of statusCounts) {
      if (s.status === AIRAGTraceStatus.NO_RELEVANT_CONTEXT) {
        failureDistribution.noRelevantContext += s._count._all;
      } else if (s.status === AIRAGTraceStatus.AI_RAG_UNAVAILABLE) {
        failureDistribution.aiRagUnavailable += s._count._all;
      } else if (s.errorCode === 'EMBEDDING_FAILED') {
        failureDistribution.embeddingFailed += s._count._all;
      } else if (s.errorCode === 'VECTOR_SEARCH_FAILED') {
        failureDistribution.vectorSearchFailed += s._count._all;
      } else if (s.errorCode === 'CONTEXT_ASSEMBLY_FAILED') {
        failureDistribution.contextAssemblyFailed += s._count._all;
      } else if (s.errorCode === 'AI_PROVIDER_UNAVAILABLE') {
        failureDistribution.aiProviderUnavailable += s._count._all;
      }
    }

    const ragUsageRate = `${((ragRequests / totalRequests) * 100).toFixed(1)}%`;
    const noRelevantContextCount = confidenceDistribution.noRelevantContext + failureDistribution.noRelevantContext;
    const noRelevantContextRate = `${((noRelevantContextCount / totalRequests) * 100).toFixed(1)}%`;

    return {
      hasData: true,
      totalRequests,
      ragRequests,
      ragUsageRate,
      averageEmbeddingLatency: Math.round(aggregations._avg.embeddingDurationMs || 0),
      averageVectorSearchLatency: Math.round(aggregations._avg.vectorSearchDurationMs || 0),
      averageContextAssemblyLatency: Math.round(aggregations._avg.contextAssemblyDurationMs || 0),
      averageProviderLatency: Math.round(aggregations._avg.providerDurationMs || 0),
      averageTotalLatency: Math.round(aggregations._avg.totalDurationMs || 0),
      confidenceDistribution,
      failureDistribution,
      noRelevantContextRate,
    };
  }

  /**
   * Retrieves paginated trace logs for Admin monitoring.
   */
  public static async getAdminTraces(params: {
    page?: number;
    limit?: number;
    status?: AIRAGTraceStatus;
    ragUsed?: boolean;
    userId?: string;
    startDate?: string;
    endDate?: string;
  }) {
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(100, Math.max(1, params.limit || 20));
    const skip = (page - 1) * limit;

    const where: any = {};
    if (params.status) where.status = params.status;
    if (params.ragUsed !== undefined) where.ragUsed = params.ragUsed;
    if (params.userId) where.userId = params.userId;

    if (params.startDate || params.endDate) {
      where.createdAt = {};
      if (params.startDate) where.createdAt.gte = new Date(params.startDate);
      if (params.endDate) where.createdAt.lte = new Date(params.endDate);
    }

    const [total, traces] = await Promise.all([
      prisma.aIRAGTrace.count({ where }),
      prisma.aIRAGTrace.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          requestId: true,
          conversationId: true,
          userId: true,
          userMessageId: true,
          assistantMessageId: true,
          ragDecision: true,
          ragUsed: true,
          status: true,
          embeddingDurationMs: true,
          vectorSearchDurationMs: true,
          contextAssemblyDurationMs: true,
          providerDurationMs: true,
          totalDurationMs: true,
          authorizedChunksFound: true,
          relevantChunksUsed: true,
          sourceDocumentCount: true,
          qualityScore: true,
          qualityClassification: true,
          fallbackReason: true,
          errorCode: true,
          createdAt: true,
          user: {
            select: { name: true, role: true },
          },
        },
      }),
    ]);

    return {
      data: traces,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}
