import { Router } from 'express';
import { authenticateJWT, requireRoles } from '../../../middlewares/authMiddleware';
import { Role } from '@prisma/client';
import { AIChatController } from '../controllers/aiChatController';
import { RAGAdminController } from '../controllers/ragAdminController';
import { AIQuestionController } from '../controllers/aiQuestionController';
import { AISolutionController } from '../controllers/aiSolutionController';
import { AIExamController } from '../controllers/aiExamController';
import { FacultyIntelligenceController } from '../controllers/facultyIntelligenceController';
import { AIGovernanceController } from '../controllers/aiGovernanceController';
import { AIAssistantController } from '../controllers/aiAssistantController';
import documentRoutes from './documentRoutes';
import { createAIRateLimiter } from '../../../middlewares/rateLimiter';
import { ENV } from '../../../config/env';

const router = Router();

// Configure Feature-Specific Rate Limiters
const chatLimiter = createAIRateLimiter({ maxRequests: ENV.AI_CHAT_RATE_LIMIT, featureName: 'AI Chat' });
const ragLimiter = createAIRateLimiter({ maxRequests: ENV.AI_RAG_RATE_LIMIT, featureName: 'RAG Search' });
const generationLimiter = createAIRateLimiter({ maxRequests: ENV.AI_GENERATION_RATE_LIMIT, featureName: 'AI Generation' });
const adminLimiter = createAIRateLimiter({ maxRequests: ENV.AI_ADMIN_RATE_LIMIT, featureName: 'AI Admin' });

// All AI Assistant routes require valid user JWT authentication
router.use(authenticateJWT);

// Apply Feature Rate Limiters
router.use('/chat', chatLimiter);
router.use('/ask', ragLimiter);
router.use('/questions', generationLimiter);
router.use('/solutions', generationLimiter);
router.use('/exams', generationLimiter);
router.use('/governance', adminLimiter);

// 1. Existing Chat & Conversations Routes
router.post('/chat', AIChatController.postChatMessage);
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
router.get('/questions/pending', requireRoles(Role.FACULTY, Role.ADMIN), AIQuestionController.getPendingQuestions);
router.post('/questions/:id/approve', requireRoles(Role.FACULTY, Role.ADMIN), AIQuestionController.approveQuestion);
router.post('/questions/:id/reject', requireRoles(Role.FACULTY, Role.ADMIN), AIQuestionController.rejectQuestion);

// AI Solution Generation & Verification routes (Faculty & Admin only)
router.post('/solutions/generate', requireRoles(Role.FACULTY, Role.ADMIN), AISolutionController.generateSolution);
router.get('/solutions/pending', requireRoles(Role.FACULTY, Role.ADMIN), AISolutionController.getPendingSolutions);
router.post('/solutions/:id/approve', requireRoles(Role.FACULTY, Role.ADMIN), AISolutionController.approveSolution);

// Intelligent Exam Draft Assembly routes (Faculty & Admin only)
router.post('/exams/assemble-draft', requireRoles(Role.FACULTY, Role.ADMIN), AIExamController.assembleDraft);
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

// RAG Knowledge Base Document Management Sub-router (Authenticated Users, RBAC inside sub-router)
router.use('/documents', ragLimiter, documentRoutes);

export default router;
