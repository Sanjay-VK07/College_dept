import { Router } from 'express';
import { QuestionController } from '../controllers/questionController';
import { authenticateJWT, requireRoles } from '../middlewares/authMiddleware';
import { Role } from '@prisma/client';

const router = Router();

// Publicly accessible question image serving endpoint (for <img> tags in browser)
router.get('/:id/source-image', QuestionController.getQuestionSourceImage);
router.get('/:id/image', QuestionController.getQuestionImage);
router.get('/questions/:id/source-image', QuestionController.getQuestionSourceImage);
router.get('/questions/:id/image', QuestionController.getQuestionImage);

router.use(authenticateJWT);

router.post('/recover-all-source-images', requireRoles(Role.FACULTY, Role.ADMIN), QuestionController.recoverAllSourceImages);
router.post('/recover-source-images', requireRoles(Role.FACULTY, Role.ADMIN), QuestionController.recoverAllSourceImages);
router.post('/:questionId/recover-source-image', requireRoles(Role.FACULTY, Role.ADMIN), QuestionController.recoverSourceImageSingle);
router.post('/:id/image/recover', requireRoles(Role.FACULTY, Role.ADMIN), QuestionController.recoverSourceImageSingle);

router.get('/taxonomy', QuestionController.getTaxonomy);
router.get('/', QuestionController.listQuestions);
router.post('/', requireRoles(Role.FACULTY, Role.ADMIN), QuestionController.createQuestion);

export default router;
