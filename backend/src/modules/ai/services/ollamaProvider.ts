import { ENV } from '../../../config/env';
import { AIProviderMessage, AIProviderResult } from './aiProviderService';
import { LLMProvider } from './llmProvider';
import { IEmbeddingProvider } from './embeddingProvider';
import { AIResilience, AIResilienceError } from '../utils/aiResilience';
import { AIResponseValidator } from '../utils/aiResponseValidator';

export interface OllamaUsageStats {
  promptEvalCount?: number;
  evalCount?: number;
  totalDurationMs?: number;
  status: 'local' | 'unavailable';
}

export class OllamaProvider implements LLMProvider, IEmbeddingProvider {
  private baseUrl: string;
  private chatModel: string;
  private embeddingModel: string;

  constructor(chatModelOverride?: string) {
    this.baseUrl = (ENV.OLLAMA_BASE_URL || process.env.OLLAMA_BASE_URL || 'http://localhost:11434').replace(/\/$/, '');
    this.chatModel = chatModelOverride || ENV.OLLAMA_CHAT_MODEL || process.env.OLLAMA_CHAT_MODEL || 'llama3.2';
    this.embeddingModel = ENV.OLLAMA_EMBEDDING_MODEL || process.env.OLLAMA_EMBEDDING_MODEL || 'all-minilm';
  }

