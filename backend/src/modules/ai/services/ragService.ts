import { Role, AIRAGDecision, AIRAGQualityClassification } from '@prisma/client';
import { EmbeddingProvider } from './embeddingProvider';
import { VectorSearchService } from './vectorSearchService';
import { RAGEvaluationService, EvaluationResult, RetrievedChunk } from './ragEvaluationService';
import { performance } from 'perf_hooks';

export interface RAGOrchestrationResult {
  ragDecision: AIRAGDecision;
  ragUsed: boolean;
  contextText: string;
  sources: Array<{ documentId: string; title: string }>;
  evaluation: EvaluationResult;
  embeddingDurationMs: number;
  vectorSearchDurationMs: number;
  contextAssemblyDurationMs: number;
  fallbackReason?: string;
  errorCode?: string;
}

export class RAGService {
  /**
   * Orchestrates full RAG Pipeline: query embedding -> vector search -> quality evaluation -> provenance validation.
   */
  public static async executeRAGPipeline(params: {
    userMessage: string;
    userId: string;
    role: Role;
  }): Promise<RAGOrchestrationResult> {
    const { userMessage, userId, role } = params;

    let embeddingDurationMs = 0;
    let vectorSearchDurationMs = 0;
    let contextAssemblyDurationMs = 0;

    // 1. Generate Query Embedding
    let embedding: number[] = [];
    try {
      const embedRes = await EmbeddingProvider.generateQueryEmbedding(userMessage);
      embedding = embedRes.embedding;
      embeddingDurationMs = embedRes.durationMs;
    } catch (embedErr: any) {
      console.error('[RAGService] Query embedding failed:', embedErr.message);
      const evalEmpty = RAGEvaluationService.evaluateRetrieval({ chunks: [], retrievalError: embedErr });
      return {
        ragDecision: AIRAGDecision.FAILED,
        ragUsed: false,
        contextText: '',
        sources: [],
        evaluation: evalEmpty,
        embeddingDurationMs,
        vectorSearchDurationMs: 0,
        contextAssemblyDurationMs: 0,
        fallbackReason: 'EMBEDDING_FAILED',
        errorCode: 'EMBEDDING_FAILED',
      };
    }

    // 2. Perform Vector Search over authorized chunks
    let searchChunks: RetrievedChunk[] = [];
    let authorizedChunksFound = 0;
    try {
      const searchRes = await VectorSearchService.searchAuthorizedChunks({
        queryEmbedding: embedding,
        userId,
        role,
        topK: 5,
      });
      searchChunks = searchRes.chunks;
      authorizedChunksFound = searchRes.authorizedChunksFound;
      vectorSearchDurationMs = searchRes.durationMs;
    } catch (searchErr: any) {
      console.error('[RAGService] Vector search failed:', searchErr.message);
      const evalEmpty = RAGEvaluationService.evaluateRetrieval({ chunks: [], retrievalError: searchErr });
      return {
        ragDecision: AIRAGDecision.FAILED,
        ragUsed: false,
        contextText: '',
        sources: [],
        evaluation: evalEmpty,
        embeddingDurationMs,
        vectorSearchDurationMs,
        contextAssemblyDurationMs: 0,
        fallbackReason: 'VECTOR_SEARCH_FAILED',
        errorCode: 'VECTOR_SEARCH_FAILED',
      };
    }

    // 3. Evaluate Retrieval Quality
    const evaluation = RAGEvaluationService.evaluateRetrieval({ chunks: searchChunks });

    // Handle NO_RELEVANT_CONTEXT
    if (
      evaluation.qualityClassification === AIRAGQualityClassification.NO_RELEVANT_CONTEXT ||
      evaluation.validatedChunks.length === 0
    ) {
      return {
        ragDecision: AIRAGDecision.RETRIEVAL_NO_RELEVANT,
        ragUsed: false,
        contextText: '',
        sources: [],
        evaluation,
        embeddingDurationMs,
        vectorSearchDurationMs,
        contextAssemblyDurationMs: 0,
        fallbackReason: 'NO_RELEVANT_CONTEXT',
      };
    }

    // 4. Assemble Context & Perform Provenance Validation
    const assemblyStart = performance.now();
    let contextText = '';
    let sources: Array<{ documentId: string; title: string }> = [];

    try {
      contextText = evaluation.validatedChunks
        .map(
          (c, idx) =>
            `[DOCUMENT SOURCE ${idx + 1}: ${c.documentTitle} (Doc ID: ${c.documentId})]\n${c.content}`
        )
        .join('\n\n');

      sources = RAGEvaluationService.validateCitationProvenance({
        userId,
        role,
        retrievedChunks: searchChunks,
        assembledContextChunks: evaluation.validatedChunks,
      });

      contextAssemblyDurationMs = Math.round(performance.now() - assemblyStart);
    } catch (assemblyErr: any) {
      console.error('[RAGService] Context assembly failed:', assemblyErr.message);
      return {
        ragDecision: AIRAGDecision.FAILED,
        ragUsed: false,
        contextText: '',
        sources: [],
        evaluation,
        embeddingDurationMs,
        vectorSearchDurationMs,
        contextAssemblyDurationMs: Math.round(performance.now() - assemblyStart),
        fallbackReason: 'CONTEXT_ASSEMBLY_FAILED',
        errorCode: 'CONTEXT_ASSEMBLY_FAILED',
      };
    }

    return {
      ragDecision: AIRAGDecision.USED,
      ragUsed: true,
      contextText,
      sources,
      evaluation,
      embeddingDurationMs,
      vectorSearchDurationMs,
      contextAssemblyDurationMs,
    };
  }
}
