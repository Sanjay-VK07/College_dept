import { AIProviderMessage } from './aiProviderService';
import { AIResilience } from '../utils/aiResilience';
import { PdfRasterService } from './pdfRasterService';

export interface LLMProvider {
  generate(systemPrompt: string, history: AIProviderMessage[], userMessage: string): Promise<string>;
  /**
   * Sends a file (e.g. a PDF) directly to the model alongside a text prompt, for vision-based
   * extraction (reads scanned/image pages the same as pages with a normal text layer). Not every
   * provider supports this the same way (OpenAI's chat-completions API would need pages
   * rasterized into images first, a separate lift) — providers without a real implementation
   * throw a clear NOT_SUPPORTED error rather than silently degrading.
   */
  generateWithFile(systemPrompt: string, userPrompt: string, fileBase64: string, mimeType: string): Promise<string>;
}

export class GeminiProvider implements LLMProvider {
  private apiKey: string;
  private model: string;

  /** @param modelOverride e.g. AI_MODEL_STRONG for harder verification tasks; defaults to the fast model used for routine extraction/generation. */
  constructor(modelOverride?: string) {
    this.apiKey = process.env.GEMINI_API_KEY || process.env.AI_API_KEY || '';
    this.model = modelOverride || process.env.AI_MODEL_FAST || process.env.AI_MODEL || 'gemini-3.6-flash';
  }

  public async generate(systemPrompt: string, history: AIProviderMessage[], userMessage: string): Promise<string> {
    if (!this.apiKey) {
      throw new Error('AI_PROVIDER_UNAVAILABLE: Gemini API key is not configured.');
    }

    return await AIResilience.executeWithResilience(
      async (signal) => {
        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;
        const contents = [
          {
            role: 'user',
            parts: [{ text: `SYSTEM INSTRUCTIONS:\n${systemPrompt}` }],
          },
          ...history.map((h) => ({
            role: h.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: h.content }],
          })),
          {
            role: 'user',
            parts: [{ text: userMessage }],
          },
        ];

        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents }),
          signal,
        });

        if (!response.ok) {
          const err: any = new Error(`Gemini API returned HTTP status ${response.status}`);
          err.status = response.status;
          throw err;
        }

        const data: any = await response.json();
        const candidates = data?.candidates;
        if (candidates && candidates.length > 0) {
          const text = candidates[0].content?.parts?.[0]?.text;
          if (text) return text;
        }

        throw new Error('Empty response candidate from Gemini API');
      },
      { operationName: 'GeminiProvider.generate' }
    );
  }

  /**
   * Sends a file (e.g. a PDF) directly to Gemini alongside a text prompt. Gemini rasterizes
   * and vision-processes the file's pages internally, so this works for scanned/image-only
   * pages the same as it does for pages with a normal text layer — unlike pdf-parse, which
   * can only read an embedded text layer and returns nothing for scanned pages.
   */
  public async generateWithFile(
    systemPrompt: string,
    userPrompt: string,
    fileBase64: string,
    mimeType: string
  ): Promise<string> {
    if (!this.apiKey) {
      throw new Error('AI_PROVIDER_UNAVAILABLE: Gemini API key is not configured.');
    }

    return await AIResilience.executeWithResilience(
      async (signal) => {
        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;
        const contents = [
          {
            role: 'user',
            parts: [
              { text: `SYSTEM INSTRUCTIONS:\n${systemPrompt}\n\n${userPrompt}` },
              { inline_data: { mime_type: mimeType, data: fileBase64 } },
            ],
          },
        ];

        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents }),
          signal,
        });

        if (!response.ok) {
          const errBody = await response.text().catch(() => '');
          const err: any = new Error(`Gemini API returned HTTP status ${response.status}${errBody ? `: ${errBody}` : ''}`);
          err.status = response.status;
          throw err;
        }

        const data: any = await response.json();
        const candidates = data?.candidates;
        if (candidates && candidates.length > 0) {
          const text = candidates[0].content?.parts?.[0]?.text;
          if (text) return text;

          const finishReason = candidates[0].finishReason;
          if (finishReason && finishReason !== 'STOP') {
            const detail = candidates[0].finishMessage || finishReason;
            // Not retryable — the model actively declined this content, retrying won't help.
            throw new Error(
              finishReason === 'RECITATION'
                ? `Gemini declined to process this file because its content resembles existing copyrighted material (e.g. an official published exam paper). This typically does not happen with original/institution-authored question sets. (${detail})`
                : `Gemini returned no content (finishReason: ${finishReason}): ${detail}`
            );
          }
        }

        throw new Error('Empty response candidate from Gemini API');
      },
      // Vision extraction over a multi-page PDF routinely takes 60-90s — well past the default
      // 30s AI_PROVIDER_TIMEOUT_MS used for regular text chat, so this needs its own longer budget.
      // maxRetries/delay bumped well above the generic default: sequentially processing many
      // page-batches of a large PDF has been observed to trip Gemini's own per-minute rate limit
      // (HTTP 429), which needs a genuinely long wait (its quota window), not a quick 2-3s retry.
      { operationName: 'GeminiProvider.generateWithFile', timeoutMs: 120000, maxRetries: 4, initialDelayMs: 8000, maxDelayMs: 65000 }
    );
  }
}

