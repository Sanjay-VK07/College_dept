import api from '@/lib/api';

export interface AIMessage {
  id: string;
  role: 'USER' | 'ASSISTANT';
  content: string;
  createdAt: string;
  sources?: Array<{ documentId: string; title: string }>;
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
  sources?: Array<{ documentId: string; title: string }>;
  error?: string;
}

export interface AIFeedbackPayload {
  rating: 'HELPFUL' | 'NOT_HELPFUL';
  category?: 'INCORRECT' | 'NOT_RELEVANT' | 'INSUFFICIENT_CONTEXT' | 'GOOD_ANSWER' | 'OTHER';
  comment?: string;
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
   * Submits or updates feedback on an ASSISTANT message
   */
  async submitFeedback(messageId: string, feedback: AIFeedbackPayload) {
    const res = await api.post(`/ai/messages/${messageId}/feedback`, feedback);
    return res.data;
  },

  /**
   * Fetches user's active feedback for a specific message
   */
  async getFeedback(messageId: string) {
    const res = await api.get(`/ai/messages/${messageId}/feedback`);
    return res.data;
  },

  /**
   * Admin RAG Observability & Monitoring APIs
   */
  async getRagHealth() {
    const res = await api.get('/ai/rag/health');
    return res.data;
  },

  async getRagMetrics(timeframe: string = '24h') {
    const res = await api.get('/ai/rag/metrics', { params: { timeframe } });
    return res.data;
  },

  async getRagTraces(params?: { page?: number; limit?: number; status?: string; ragUsed?: boolean }) {
    const res = await api.get('/ai/rag/traces', { params });
    return res.data;
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

  /**
   * AI Question Generation & Faculty Review APIs
   */
  async generateQuestions(params: {
    subjectId?: string;
    moduleId?: string;
    topicId?: string;
    subtopicId?: string;
    questionType?: string;
    difficulty?: string;
    count?: number;
    documentId?: string;
    generationRequestId?: string;
  }) {
    const res = await api.post('/ai/questions/generate', params);
    return res.data;
  },

  async getPendingQuestions(params?: { status?: string; page?: number; limit?: number }) {
    const res = await api.get('/ai/questions/pending', { params });
    return res.data;
  },

  async approveQuestion(questionId: string) {
    const res = await api.post(`/ai/questions/${questionId}/approve`);
    return res.data;
  },

  async rejectQuestion(questionId: string) {
    const res = await api.post(`/ai/questions/${questionId}/reject`);
    return res.data;
  },

  async editQuestion(questionId: string, data: any) {
    const res = await api.put(`/ai/questions/${questionId}`, data);
    return res.data;
  },

  /**
   * AI Solution Generation & Verification APIs
   */
  async generateSolution(params: { questionId: string; generationRequestId: string }) {
    const res = await api.post('/ai/solutions/generate', params);
    return res.data;
  },

  async getPendingSolutions(params?: { status?: string }) {
    const res = await api.get('/ai/solutions/pending', { params });
    return res.data;
  },

  async approveSolution(solutionId: string) {
    const res = await api.post(`/ai/solutions/${solutionId}/approve`);
    return res.data;
  },

  async rejectSolution(solutionId: string) {
    const res = await api.post(`/ai/solutions/${solutionId}/reject`);
    return res.data;
  },

  /**
   * AI Intelligent Exam Assembly APIs
   */
  async assembleExam(params: {
    examGenerationRequestId: string;
    title: string;
    description?: string;
    subjectId?: string;
    moduleIds?: string[];
    topicIds?: string[];
    questionTypes?: string[];
    difficultyDistribution?: { EASY?: number; MEDIUM?: number; HARD?: number };
    questionCount?: number;
    targetDepartment?: string;
    durationMinutes?: number;
  }) {
    const res = await api.post('/ai/exams/generate', params);
    return res.data;
  },

  async approveExamDraft(mockTestId: string) {
    const res = await api.post(`/ai/exams/${mockTestId}/approve`);
    return res.data;
  },

  /**
   * AI Faculty & Examination Intelligence APIs
   */
  async getFacultyIntelligenceOverview() {
    const res = await api.get('/ai/intelligence/overview');
    return res.data;
  },

  async getQuestionIntelligence(questionId: string) {
    const res = await api.get(`/ai/intelligence/questions/${questionId}`);
    return res.data;
  },

  async getExamIntelligence(examId: string) {
    const res = await api.get(`/ai/intelligence/exams/${examId}`);
    return res.data;
  },

  async getCohortIntelligence(department?: string) {
    const res = await api.get('/ai/intelligence/cohort', { params: { department } });
    return res.data;
  },

  /**
   * AI Governance, Cost Control & Operations APIs
   */
  async getGovernanceOverview() {
    const res = await api.get('/ai/governance/overview');
    return res.data;
  },

  async setCircuitBreaker(open: boolean) {
    const res = await api.post('/ai/governance/circuit-breaker', { open });
    return res.data;
  },

  async getModelEvaluation() {
    const res = await api.get('/ai/governance/evaluation');
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
};
