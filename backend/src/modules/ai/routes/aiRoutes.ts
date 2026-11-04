import { Router } from 'express';
import multer from 'multer';
import { authenticateJWT, requireRoles, requireExamCreatePermission } from '../../../middlewares/authMiddleware';
import { Role } from '@prisma/client';
import { AIChatController } from '../controllers/aiChatController';
import { RAGAdminController } from '../controllers/ragAdminController';
import { AIQuestionController } from '../controllers/aiQuestionController';
import { AISolutionController } from '../controllers/aiSolutionController';
import { AIExamController } from '../controllers/aiExamController';
import { FacultyIntelligenceController } from '../controllers/facultyIntelligenceController';
import { AIGovernanceController } from '../controllers/aiGovernanceController';
import { AIAssistantController } from '../controllers/aiAssistantController';
import { QuestionPaperController } from '../controllers/questionPaperController';
import documentRoutes from './documentRoutes';
import { createAIRateLimiter } from '../../../middlewares/rateLimiter';
import { ENV } from '../../../config/env';

const router = Router();
const jsonlUpload = multer({ storage: multer.memoryStorage() });

// Configure Feature-Specific Rate Limiters
const chatLimiter = createAIRateLimiter({ maxRequests: ENV.AI_CHAT_RATE_LIMIT, featureName: 'AI Chat' });
const ragLimiter = createAIRateLimiter({ maxRequests: ENV.AI_RAG_RATE_LIMIT, featureName: 'RAG Search' });
const generationLimiter = createAIRateLimiter({ maxRequests: ENV.AI_GENERATION_RATE_LIMIT, featureName: 'AI Generation' });
const adminLimiter = createAIRateLimiter({ maxRequests: ENV.AI_ADMIN_RATE_LIMIT, featureName: 'AI Admin' });
// Job-status polling is a cheap DB read, not an AI call — it must not share the same tight
// per-minute budget as actual generation-triggering requests, or a UI that polls every few
// seconds (batch generation / PDF import progress) will 429 itself within a minute.
const statusPollLimiter = createAIRateLimiter({ maxRequests: 120, featureName: 'AI Job Status Poll' });

// All AI Assistant routes require valid user JWT authentication
router.use(authenticateJWT);

// Registered before the blanket '/questions' limiter below so it gets its own, much more
// generous quota instead of falling under the generation limiter's prefix match.
router.get('/questions/batch-status/:generationRequestId', statusPollLimiter, requireRoles(Role.FACULTY, Role.ADMIN), AIQuestionController.getBatchJobStatus);

// Apply Feature Rate Limiters
router.use('/chat', chatLimiter);
router.use('/ask', ragLimiter);
router.use('/questions', generationLimiter);
router.use('/solutions', generationLimiter);
router.use('/exams', generationLimiter);
router.use('/governance', adminLimiter);

// 1. Existing Chat & Conversations Routes
router.post('/chat', AIChatController.postChatMessage);
router.post('/chat/stream', AIChatController.postChatMessageStream);
router.get('/conversations', AIChatController.getConversations);
router.get('/conversations/:conversationId', AIChatController.getConversationById);
router.delete('/conversations/:conversationId', AIChatController.deleteConversation);
// User Feedback routes on Assistant messages
router.post('/messages/:messageId/feedback', AIChatController.postMessageFeedback);
router.get('/messages/:messageId/feedback', AIChatController.getMessageFeedback);

// Admin RAG Monitoring & Observability routes (Admin only)
router.get('/rag/health', requireRoles(Role.ADMIN), RAGAdminController.getHealth);
router.get('/rag/metrics', requireRoles(Role.ADMIN), RAGAdminController.getMetrics);
router.get('/rag/traces', requireRoles(Role.ADMIN), RAGAdminController.getTraces);

// AI Question Generation & Faculty Review routes (Faculty & Admin only)
router.post('/questions/generate', requireRoles(Role.FACULTY, Role.ADMIN), AIQuestionController.generateQuestions);
router.post('/questions/generate-batch', requireRoles(Role.FACULTY, Role.ADMIN), AIQuestionController.generateBatchQuestions);
router.get('/questions/config/bounds', AIQuestionController.getMinMaxConfig);
router.post('/questions/config/max', requireRoles(Role.ADMIN), AIQuestionController.updateAdminMaxConfig);
router.get('/questions/config/generation-settings', requireRoles(Role.FACULTY, Role.ADMIN), AIQuestionController.getGenerationSettings);
router.put('/questions/config/generation-settings', requireRoles(Role.ADMIN), AIQuestionController.updateGenerationSettings);
router.put('/documents/:documentId/classification', requireRoles(Role.FACULTY, Role.ADMIN), AIQuestionController.updateDocumentClassification);
router.get('/questions/pending', requireRoles(Role.FACULTY, Role.ADMIN), AIQuestionController.getPendingQuestions);
router.post('/questions/:id/approve', requireRoles(Role.FACULTY, Role.ADMIN), AIQuestionController.approveQuestion);
router.post('/questions/:id/reject', requireRoles(Role.FACULTY, Role.ADMIN), AIQuestionController.rejectQuestion);

