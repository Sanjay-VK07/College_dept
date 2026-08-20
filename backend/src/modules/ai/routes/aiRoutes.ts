import { Router } from 'express';
import { authenticateJWT } from '../../../middlewares/authMiddleware';
import { AIChatController } from '../controllers/aiChatController';
import { AIAssistantController } from '../controllers/aiAssistantController';
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

// Secure document management routes
router.use('/documents', documentRoutes);

export default router;
