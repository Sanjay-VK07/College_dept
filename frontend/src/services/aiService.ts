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
  answer?: string;
  sources?: any[];
  messageId?: string;
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

  /**
   * RAG Knowledge Base API Methods
   */
  async uploadDocument(file: File, title: string, visibility: string = 'STUDENT') {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('title', title);
    formData.append('visibility', visibility);

    const res = await api.post('/ai/documents/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data;
  },

  async getDocuments(status?: string) {
    const res = await api.get('/ai/documents', { params: { status } });
    return res.data;
  },

  async getDocumentStatus(documentId: string) {
    const res = await api.get(`/ai/documents/${documentId}/status`);
    return res.data;
  },

  async retryDocument(documentId: string, file?: File) {
    const formData = new FormData();
    if (file) {
      formData.append('file', file);
    }
    const res = await api.post(`/ai/documents/${documentId}/retry`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data;
  },

  async deleteDocument(documentId: string) {
    const res = await api.delete(`/ai/documents/${documentId}`);
    return res.data;
  },

  async searchKnowledge(query: string, limit: number = 5) {
    const res = await api.post('/ai/search', { query, limit });
    return res.data;
  },

  async askQuestion(question: string) {
    const res = await api.post('/ai/ask', { question });
    return res.data;
  },

  async renameConversation(conversationId: string, title: string) {
    const res = await api.post(`/ai/conversations/${conversationId}/rename`, { title });
    return res.data;
  },

  async generateQuestions(payload: {
    subject: string;
    topic: string;
    difficulty: string;
    questionType: string;
    count: number;
    marks: number;
    negativeMarking: number;
    documentIds?: string[];
  }) {
    const res = await api.post('/ai/generate-questions', payload);
    return res.data;
  },

  async saveGeneratedQuestion(question: any) {
    const res = await api.post('/ai/save-generated-question', { question });
    return res.data;
  },

  async generatePracticeSet(payload: {
    subject: string;
    topic: string;
    difficulty: string;
    count: number;
  }) {
    const res = await api.post('/ai/practice', payload);
    return res.data;
  },

  async submitPracticeSet(payload: {
    subject: string;
    topic: string;
    difficulty: string;
    questions: any[];
    answers: string[];
  }) {
    const res = await api.post('/ai/practice/submit', payload);
    return res.data;
  },

  async getPracticeAttempts() {
    const res = await api.get('/ai/practice/attempts');
    return res.data;
  },

  async getPerformanceInsights() {
    const res = await api.get('/ai/performance-insights');
    return res.data;
  },
};

