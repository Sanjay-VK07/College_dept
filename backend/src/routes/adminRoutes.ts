import { Router } from 'express';
import multer from 'multer';
import { AdminController } from '../controllers/adminController';
import { authenticateJWT, requireRoles } from '../middlewares/authMiddleware';
import { Role } from '@prisma/client';

const upload = multer({ storage: multer.memoryStorage() });
const router = Router();

router.use(authenticateJWT);

// Overview & Health
router.get('/overview', requireRoles(Role.ADMIN), AdminController.getOverviewStats);

// Student Roster Management
router.get('/students', requireRoles(Role.ADMIN), AdminController.getStudents);
router.post('/students', requireRoles(Role.ADMIN), AdminController.createStudent);
router.put('/students/:id', requireRoles(Role.ADMIN), AdminController.updateStudent);
router.delete('/students/:id', requireRoles(Role.ADMIN), AdminController.deleteStudent);
router.post('/students/:id/reset-attempts', requireRoles(Role.ADMIN), AdminController.resetStudentAttempts);

// Faculty Management
router.get('/faculty', requireRoles(Role.ADMIN), AdminController.getFaculty);
router.post('/faculty', requireRoles(Role.ADMIN), AdminController.createFaculty);
router.put('/faculty/:id', requireRoles(Role.ADMIN), AdminController.updateFaculty);
router.delete('/faculty/:id', requireRoles(Role.ADMIN), AdminController.deleteFaculty);

// Question Bank Management
router.get('/questions', requireRoles(Role.FACULTY, Role.ADMIN), AdminController.getQuestions);
router.post('/questions', requireRoles(Role.FACULTY, Role.ADMIN), AdminController.createQuestion);
router.delete('/questions/:id', requireRoles(Role.ADMIN), AdminController.deleteQuestion);

// Exam Management
router.get('/exams', requireRoles(Role.FACULTY, Role.ADMIN), AdminController.getExams);
router.post('/exams', requireRoles(Role.FACULTY, Role.ADMIN), AdminController.createExam);
router.put('/exams/:id/publish', requireRoles(Role.ADMIN), AdminController.togglePublishExam);
router.delete('/exams/:id', requireRoles(Role.ADMIN), AdminController.deleteExam);

// Bulk Uploads & Reports
router.post('/upload-questions', requireRoles(Role.FACULTY, Role.ADMIN), upload.single('file'), AdminController.uploadQuestions);
router.post('/upload-students', requireRoles(Role.ADMIN), upload.single('file'), AdminController.uploadStudents);
router.get('/export-report/:testId', requireRoles(Role.FACULTY, Role.ADMIN), AdminController.exportTestReport);

// Security & System Settings
router.get('/settings', requireRoles(Role.ADMIN), AdminController.getSystemSettings);
router.put('/settings', requireRoles(Role.ADMIN), AdminController.updateSystemSetting);

// Additional Governance Routes
router.get('/results-ledger', requireRoles(Role.FACULTY, Role.ADMIN), AdminController.getResultsLedger);
router.post('/assign-invigilator', requireRoles(Role.FACULTY, Role.ADMIN), AdminController.assignInvigilator);
router.get('/hall-tickets', requireRoles(Role.FACULTY, Role.ADMIN), AdminController.getHallTickets);

export default router;
