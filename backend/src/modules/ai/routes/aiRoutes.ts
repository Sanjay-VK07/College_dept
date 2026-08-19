import { Router } from 'express';
import { authenticateJWT } from '../../../middlewares/authMiddleware';
import { AIChatController } from '../controllers/aiChatController';

const router = Router();

// All AI Assistant routes require valid user JWT authentication
router.use(authenticateJWT);

router.post('/chat', AIChatController.postChatMessage);
router.get('/conversations', AIChatController.getConversations);
router.get('/conversations/:conversationId', AIChatController.getConversationById);
router.delete('/conversations/:conversationId', AIChatController.deleteConversation);

export default router;
