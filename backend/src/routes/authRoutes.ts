import { Router } from 'express';
import { AuthController } from '../controllers/authController';
import { authenticateJWT } from '../middlewares/authMiddleware';

const router = Router();

router.post('/google', AuthController.googleLogin);
router.get('/me', authenticateJWT, AuthController.getProfile);

export default router;