export class GroqProvider implements LLMProvider {
  private apiKey: string;
  private model: string;
  private visionModel: string;

  constructor() {
    this.apiKey = process.env.GROQ_API_KEY || '';
    this.model = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';
    this.visionModel = process.env.GROQ_VISION_MODEL || 'qwen/qwen3.6-27b';
  }

  public async generate(systemPrompt: string, history: AIProviderMessage[], userMessage: string): Promise<string> {
    if (!this.apiKey) {
      throw new Error('AI_PROVIDER_UNAVAILABLE: Groq API key is not configured.');
    }

    return await AIResilience.executeWithResilience(
      async (signal) => {
        const messages = [
          { role: 'system', content: systemPrompt },
          ...history.map((h) => ({ role: h.role === 'assistant' ? 'assistant' : 'user', content: h.content })),
          { role: 'user', content: userMessage },
        ];

        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: this.model, messages, reasoning_effort: 'none' }),
          signal,
        });

        if (!response.ok) {
          const errBody = await response.text().catch(() => '');
          const err: any = new Error(`Groq API returned HTTP status ${response.status}${errBody ? `: ${errBody}` : ''}`);
          err.status = response.status;
          throw err;
        }

        const data: any = await response.json();
        const text = data?.choices?.[0]?.message?.content;
        if (text) return text;

        throw new Error('Empty choice response from Groq API');
      },
      { operationName: 'GroqProvider.generate' }
    );
  }

  /**
   * Groq's chat-completions API doesn't accept a raw PDF the way Gemini's inline_data does —
   * only inline images. Each page in the given file is rasterized to a PNG (see
   * pdfRasterService.ts, pure JS + prebuilt native canvas bindings, no system Poppler/Ghostscript
   * dependency) and sent as a multi-image vision request. The qwen3.6 vision model caps requests
   * at 3 images (confirmed via the live API's own rejection, not its — inaccurate — public docs),
   * so this throws rather than silently truncating if a caller sends more than that — callers
   * processing large PDFs must keep their page batches at 3 pages or fewer when using this
   * provider (see documentStructureService.ts).
   */
  public async generateWithFile(
    systemPrompt: string,
    userPrompt: string,
    fileBase64: string,
    mimeType: string
  ): Promise<string> {
    if (!this.apiKey) {
      throw new Error('AI_PROVIDER_UNAVAILABLE: Groq API key is not configured.');
    }
    if (mimeType !== 'application/pdf') {
      throw new Error(`NOT_SUPPORTED: GroqProvider.generateWithFile only supports application/pdf, got ${mimeType}.`);
    }

    const pdfBuffer = Buffer.from(fileBase64, 'base64');
    const pageCount = await PdfRasterService.getPageCountFromBuffer(pdfBuffer);
    if (pageCount > 3) {
      throw new Error(
        `NOT_SUPPORTED: GroqProvider can process at most 3 pages per request (the qwen3.6 vision model's actual image-per-request limit — its public docs state 5, but the live API rejects more than 3); this file has ${pageCount}. The caller must split into smaller page batches.`
      );
    }

    // Lower render scale than the 2.0 default — vision tokens scale with pixel area, and a
    // full-resolution page image alone can approach Groq's 8,000-tokens-per-minute budget.
    // 1.3 still renders clean, readable text for OCR-quality extraction at a fraction of the cost.
    const images = await PdfRasterService.renderPageRangeToImages(pdfBuffer, 1, pageCount, 1.3);

    return await AIResilience.executeWithResilience(
      async (signal) => {
        const content: any[] = [{ type: 'text', text: `${systemPrompt}\n\n${userPrompt}` }];
        for (const img of images) {
          content.push({ type: 'image_url', image_url: { url: `data:image/png;base64,${img.toString('base64')}` } });
        }

        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: this.visionModel,
            reasoning_effort: 'none',
            messages: [{ role: 'user', content }],
          }),
          signal,
        });

        if (!response.ok) {
          const errBody = await response.text().catch(() => '');
          const err: any = new Error(`Groq API returned HTTP status ${response.status}${errBody ? `: ${errBody}` : ''}`);
          err.status = response.status;
          throw err;
        }

        const data: any = await response.json();
        const text = data?.choices?.[0]?.message?.content;
        if (text) return text;

        throw new Error('Empty choice response from Groq API');
      },
      { operationName: 'GroqProvider.generateWithFile', timeoutMs: 60000, maxRetries: 3, initialDelayMs: 3000, maxDelayMs: 30000 }
    );
  }
}

