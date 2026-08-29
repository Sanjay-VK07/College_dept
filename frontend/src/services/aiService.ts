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
  answer?: string;
  sources?: Array<{ documentId: string; title: string }> | any[];
  messageId?: string;
  error?: string;
}

export interface AIFeedbackPayload {
  rating: 'HELPFUL' | 'NOT_HELPFUL';
  category?: 'INCORRECT' | 'NOT_RELEVANT' | 'INSUFFICIENT_CONTEXT' | 'GOOD_ANSWER' | 'OTHER';
  comment?: string;
}

export interface GenerateQuestionsParams {
  subjectId?: string;
  moduleId?: string;
  topicId?: string;
  subtopicId?: string;
  questionType?: string;
  difficulty?: string;
  count?: number;
  documentId?: string;
  generationRequestId?: string;
  subject?: string;
  topic?: string;
  marks?: number;
  negativeMarking?: number;
  documentIds?: string[];
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
   * Sends a streaming chat message using fetch + SSE reader (POST /api/ai/chat/stream)
   */
  async sendStreamMessage(
    message: string,
    conversationId: string | undefined,
    onStart: (data: { requestId: string; conversationId: string; userMessageId: string }) => void,
    onQueued: (data: { position: number; queueSize: number }) => void,
    onToken: (token: string) => void,
    onDone: (data: { requestId: string; conversationId: string; messageId: string; queueWaitMs?: number; totalDurationMs: number; sources?: any[] }) => void,
    onError: (error: { code: string; message: string }) => void,
    signal?: AbortSignal
  ): Promise<void> {
    const token = typeof window !== 'undefined' ? (localStorage.getItem('gsmas_token') || localStorage.getItem('token') || '') : '';
    const requestId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'req-' + Date.now();

    const response = await fetch('/api/ai/chat/stream', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ message, conversationId, requestId }),
      signal,
    });

    if (!response.ok || !response.body) {
      const errText = await response.text().catch(() => '');
      onError({ code: 'HTTP_ERROR', message: `Server error ${response.status}: ${errText}` });
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split('\n\n');
      buffer = blocks.pop() || '';

      for (const block of blocks) {
        const lines = block.split('\n');
        let event = 'message';
        let dataStr = '';

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            event = line.substring(7).trim();
          } else if (line.startsWith('data: ')) {
            dataStr = line.substring(6).trim();
          }
        }

        if (dataStr) {
          try {
            const data = JSON.parse(dataStr);
            if (event === 'start') {
              onStart(data);
            } else if (event === 'queued') {
              onQueued(data);
            } else if (event === 'token') {
              onToken(data.text);
            } else if (event === 'done') {
              onDone(data);
            } else if (event === 'error') {
              onError(data);
            }
          } catch (e) {
            console.error('Failed to parse SSE data:', dataStr);
          }
        }
      }
    }
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

  async getDocuments(status?: string, limit: number = 100) {
    const res = await api.get('/ai/documents', { params: { status, limit } });
    return res.data;
  },

  /** Subject → Module → Topic → Subtopic tree, used to scope generation to a real taxonomy. */
  async getTaxonomy() {
    const res = await api.get('/questions/taxonomy');
    return res.data;
  },

  /** Real page-by-page structure-extraction progress for one uploaded document. */
  async getDocumentProcessingStatus(documentId: string) {
    const res = await api.get(`/admin/documents/${documentId}/processing-status`);
    return res.data;
  },

  /** Kicks off structure extraction (OCR → question/answer-key detection → mapping). */
  async processDocumentStructure(documentId: string) {
    const res = await api.post(`/admin/documents/${documentId}/process-structure`);
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
   * AI Question Generation (supports RAG/Faculty review & Phase 2D direct generation)
   */
  async generateBatchQuestions(params: {
    totalQuestions: number;
    difficultyDistribution: { EASY: number; MEDIUM: number; HARD: number };
    typeDistribution: { MCQ: number; MSQ: number; NAT: number };
    negativeMarking?: boolean;
    solutionVisibility?: string;
    sourceReferences?: boolean;
    selectedResourceIds?: string[];
    subjectId?: string;
    moduleId?: string;
    topicId?: string;
    subtopicId?: string;
    generationRequestId?: string;
  }) {
    const res = await api.post('/ai/questions/generate-batch', params);
    return res.data;
  },

  async getBatchJobStatus(generationRequestId: string) {
    const res = await api.get(`/ai/questions/batch-status/${generationRequestId}`);
    return res.data;
  },

  async getMinMaxConfigBounds() {
    const res = await api.get('/ai/questions/config/bounds');
    return res.data;
  },

  async updateAdminMaxConfig(maxCount: number) {
    const res = await api.post('/ai/questions/config/max', { maxCount });
    return res.data;
  },

  async getGenerationSettings() {
    const res = await api.get('/ai/questions/config/generation-settings');
    return res.data;
  },

  async updateGenerationSettings(params: { autoPublishVerified?: boolean; maxRegenerationAttempts?: number }) {
    const res = await api.put('/ai/questions/config/generation-settings', params);
    return res.data;
  },

  async updateDocumentClassification(documentId: string, params: { subjectId?: string; moduleId?: string; topicId?: string; subtopicId?: string }) {
    const res = await api.put(`/ai/documents/${documentId}/classification`, params);
    return res.data;
  },

  async generateQuestions(params: GenerateQuestionsParams) {
    if ('generationRequestId' in params || 'subjectId' in params || 'moduleId' in params || !('marks' in params)) {
      const res = await api.post('/ai/questions/generate', params);
      return res.data;
    }
    const res = await api.post('/ai/generate-questions', params);
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

  async renameConversation(conversationId: string, title: string) {
    const res = await api.post(`/ai/conversations/${conversationId}/rename`, { title });
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

  /**
   * Smart Question Paper Builder & Question Bank APIs
   */
  async getQuestionBankSubjects() {
    const res = await api.get('/ai/question-bank/subjects');
    return res.data;
  },

  async getTopicAvailability(subjectId: string) {
    const res = await api.get('/ai/question-bank/topics', { params: { subjectId } });
    return res.data;
  },

  async previewQuestionPaper(payload: {
    subjectId: string;
    selectedTopicIds: string[];
    paperMode: 'TOTAL_COUNT' | 'TOPIC_BLUEPRINT';
    totalQuestions?: number;
    topicBlueprint?: Record<string, number>;
    difficultyDistribution: { EASY: number; MEDIUM: number; HARD: number };
    typeDistribution: { MCQ: number; MSQ: number; NAT: number };
    randomSeed?: number | string;
  }) {
    const res = await api.post('/ai/question-paper/preview', payload);
    return res.data;
  },

  async startShortfallGeneration(payload: any) {
    const res = await api.post('/ai/question-paper/generate', payload);
    return res.data;
  },

  async getShortfallJobStatus(jobId: string) {
    const res = await api.get(`/ai/question-paper/generation/${jobId}`);
    return res.data;
  },

  async regenerateSelection(payload: any) {
    const res = await api.post('/ai/question-paper/regenerate-selection', payload);
    return res.data;
  },

  async finalizeQuestionPaper(payload: {
    title: string;
    description?: string;
    subjectId: string;
    selectedQuestionIds: string[];
    examSettings: {
      targetDepartment?: string;
      durationMinutes?: number;
      totalMarks?: number;
      negativeMarking?: boolean;
      solutionVisibility?: string;
      instructions?: string;
      startTime?: string | Date;
      endTime?: string | Date;
    };
  }) {
    const res = await api.post('/ai/question-paper/finalize', payload);
    return res.data;
  },

  async publishExamination(mockTestId: string) {
    const res = await api.post(`/ai/question-paper/exams/${mockTestId}/publish`);
    return res.data;
  },

  async deleteQuestionBankQuestion(questionId: string) {
    const res = await api.delete(`/ai/question-bank/questions/${questionId}`);
    return res.data;
  },

  async bulkDeleteQuestionBankQuestions(ids: string[]) {
    const res = await api.post('/ai/question-bank/questions/bulk-delete', { ids });
    return res.data;
  },

  async previewJSONLImport(fileContent: string | File) {
    if (typeof fileContent === 'string') {
      const res = await api.post('/ai/question-bank/preview-jsonl', { fileContent });
      return res.data;
    }
    const formData = new FormData();
    formData.append('file', fileContent);
    const res = await api.post('/ai/question-bank/preview-jsonl', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data;
  },

  async importJSONL(
    fileContent: string | File,
    target: { subjectId?: string; subjectName?: string; subjectCode?: string; department?: string; moduleName?: string }
  ) {
    if (typeof fileContent === 'string') {
      const res = await api.post('/ai/question-bank/import-jsonl', { fileContent, ...target });
      return res.data;
    }
    const formData = new FormData();
    formData.append('file', fileContent);
    Object.entries(target).forEach(([k, v]) => {
      if (v) formData.append(k, v);
    });
    const res = await api.post('/ai/question-bank/import-jsonl', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data;
  },

  async searchQuestionBank(params: {
    query?: string;
    topic?: string;
    verificationStatus?: string;
    origin?: string;
    page?: number;
    limit?: number;
  }) {
    const res = await api.get('/ai/question-bank/search', { params });
    return res.data;
  },
};
