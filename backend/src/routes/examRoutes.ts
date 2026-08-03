import { Router } from 'express';
import { ExamController } from '../controllers/examController';
import { authenticateJWT, enforceStudentPrivacy } from '../middlewares/authMiddleware';

const router = Router();

router.use(authenticateJWT);

router.get('/student-tests', ExamController.getStudentTests);
router.post('/start/:testId', ExamController.startExam);
router.post('/autosave', ExamController.autoSaveResponse);
router.post('/submit', ExamController.submitExam);
router.get('/solution/:assignmentId', enforceStudentPrivacy('assignmentId'), ExamController.getSolutionReview);

export default router;
