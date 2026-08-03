import { Router } from 'express';
import { QuestionController } from '../controllers/questionController';
import { authenticateJWT, requireRoles } from '../middlewares/authMiddleware';
import { Role } from '@prisma/client';

const router = Router();

router.use(authenticateJWT);

router.get('/taxonomy', QuestionController.getTaxonomy);
router.get('/', QuestionController.listQuestions);
router.post('/', requireRoles(Role.FACULTY, Role.ADMIN), QuestionController.createQuestion);

export default router;
