import { Router } from 'express';
import { authenticateJWT, requireRoles } from '../../../middlewares/authMiddleware';
import { Role } from '@prisma/client';
import { AIChatController } from '../controllers/aiChatController';
<<<<<<< HEAD
import { RAGAdminController } from '../controllers/ragAdminController';
import { AIQuestionController } from '../controllers/aiQuestionController';
import { AISolutionController } from '../controllers/aiSolutionController';
import { AIExamController } from '../controllers/aiExamController';
import { FacultyIntelligenceController } from '../controllers/facultyIntelligenceController';
import { AIGovernanceController } from '../controllers/aiGovernanceController';
=======
import { AIAssistantController } from '../controllers/aiAssistantController';
>>>>>>> 3f760070b07f9bf338f83776cadbc80c79b61d54
import documentRoutes from './documentRoutes';
import rateLimit from 'express-rate-limit';

const router = Router();

// Configure dynamic role-based rate limiting middleware
const dynamicAiRateLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1-minute window
  max: (req: any) => {
    const role = req.user?.role;
    if (role === 'ADMIN') return 60; // 60 requests/min for Admin
    if (role === 'FACULTY') return 30; // 30 requests/min for Faculty
    return parseInt(process.env.AI_RATE_LIMIT || '10', 10); // Default/Student limit: 10 requests/min
  },
  message: {
    success: false,
    message: 'Too many AI requests. Please try again later.',
  },
  keyGenerator: (req: any) => req.user?.id || req.ip,
  standardHeaders: true,
  legacyHeaders: false,
});

// All AI Assistant routes require valid user JWT authentication
router.use(authenticateJWT);

// Apply dynamic rate limiting to mutation / generation endpoints
router.use('/chat', dynamicAiRateLimiter);
router.use('/ask', dynamicAiRateLimiter);
router.use('/generate-questions', dynamicAiRateLimiter);
router.use('/practice', dynamicAiRateLimiter);

// 1. Existing Chat & Conversations Routes
router.post('/chat', AIChatController.postChatMessage);
router.get('/conversations', AIChatController.getConversations);
router.get('/conversations/:conversationId', AIChatController.getConversationById);
router.delete('/conversations/:conversationId', AIChatController.deleteConversation);

<<<<<<< HEAD
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
router.put('/questions/:id', requireRoles(Role.FACULTY, Role.ADMIN), AIQuestionController.editQuestion);

// AI Solution Generation & Verification routes (Faculty & Admin only)
router.post('/solutions/generate', requireRoles(Role.FACULTY, Role.ADMIN), AISolutionController.generateSolution);
router.get('/solutions/pending', requireRoles(Role.FACULTY, Role.ADMIN), AISolutionController.getPendingSolutions);
router.post('/solutions/:id/approve', requireRoles(Role.FACULTY, Role.ADMIN), AISolutionController.approveSolution);
router.post('/solutions/:id/reject', requireRoles(Role.FACULTY, Role.ADMIN), AISolutionController.rejectSolution);
router.put('/solutions/:id', requireRoles(Role.FACULTY, Role.ADMIN), AISolutionController.editSolution);

// AI Intelligent Exam Assembly routes (Faculty & Admin only)
router.post('/exams/generate', requireRoles(Role.FACULTY, Role.ADMIN), AIExamController.assembleExam);
router.post('/exams/:id/approve', requireRoles(Role.FACULTY, Role.ADMIN), AIExamController.approveExamDraft);

// AI Faculty & Examination Intelligence routes (Faculty & Admin only)
router.get('/intelligence/overview', requireRoles(Role.FACULTY, Role.ADMIN), FacultyIntelligenceController.getOverview);
router.get('/intelligence/questions/:id', requireRoles(Role.FACULTY, Role.ADMIN), FacultyIntelligenceController.getQuestionAnalysis);
router.get('/intelligence/exams/:id', requireRoles(Role.FACULTY, Role.ADMIN), FacultyIntelligenceController.getExamAnalysis);
router.get('/intelligence/cohort', requireRoles(Role.FACULTY, Role.ADMIN), FacultyIntelligenceController.getCohortAnalysis);

// AI Governance, Cost Control & Operations routes (Admin only)
router.get('/governance/overview', requireRoles(Role.ADMIN), AIGovernanceController.getOverview);
router.post('/governance/circuit-breaker', requireRoles(Role.ADMIN), AIGovernanceController.setCircuitBreaker);
router.get('/governance/evaluation', requireRoles(Role.ADMIN), AIGovernanceController.getEvaluation);
=======
// 2. Phase 2D Conversational Features & RAG QA
router.post('/ask', AIAssistantController.askQuestion);
router.post('/conversations/:conversationId/rename', AIAssistantController.renameConversation);

// 3. Phase 2D Question Generation & Review Routes
router.post('/generate-questions', AIAssistantController.generateQuestions);
router.post('/save-generated-question', AIAssistantController.saveGeneratedQuestion);

// 4. Phase 2D Practice Mode & Insights Routes
router.post('/practice', AIAssistantController.generatePracticeSet);
router.post('/practice/submit', AIAssistantController.submitPracticeSet);
router.get('/practice/attempts', AIAssistantController.getPracticeAttempts);
router.get('/performance-insights', AIAssistantController.getPerformanceInsights);
>>>>>>> 3f760070b07f9bf338f83776cadbc80c79b61d54

// Secure document management routes
router.use('/documents', documentRoutes);

export default router;