// AI Solution Generation & Verification routes (Faculty & Admin only)
router.post('/solutions/generate', requireRoles(Role.FACULTY, Role.ADMIN), AISolutionController.generateSolution);
router.get('/solutions/pending', requireRoles(Role.FACULTY, Role.ADMIN), AISolutionController.getPendingSolutions);
router.post('/solutions/:id/approve', requireRoles(Role.FACULTY, Role.ADMIN), AISolutionController.approveSolution);

// Intelligent Exam Draft Assembly routes (Faculty & Admin only)
router.post('/exams/assemble-draft', requireRoles(Role.FACULTY, Role.ADMIN), AIExamController.assembleDraft);
router.post('/exams/generate', requireRoles(Role.FACULTY, Role.ADMIN), AIExamController.assembleDraft);
router.post('/exams/:id/approve', requireRoles(Role.FACULTY, Role.ADMIN), AIExamController.approveExamDraft);
router.post('/exams/validate-balance', requireRoles(Role.FACULTY, Role.ADMIN), AIExamController.validateExamBalance);

// Student Practice & Adaptive Recommendations (Student, Faculty & Admin)
router.post('/practice/generate-set', AIAssistantController.generatePracticeSet);
router.get('/practice/recommendations', AIAssistantController.getStudentRecommendations);

// Faculty & Exam Intelligence Overview (Faculty & Admin)
router.get('/intelligence/overview', requireRoles(Role.FACULTY, Role.ADMIN), FacultyIntelligenceController.getOverview);

// AI Governance Controls, Token Quota & Cost Observability (Admin only)
router.get('/governance/overview', requireRoles(Role.ADMIN), AIGovernanceController.getOverview);
router.post('/governance/circuit-breaker', requireRoles(Role.ADMIN), AIGovernanceController.setCircuitBreaker);
router.get('/governance/model-evaluation', requireRoles(Role.ADMIN), AIGovernanceController.getEvaluation);

// Smart Question Paper Builder & Question Bank routes (Faculty & Admin only)
router.get('/question-bank/subjects', requireRoles(Role.FACULTY, Role.ADMIN), QuestionPaperController.getSubjects);
router.get('/question-bank/topics', requireRoles(Role.FACULTY, Role.ADMIN), QuestionPaperController.getTopics);
router.get('/question-bank/availability', requireRoles(Role.FACULTY, Role.ADMIN), QuestionPaperController.getAvailability);
router.get('/question-bank/search', requireRoles(Role.FACULTY, Role.ADMIN), QuestionPaperController.searchQuestionBank);
router.post('/question-bank/preview-jsonl', requireRoles(Role.FACULTY, Role.ADMIN), jsonlUpload.single('file'), QuestionPaperController.previewJSONLImport);
router.post('/question-bank/import-jsonl', requireRoles(Role.FACULTY, Role.ADMIN), jsonlUpload.single('file'), QuestionPaperController.executeJSONLImport);
router.delete('/question-bank/questions/:id', requireRoles(Role.FACULTY, Role.ADMIN), QuestionPaperController.deleteQuestion);
router.post('/question-bank/questions/bulk-delete', requireRoles(Role.FACULTY, Role.ADMIN), QuestionPaperController.bulkDeleteQuestions);

router.post('/question-paper/preview', requireRoles(Role.FACULTY, Role.ADMIN), QuestionPaperController.previewPaper);
router.post('/question-paper/validate-preview', requireRoles(Role.FACULTY, Role.ADMIN), QuestionPaperController.validatePreviewPayload);
router.post('/question-paper/generate', requireRoles(Role.FACULTY, Role.ADMIN), QuestionPaperController.startShortfallGeneration);
router.get('/question-paper/generation/:jobId', statusPollLimiter, requireRoles(Role.FACULTY, Role.ADMIN), QuestionPaperController.getGenerationJobStatus);
router.post('/question-paper/regenerate-selection', requireRoles(Role.FACULTY, Role.ADMIN), QuestionPaperController.regenerateSelection);
router.post('/question-paper/finalize', requireRoles(Role.FACULTY, Role.ADMIN), requireExamCreatePermission, QuestionPaperController.finalizePaper);
router.get('/question-paper/exams/:id/preview', requireRoles(Role.FACULTY, Role.ADMIN), QuestionPaperController.getExamPreview);
router.post('/question-paper/exams/:id/validate', requireRoles(Role.FACULTY, Role.ADMIN), QuestionPaperController.validateExamination);
router.post('/question-paper/exams/:id/publish', requireRoles(Role.FACULTY, Role.ADMIN), QuestionPaperController.publishExamination);

// RAG Knowledge Base Document Management Sub-router (Authenticated Users, RBAC inside sub-router)
router.use('/documents', ragLimiter, documentRoutes);

export default router;
