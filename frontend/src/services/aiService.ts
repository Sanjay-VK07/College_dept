import api from '@/lib/api';

export interface AIMessage {
  id: string;
  role: 'USER' | 'ASSISTANT';
  content: string;
  createdAt: string;
}

export interface AIConversationSummary {
  id: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
  lastMessage?: string;
}

export interface ChatResponse {
  success: boolean;
  type?: string;
  conversationId?: string;
  title?: string;
  message?: AIMessage;
  error?: string;
}

export const aiService = {
  /**
   * Sends a message to the AI Assistant backend with requestId idempotency protection
   */
  async sendMessage(message: string, conversationId?: string, requestId?: string): Promise<ChatResponse> {
    const reqId = requestId || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'req-' + Date.now());
    const res = await api.post('/ai/chat', { message, conversationId, requestId: reqId });
    if (res.data?.success === false) {
      return {
        success: false,
        type: res.data.type || 'AI_PROVIDER_UNAVAILABLE',
        error: res.data.message || 'The AI service is currently unavailable. Please try again later.',
      };
    }
    return res.data.data;
  },

  /**
   * Fetches all conversations belonging to the current user
   */
  async getConversations(): Promise<AIConversationSummary[]> {
    const res = await api.get('/ai/conversations');
    return res.data.data;
  },

  /**
   * Fetches a specific conversation with full message history
   */
  async getConversation(conversationId: string): Promise<{ id: string; title: string; messages: AIMessage[] }> {
    const res = await api.get(`/ai/conversations/${conversationId}`);
    return res.data.data;
  },

  /**
   * Deletes a conversation
   */
  async deleteConversation(conversationId: string): Promise<void> {
    await api.delete(`/ai/conversations/${conversationId}`);
  },
};
