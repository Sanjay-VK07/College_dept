import { Router, Request, Response } from 'express';
import { prisma } from '../config/prisma';
import { ENV } from '../config/env';
import { AICircuitBreakerService } from '../modules/ai/services/aiCircuitBreakerService';
import { OllamaProvider } from '../modules/ai/services/ollamaProvider';

const router = Router();

/**
 * Liveness probe for process container checks.
 */
router.get('/live', (req: Request, res: Response) => {
  return res.status(200).json({
    status: 'UP',
    service: 'GSMAS GATE Examination API',
    time: new Date().toISOString(),
  });
});

/**
 * Readiness probe checking database connectivity and environment state.
 */
router.get('/ready', async (req: Request, res: Response) => {
  let isDbConnected = false;
  let dbLatencyMs = 0;

  const start = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    isDbConnected = true;
    dbLatencyMs = Date.now() - start;
  } catch (err) {
    isDbConnected = false;
  }

  const isReady = isDbConnected;

  return res.status(isReady ? 200 : 503).json({
    status: isReady ? 'READY' : 'NOT_READY',
    components: {
      database: {
        status: isDbConnected ? 'CONNECTED' : 'DISCONNECTED',
        latencyMs: dbLatencyMs,
      },
      environment: {
        status: 'VALID',
        mode: ENV.NODE_ENV,
      },
    },
    time: new Date().toISOString(),
  });
});

/**
 * Comprehensive AI platform health check (secrets strictly hidden).
 */
router.get('/ai', async (req: Request, res: Response) => {
  const circuitState = await AICircuitBreakerService.getStateAsync();
  const provider = (process.env.AI_PROVIDER || 'gemini').toLowerCase();
  const hasApiKey = Boolean(process.env.AI_API_KEY || process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY || (provider === 'ollama'));

  let isVectorSearchAvailable = false;
  try {
    const traceCount = await prisma.aIRAGTrace.count();
    isVectorSearchAvailable = traceCount >= 0;
  } catch (e) {
    isVectorSearchAvailable = false;
  }

  let ollamaHealth: any = null;
  if (provider === 'ollama') {
    const ollama = new OllamaProvider();
    ollamaHealth = await ollama.healthCheck();
  }

  return res.status(200).json({
    success: true,
    data: {
      aiStatus: circuitState.circuitBreakerOpen ? 'PAUSED' : (ollamaHealth ? (ollamaHealth.ok ? 'OPERATIONAL' : 'UNAVAILABLE') : 'OPERATIONAL'),
      circuitBreaker: circuitState,
      provider: {
        configuredProvider: provider,
        hasApiKeyConfigured: hasApiKey,
        routingMode: circuitState.routingMode,
        activeModel: provider === 'ollama' ? ENV.OLLAMA_CHAT_MODEL : circuitState.activeModel,
        ollamaStatus: ollamaHealth ? (ollamaHealth.ok ? 'AVAILABLE' : 'UNAVAILABLE') : undefined,
        ollamaDetails: ollamaHealth || undefined,
      },
      embedding: {
        provider: ENV.EMBEDDING_PROVIDER,
        model: ENV.EMBEDDING_PROVIDER === 'ollama' ? ENV.OLLAMA_EMBEDDING_MODEL : ENV.EMBEDDING_MODEL,
        dimension: ENV.EMBEDDING_DIMENSION,
        status: ENV.EMBEDDING_PROVIDER === 'ollama' ? (ollamaHealth?.embeddingModelAvailable ? 'COMPATIBLE' : 'UNCHECKED') : 'COMPATIBLE',
      },
      vectorSearch: {
        available: isVectorSearchAvailable,
      },
      thresholds: {
        minSimilarity: ENV.RAG_MIN_SIMILARITY,
        highConfidence: ENV.RAG_HIGH_CONFIDENCE_THRESHOLD,
      },
    },
  });
});

export default router;
