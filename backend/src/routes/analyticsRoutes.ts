import { Router } from 'express';
import { AnalyticsController } from '../controllers/analyticsController';
import { authenticateJWT, requireRoles, enforceStudentPrivacy } from '../middlewares/authMiddleware';
import { Role } from '@prisma/client';

const router = Router();

router.use(authenticateJWT);

// Student personal analytics (strict privacy guard: student can only view their own)
router.get('/student/:studentId', enforceStudentPrivacy('studentId'), AnalyticsController.getStudentAnalytics);
router.get('/student-me', AnalyticsController.getStudentAnalytics);

// Faculty analytics
router.get('/faculty/test/:testId', requireRoles(Role.FACULTY, Role.ADMIN), AnalyticsController.getFacultyTestAnalytics);

export default router;