export class OpenAIProvider implements LLMProvider {
  private apiKey: string;
  private model: string;

  constructor() {
    this.apiKey = process.env.OPENAI_API_KEY || '';
    this.model = process.env.AI_MODEL || 'gpt-3.5-turbo';
  }

  public async generate(systemPrompt: string, history: AIProviderMessage[], userMessage: string): Promise<string> {
    if (!this.apiKey) {
      throw new Error('AI_PROVIDER_UNAVAILABLE: OpenAI API key is not configured.');
    }

    return await AIResilience.executeWithResilience(
      async (signal) => {
        const endpoint = 'https://api.openai.com/v1/chat/completions';
        const messages = [
          { role: 'system', content: systemPrompt },
          ...history.map((h) => ({
            role: h.role === 'assistant' ? 'assistant' : 'user',
            content: h.content,
          })),
          { role: 'user', content: userMessage },
        ];

        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ model: this.model, messages, temperature: 0.7 }),
          signal,
        });

        if (!response.ok) {
          const err: any = new Error(`OpenAI API returned HTTP status ${response.status}`);
          err.status = response.status;
          throw err;
        }

        const data: any = await response.json();
        const choices = data?.choices;
        if (choices && choices.length > 0) {
          const text = choices[0].message?.content;
          if (text) return text;
        }

        throw new Error('Empty choice response from OpenAI API');
      },
      { operationName: 'OpenAIProvider.generate' }
    );
  }

  public async generateWithFile(): Promise<string> {
    // OpenAI's chat-completions API doesn't accept a raw PDF the way Gemini does — it would need
    // each page rasterized to an image first. Not implemented yet; fail loudly rather than
    // silently falling back to a provider that can't actually do vision-grounded extraction.
    throw new Error('NOT_SUPPORTED: OpenAIProvider does not implement file-based generation yet. Configure LLM_PROVIDER=gemini for document vision extraction.');
  }
}

export class LocalLLMProvider implements LLMProvider {
  public async generate(systemPrompt: string, history: AIProviderMessage[], userMessage: string): Promise<string> {
    return 'AI service is not configured.';
  }

  public async generateWithFile(): Promise<string> {
    throw new Error('AI_PROVIDER_UNAVAILABLE: No AI provider is configured (set LLM_PROVIDER=gemini and GEMINI_API_KEY).');
  }
}

export class LLMFactory {
  public static getProvider(): LLMProvider {
    const provider = (process.env.LLM_PROVIDER || process.env.AI_PROVIDER || 'local').toLowerCase();

    if (provider === 'gemini') {
      return new GeminiProvider();
    }
    if (provider === 'groq') {
      return new GroqProvider();
    }
    if (provider === 'openai') {
      return new OpenAIProvider();
    }
    return new LocalLLMProvider();
  }
}
