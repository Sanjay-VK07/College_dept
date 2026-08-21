import { Request, Response } from 'express';
import { RAGObservabilityService } from '../services/ragObservabilityService';
import { prisma } from '../../../config/prisma';
import { ENV } from '../../../config/env';

export class RAGAdminController {
  /**
   * GET /api/ai/rag/health
   * Lightweight health check of RAG subsystem components without expensive external API calls.
   */
  public static async getHealth(req: Request, res: Response): Promise<void> {
    try {
      const components: any = {
        database: 'UNKNOWN',
        embeddingProvider: 'UNKNOWN',
        vectorSearch: 'UNKNOWN',
        aiProvider: 'UNKNOWN',
        documentStorage: 'UNKNOWN',
      };

      // 1. Lightweight DB ping
      try {
        await prisma.user.findFirst({ select: { id: true } });
        components.database = 'HEALTHY';
      } catch (dbErr) {
        components.database = 'UNAVAILABLE';
      }

      // 2. Embedding provider config validation
      components.embeddingProvider = ENV.EMBEDDING_DIMENSION === 384 ? 'HEALTHY' : 'DEGRADED';

      // 3. Vector search readiness check
      try {
        await prisma.aIDocumentChunk.count();
        components.vectorSearch = 'HEALTHY';
      } catch (vecErr) {
        components.vectorSearch = 'UNAVAILABLE';
      }

      // 4. AI Provider config readiness check
      const apiKey = process.env.AI_API_KEY || '';
      components.aiProvider = apiKey ? 'HEALTHY' : 'DEGRADED';

      // 5. Document storage readiness
      components.documentStorage = 'HEALTHY';

      // Overall status aggregation
      let overallStatus = 'HEALTHY';
      if (components.database === 'UNAVAILABLE' || components.vectorSearch === 'UNAVAILABLE') {
        overallStatus = 'UNAVAILABLE';
      } else if (
        components.embeddingProvider === 'DEGRADED' ||
        components.aiProvider === 'DEGRADED'
      ) {
        overallStatus = 'DEGRADED';
      }

      res.status(200).json({
        success: true,
        status: overallStatus,
        timestamp: new Date().toISOString(),
        components,
      });
    } catch (err: any) {
      res.status(500).json({
        success: false,
        status: 'UNAVAILABLE',
        error: 'RAG health evaluation failed.',
      });
    }
  }

  /**
   * GET /api/ai/rag/metrics
   * Admin metrics endpoint for dashboard visualization.
   */
  public static async getMetrics(req: Request, res: Response): Promise<void> {
    try {
      const timeframe = (req.query.timeframe as string) || '24h';
      const metrics = await RAGObservabilityService.getAdminMetrics(timeframe);

      res.status(200).json({
        success: true,
        timeframe,
        metrics,
      });
    } catch (err: any) {
      console.error('[RAGAdminController] getMetrics error:', err);
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve RAG performance metrics.',
      });
    }
  }

  /**
   * GET /api/ai/rag/traces
   * Admin endpoint to inspect paginated RAG trace logs.
   */
  public static async getTraces(req: Request, res: Response): Promise<void> {
    try {
      const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;
      const status = req.query.status as any;
      const ragUsed = req.query.ragUsed === 'true' ? true : req.query.ragUsed === 'false' ? false : undefined;
      const userId = req.query.userId as string;
      const startDate = req.query.startDate as string;
      const endDate = req.query.endDate as string;

      const tracesData = await RAGObservabilityService.getAdminTraces({
        page,
        limit,
        status,
        ragUsed,
        userId,
        startDate,
        endDate,
      });

      res.status(200).json({
        success: true,
        ...tracesData,
      });
    } catch (err: any) {
      console.error('[RAGAdminController] getTraces error:', err);
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve RAG trace log list.',
      });
    }
  }
}
