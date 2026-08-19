import { AIResponseValidator } from '../utils/aiResponseValidator';

export interface AIProviderMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface AIProviderResult {
  success: boolean;
  type?: 'SUCCESS' | 'AI_PROVIDER_UNAVAILABLE';
  content?: string;
  message?: string;
}

export class AIProviderService {
  /**
   * Generates AI response using configured LLM Provider (Gemini / OpenAI / Generic HTTP API).
   * Strictly returns success: false with type AI_PROVIDER_UNAVAILABLE if API key or provider is unavailable.
   * NO FAKE LOCAL FALLBACK RESPONSES.
   */
  public static async generateResponse(
    systemPrompt: string,
    history: AIProviderMessage[],
    userMessage: string
  ): Promise<AIProviderResult> {
    const provider = (process.env.AI_PROVIDER || 'gemini').toLowerCase();
    const apiKey = process.env.AI_API_KEY || '';
    const model = process.env.AI_MODEL || (provider === 'openai' ? 'gpt-3.5-turbo' : 'gemini-1.5-flash');

    if (!apiKey) {
      return {
        success: false,
        type: 'AI_PROVIDER_UNAVAILABLE',
        message: 'The AI service is currently unavailable. Please try again later.',
      };
    }

    try {
      let rawResponseText = '';
      if (provider === 'gemini') {
        rawResponseText = await this.callGeminiAPI(apiKey, model, systemPrompt, history, userMessage);
      } else if (provider === 'openai') {
        rawResponseText = await this.callOpenAIAPI(apiKey, model, systemPrompt, history, userMessage);
      } else {
        rawResponseText = await this.callGeminiAPI(apiKey, model, systemPrompt, history, userMessage);
      }

      const validatedText = AIResponseValidator.validate(rawResponseText);
      return {
        success: true,
        type: 'SUCCESS',
        content: validatedText,
      };
    } catch (error: any) {
      console.error('[AIProviderService Error]:', error.message || error);
      return {
        success: false,
        type: 'AI_PROVIDER_UNAVAILABLE',
        message: 'The AI service is currently unavailable. Please try again later.',
      };
    }
  }

  private static async callGeminiAPI(
    apiKey: string,
    model: string,
    systemPrompt: string,
    history: AIProviderMessage[],
    userMessage: string
  ): Promise<string> {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

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

    throw new Error('Empty candidate response from Gemini API');
  }

  private static async callOpenAIAPI(
    apiKey: string,
    model: string,
    systemPrompt: string,
    history: AIProviderMessage[],
    userMessage: string
  ): Promise<string> {
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
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model, messages, temperature: 0.7 }),
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
