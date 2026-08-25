import { ENV } from '../../../config/env';
import { AIProviderMessage, AIProviderResult } from './aiProviderService';
import { LLMProvider } from './llmProvider';
import { IEmbeddingProvider } from './embeddingProvider';
import { AIResilience, AIResilienceError } from '../utils/aiResilience';
import { AIResponseValidator } from '../utils/aiResponseValidator';
import { PdfRasterService } from './pdfRasterService';

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
  private visionModel: string;

  constructor(chatModelOverride?: string) {
    this.baseUrl = (ENV.OLLAMA_BASE_URL || process.env.OLLAMA_BASE_URL || 'http://localhost:11434').replace(/\/$/, '');
    this.chatModel = chatModelOverride || ENV.OLLAMA_CHAT_MODEL || process.env.OLLAMA_CHAT_MODEL || 'llama3.2';
    this.embeddingModel = ENV.OLLAMA_EMBEDDING_MODEL || process.env.OLLAMA_EMBEDDING_MODEL || 'all-minilm';
    this.visionModel = process.env.OLLAMA_VISION_MODEL || this.chatModel;
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

    const maxTokens = ENV.OLLAMA_MAX_TOKENS || 256;
    console.log(`[PERF] [OllamaProvider] Request started. Model: ${this.chatModel}, Endpoint: ${this.baseUrl}/api/chat, Timeout: ${timeoutMs}ms, MaxTokens: ${maxTokens}`);
    const startMs = Date.now();

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
            keep_alive: '5m',
            options: {
              temperature: 0.7,
              num_predict: maxTokens,
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
        const elapsedMs = Date.now() - startMs;
        const loadMs = data?.load_duration ? Math.round(data.load_duration / 1e6) : 0;
        const promptEvalMs = data?.prompt_eval_duration ? Math.round(data.prompt_eval_duration / 1e6) : 0;
        const evalMs = data?.eval_duration ? Math.round(data.eval_duration / 1e6) : 0;
        const promptTokens = data?.prompt_eval_count || 0;
        const genTokens = data?.eval_count || 0;
        const genSpeed = evalMs > 0 ? (genTokens / (evalMs / 1000)).toFixed(2) : '0';

        console.log(
          `[PERF] [OllamaProvider] Response received in ${elapsedMs}ms | ` +
          `load_duration: ${loadMs}ms | prompt_eval_duration: ${promptEvalMs}ms (${promptTokens} tokens) | ` +
          `eval_duration: ${evalMs}ms (${genTokens} tokens @ ${genSpeed} tps) | done_reason: ${data?.done_reason || 'stop'}`
        );

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
   * Real-Time Stream LLMProvider method forwarding token chunks progressively.
   */
  public async generateStream(
    systemPrompt: string,
    history: AIProviderMessage[],
    userMessage: string,
    onToken: (token: string) => void,
    options?: { timeoutMs?: number; signal?: AbortSignal }
  ): Promise<{ content: string; evalCount: number; evalDurationMs: number; doneReason: string }> {
    const messages = [
      { role: 'system', content: systemPrompt },
      ...history.map((h) => ({
        role: h.role === 'assistant' ? 'assistant' : 'user',
        content: h.content,
      })),
      { role: 'user', content: userMessage },
    ];

    const maxTokens = ENV.OLLAMA_MAX_TOKENS || 384;
    const endpoint = `${this.baseUrl}/api/chat`;

    console.log(`[PERF] [OllamaProvider.generateStream] Stream started. Model: ${this.chatModel}, MaxTokens: ${maxTokens}`);

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.chatModel,
        messages,
        stream: true,
        keep_alive: '5m',
        options: {
          temperature: 0.7,
          num_predict: maxTokens,
        },
      }),
      signal: options?.signal,
    });

    if (!response.ok || !response.body) {
      const errBody = await response.text().catch(() => '');
      throw new Error(`Ollama stream API error HTTP ${response.status}: ${errBody}`);
    }

    const reader = (response.body as any).getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let fullContent = '';
    let evalCount = 0;
    let evalDurationMs = 0;
    let doneReason = 'stop';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        try {
          const json = JSON.parse(trimmed);
          const chunkText = json.message?.content || '';
          if (chunkText) {
            fullContent += chunkText;
            onToken(chunkText);
          }

          if (json.done) {
            evalCount = json.eval_count || 0;
            evalDurationMs = json.eval_duration ? Math.round(json.eval_duration / 1e6) : 0;
            doneReason = json.done_reason || 'stop';
          }
        } catch (e) {
          // Ignore partial line parse errors
        }
      }
    }

    if (buffer.trim()) {
      try {
        const json = JSON.parse(buffer.trim());
        const chunkText = json.message?.content || '';
        if (chunkText) {
          fullContent += chunkText;
          onToken(chunkText);
        }
      } catch (e) {}
    }

    return { content: fullContent, evalCount, evalDurationMs, doneReason };
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

  public static embeddingCache = new Map<string, number[]>();

  public async generateEmbedding(text: string): Promise<number[]> {
    const expectedDimension = ENV.EMBEDDING_DIMENSION || 384;
    const startMs = Date.now();

    return await AIResilience.executeWithResilience(
      async (signal) => {
        const endpoint = `${this.baseUrl}/api/embeddings`;
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: this.embeddingModel,
            prompt: text,
            keep_alive: '5m',
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
        const elapsedMs = Date.now() - startMs;
        console.log(`[OllamaProvider] Embedding completed in ${elapsedMs}ms for model '${this.embeddingModel}'`);

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
   * Ollama's /api/chat accepts inline base64 images per message, not a raw PDF — each page is
   * rasterized to a PNG first via PdfRasterService (same approach GroqProvider uses), then sent
   * as a multi-image vision request to the configured local vision model (OLLAMA_VISION_MODEL,
   * defaults to the chat model). This runs entirely on local hardware: no per-minute/per-day
   * token quota to exhaust, at the cost of depending on local compute for speed/throughput.
   */
  public async generateWithFile(
    systemPrompt: string,
    userPrompt: string,
    fileBase64: string,
    mimeType: string,
    onTiming?: (t: { rasterMs: number; requestMs: number }) => void
  ): Promise<string> {
    if (mimeType !== 'application/pdf') {
      throw new Error(`NOT_SUPPORTED: OllamaProvider.generateWithFile only supports application/pdf, got ${mimeType}.`);
    }

    const pdfBuffer = Buffer.from(fileBase64, 'base64');
    const pageCount = await PdfRasterService.getPageCountFromBuffer(pdfBuffer);

    const rasterStart = Date.now();
    const images = await PdfRasterService.renderPageRangeToImages(pdfBuffer, 1, pageCount, 1.5);
    const rasterMs = Date.now() - rasterStart;

    const timeoutMs = parseInt(process.env.OLLAMA_VISION_TIMEOUT_MS || '', 10) || 180000;
    const requestStart = Date.now();

    const result = await AIResilience.executeWithResilience(
      async (signal) => {
        const endpoint = `${this.baseUrl}/api/chat`;
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: this.visionModel,
            stream: false,
            messages: [
              {
                role: 'user',
                content: `${systemPrompt}\n\n${userPrompt}`,
                images: images.map((img) => img.toString('base64')),
              },
            ],
          }),
          signal,
        });

        if (!response.ok) {
          const errBody = await response.text().catch(() => '');
          const status = response.status;

          if (status === 404) {
            throw new AIResilienceError(
              `Ollama Vision Model Not Found (HTTP 404): Model '${this.visionModel}' is not installed locally. Run 'ollama pull ${this.visionModel}'. (${errBody})`,
              'NON_RETRYABLE_ERROR',
              404
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

        throw new Error('Empty or invalid content returned from Ollama vision chat API.');
      },
      {
        operationName: 'OllamaProvider.generateWithFile',
        timeoutMs,
        // No API quota to wait out on a retry, so keep attempts low — a failure here is far more
        // likely to be a real error (model not installed, malformed request) than a transient one.
        maxRetries: 2,
        initialDelayMs: 3000,
        maxDelayMs: 15000,
      }
    );

    onTiming?.({ rasterMs, requestMs: Date.now() - requestStart });
    return result;
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
