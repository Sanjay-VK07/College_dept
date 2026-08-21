import { AIProviderMessage } from './aiProviderService';

export interface LLMProvider {
  generate(systemPrompt: string, history: AIProviderMessage[], userMessage: string): Promise<string>;
}

export class GeminiProvider implements LLMProvider {
  private apiKey: string;
  private model: string;

  constructor() {
    this.apiKey = process.env.GEMINI_API_KEY || process.env.AI_API_KEY || '';
    this.model = process.env.AI_MODEL || 'gemini-1.5-flash';
  }

  public async generate(systemPrompt: string, history: AIProviderMessage[], userMessage: string): Promise<string> {
    if (!this.apiKey) {
      throw new Error('AI_PROVIDER_UNAVAILABLE: Gemini API key is not configured.');
    }

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
    });

    if (!response.ok) {
      throw new Error(`Gemini API returned HTTP status ${response.status}`);
    }

    const data: any = await response.json();
    const candidates = data?.candidates;
    if (candidates && candidates.length > 0) {
      const text = candidates[0].content?.parts?.[0]?.text;
      if (text) return text;
    }

    throw new Error('Empty response candidate from Gemini API');
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
    });

    if (!response.ok) {
      throw new Error(`OpenAI API returned HTTP status ${response.status}`);
    }

    const data: any = await response.json();
    const choices = data?.choices;
    if (choices && choices.length > 0) {
      const text = choices[0].message?.content;
      if (text) return text;
    }

    throw new Error('Empty choice response from OpenAI API');
  }
}

export class LocalLLMProvider implements LLMProvider {
  public async generate(systemPrompt: string, history: AIProviderMessage[], userMessage: string): Promise<string> {
    // Return clear configuration state when no real provider is available.
    return 'AI service is not configured.';
  }
}

export class LLMFactory {
  public static getProvider(): LLMProvider {
    const provider = (process.env.LLM_PROVIDER || process.env.AI_PROVIDER || 'local').toLowerCase();
    
    if (provider === 'gemini') {
      return new GeminiProvider();
    }
    if (provider === 'openai') {
      return new OpenAIProvider();
    }
    return new LocalLLMProvider();
  }
}