  /**
   * Primary LLMProvider interface method for generating chat completions via local Ollama server.
   */
  public async generate(
    systemPrompt: string,
    history: AIProviderMessage[],
    userMessage: string,
    options?: { timeoutMs?: number; maxRetries?: number }
  ): Promise<string> {
    const messages = [
      { role: 'system', content: systemPrompt },
      ...history.map((h) => ({
        role: h.role === 'assistant' ? 'assistant' : 'user',
        content: h.content,
      })),
      { role: 'user', content: userMessage },
    ];

    const timeoutMs = options?.timeoutMs || parseInt(process.env.OLLAMA_REQUEST_TIMEOUT_MS || '0', 10) || ENV.OLLAMA_REQUEST_TIMEOUT_MS;
    const maxRetries = options?.maxRetries !== undefined ? options.maxRetries : (process.env.OLLAMA_MAX_RETRIES !== undefined ? parseInt(process.env.OLLAMA_MAX_RETRIES, 10) : ENV.OLLAMA_MAX_RETRIES);

    return await AIResilience.executeWithResilience(
      async (signal) => {
        const endpoint = `${this.baseUrl}/api/chat`;
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: this.chatModel,
            messages,
            stream: false,
            options: {
              temperature: 0.7,
            },
          }),
          signal,
        });

        if (!response.ok) {
          const errBody = await response.text().catch(() => '');
          const status = response.status;
          
          if (status === 404) {
            throw new AIResilienceError(
              `Ollama Model Not Found (HTTP 404): Model '${this.chatModel}' is not installed locally. Run 'ollama pull ${this.chatModel}' to install it. (${errBody})`,
              'NON_RETRYABLE_ERROR',
              404
            );
          }
          if (status === 400) {
            throw new AIResilienceError(
              `Ollama Request Error (HTTP 400): ${errBody || 'Invalid request payload'}`,
              'NON_RETRYABLE_ERROR',
              400
            );
          }

          const err: any = new Error(`Ollama API returned HTTP status ${status}${errBody ? `: ${errBody}` : ''}`);
          err.status = status;
          throw err;
        }

        const data: any = await response.json();
        const content = data?.message?.content;
        if (content && content.trim().length > 0) {
          return content;
        }

        throw new Error('Empty or invalid content returned from Ollama chat API.');
      },
      {
        operationName: 'OllamaProvider.generate',
        timeoutMs,
        maxRetries,
        initialDelayMs: ENV.OLLAMA_INITIAL_RETRY_DELAY_MS,
        maxDelayMs: ENV.OLLAMA_MAX_RETRY_DELAY_MS,
      }
    );
  }

  /**
   * AIProviderService integration wrapper returning standard AIProviderResult object.
   */
  public async generateResponse(
    systemPrompt: string,
    history: AIProviderMessage[],
    userMessage: string
  ): Promise<AIProviderResult> {
    try {
      const rawText = await this.generate(systemPrompt, history, userMessage);
      const validatedText = AIResponseValidator.validate(rawText);
      return {
        success: true,
        type: 'SUCCESS',
        content: validatedText,
      };
    } catch (error: any) {
      console.error('[OllamaProvider Error]:', error.message || error);
      if (error instanceof AIResilienceError && error.code === 'AI_PROVIDER_TIMEOUT') {
        return {
          success: false,
          type: 'AI_PROVIDER_TIMEOUT',
          message: 'AI_PROVIDER_TIMEOUT: Ollama local server did not respond within configured timeout limit.',
        };
      }
      return {
        success: false,
        type: 'AI_PROVIDER_UNAVAILABLE',
        message: error.message || 'The Ollama local AI service is currently unavailable.',
      };
    }
  }

  /**
   * Generates structured output validated against raw JSON parsing + business rules.
   */
  public async generateStructuredResponse<T = any>(
    systemPrompt: string,
    history: AIProviderMessage[],
    userMessage: string
  ): Promise<T> {
    const jsonInstruction = '\n\nIMPORTANT: Respond strictly with valid JSON only. Do not include markdown code block quotes or commentary around the JSON string.';
    const rawText = await this.generate(systemPrompt + jsonInstruction, history, userMessage);
    
    const extractedJson = this.extractJsonString(rawText);
    if (!extractedJson) {
      throw new Error('STRUCTURED_OUTPUT_VALIDATION_FAILED: Response did not contain valid JSON structure.');
    }

    try {
      const parsed = JSON.parse(extractedJson);
      return parsed as T;
    } catch (err: any) {
      throw new Error(`STRUCTURED_OUTPUT_VALIDATION_FAILED: ${err.message}`);
    }
  }

  /**
   * Generates embeddings for input query using Ollama embeddings endpoint (/api/embeddings).
   */
  public async getEmbedding(text: string): Promise<number[]> {
    return await this.generateEmbedding(text);
  }

  public async generateEmbedding(text: string): Promise<number[]> {
    const expectedDimension = ENV.EMBEDDING_DIMENSION || 384;

    return await AIResilience.executeWithResilience(
      async (signal) => {
        const endpoint = `${this.baseUrl}/api/embeddings`;
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: this.embeddingModel,
            prompt: text,
          }),
          signal,
        });

        if (!response.ok) {
          const errBody = await response.text().catch(() => '');
          const status = response.status;
          if (status === 404) {
            throw new AIResilienceError(
              `Ollama Embedding Model Not Found (HTTP 404): Model '${this.embeddingModel}' is not installed locally. Run 'ollama pull ${this.embeddingModel}'.`,
              'NON_RETRYABLE_ERROR',
              404
            );
          }
          throw new Error(`Ollama Embedding API returned HTTP status ${status}: ${errBody}`);
        }

        const data: any = await response.json();
        let vector: number[] | null = data?.embedding || null;

        if (vector && Array.isArray(vector)) {
          this.validateVectorDimension(vector, expectedDimension);
          return vector;
        }

        throw new Error('Invalid or missing embedding array in Ollama response.');
      },
      {
        operationName: 'OllamaProvider.generateEmbedding',
        timeoutMs: ENV.OLLAMA_REQUEST_TIMEOUT_MS,
        maxRetries: ENV.OLLAMA_MAX_RETRIES,
        initialDelayMs: ENV.OLLAMA_INITIAL_RETRY_DELAY_MS,
        maxDelayMs: ENV.OLLAMA_MAX_RETRY_DELAY_MS,
      }
    );
  }

  /**
   * Unsupported file vision extraction fallback for Ollama.
   */
  public async generateWithFile(): Promise<string> {
    throw new Error(
      'NOT_SUPPORTED: OllamaProvider does not support direct inline PDF file processing. Process document pages with PDF rasterization or OCR first.'
    );
  }

  /**
   * Health check verifying local Ollama reachability and installed model availability.
   */
  public async healthCheck(): Promise<{
    ok: boolean;
    serverReachable: boolean;
    chatModelAvailable: boolean;
    embeddingModelAvailable: boolean;
    chatModel: string;
    embeddingModel: string;
    message: string;
  }> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`);
      if (!response.ok) {
        return {
          ok: false,
          serverReachable: false,
          chatModelAvailable: false,
          embeddingModelAvailable: false,
          chatModel: this.chatModel,
          embeddingModel: this.embeddingModel,
          message: `Ollama server at ${this.baseUrl} returned HTTP ${response.status}.`,
        };
      }

      const data: any = await response.json();
      const installedModels: string[] = (data?.models || []).map((m: any) => m.name || '');

      const isModelInstalled = (modelName: string) => {
        return installedModels.some(
          (installed) => installed === modelName || installed.startsWith(`${modelName}:`) || modelName.startsWith(`${installed}:`)
        );
      };

      const chatOk = isModelInstalled(this.chatModel);
      const embedOk = isModelInstalled(this.embeddingModel);

      if (!chatOk) {
        return {
          ok: false,
          serverReachable: true,
          chatModelAvailable: false,
          embeddingModelAvailable: embedOk,
          chatModel: this.chatModel,
          embeddingModel: this.embeddingModel,
          message: `Ollama server reachable, but chat model '${this.chatModel}' is not pulled. Run 'ollama pull ${this.chatModel}'.`,
        };
      }

      if (!embedOk) {
        return {
          ok: false,
          serverReachable: true,
          chatModelAvailable: chatOk,
          embeddingModelAvailable: false,
          chatModel: this.chatModel,
          embeddingModel: this.embeddingModel,
          message: `Ollama server reachable, but embedding model '${this.embeddingModel}' is not pulled. Run 'ollama pull ${this.embeddingModel}'.`,
        };
      }

      return {
        ok: true,
        serverReachable: true,
        chatModelAvailable: true,
        embeddingModelAvailable: true,
        chatModel: this.chatModel,
        embeddingModel: this.embeddingModel,
        message: 'Ollama local inference server and models are fully operational.',
      };
    } catch (err: any) {
      return {
        ok: false,
        serverReachable: false,
        chatModelAvailable: false,
        embeddingModelAvailable: false,
        chatModel: this.chatModel,
        embeddingModel: this.embeddingModel,
        message: `Cannot connect to Ollama local server at ${this.baseUrl}: ${err.message || 'Connection refused'}`,
      };
    }
  }

  /**
   * Helper: Extracts JSON substring from response string.
   */
  private extractJsonString(text: string): string | null {
    if (!text) return null;
    const trimmed = text.trim();

    const codeBlockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (codeBlockMatch && codeBlockMatch[1]) {
      return codeBlockMatch[1].trim();
    }

    const firstBrace = trimmed.indexOf('{');
    const firstBracket = trimmed.indexOf('[');

    if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
      const lastBrace = trimmed.lastIndexOf('}');
      if (lastBrace > firstBrace) {
        return trimmed.substring(firstBrace, lastBrace + 1);
      }
    } else if (firstBracket !== -1) {
      const lastBracket = trimmed.lastIndexOf(']');
      if (lastBracket > firstBracket) {
        return trimmed.substring(firstBracket, lastBracket + 1);
      }
    }

    return null;
  }

  /**
   * Helper: Strictly validates returned vector dimension against system pgvector column dimension.
   */
  private validateVectorDimension(vector: number[], expectedDimension: number): void {
    if (vector.length !== expectedDimension) {
      throw new AIResilienceError(
        `EMBEDDING_DIMENSION_MISMATCH: Ollama embedding model '${this.embeddingModel}' produced vector dimension ${vector.length}, but pgvector / system expects dimension ${expectedDimension}. STOP. Do not mix incompatible vectors. Re-indexing required.`,
        'NON_RETRYABLE_ERROR',
        400
      );
    }
  }
}
