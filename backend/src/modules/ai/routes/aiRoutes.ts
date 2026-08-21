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
import documentRoutes from './documentRoutes';

const router = Router();

// All AI Assistant routes require valid user JWT authentication
router.use(authenticateJWT);

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

// Secure document management routes
router.use('/documents', documentRoutes);

export default router;
