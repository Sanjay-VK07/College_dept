import { Router } from 'express';
import { authenticateJWT } from '../../../middlewares/authMiddleware';
import { AIChatController } from '../controllers/aiChatController';
import documentRoutes from './documentRoutes';

const router = Router();

// All AI Assistant routes require valid user JWT authentication
router.use(authenticateJWT);

router.post('/chat', AIChatController.postChatMessage);
router.get('/conversations', AIChatController.getConversations);
router.get('/conversations/:conversationId', AIChatController.getConversationById);
router.delete('/conversations/:conversationId', AIChatController.deleteConversation);

// Secure document management routes
router.use('/documents', documentRoutes);

export default router;

