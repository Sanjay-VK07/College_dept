import express from 'express';
import cors from 'cors';
import { ENV } from './config/env';
import authRoutes from './routes/authRoutes';
import examRoutes from './routes/examRoutes';
import questionRoutes from './routes/questionRoutes';
import analyticsRoutes from './routes/analyticsRoutes';
import adminRoutes from './routes/adminRoutes';
import notificationRoutes from './routes/notificationRoutes';

const app = express();

app.use(cors({ origin: '*', credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Base health check
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'UP',
    system: 'GATE Secure Mock Test & Analytics System (GSMAS)',
    time: new Date(),
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/exam', examRoutes);
app.use('/api/questions', questionRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/notifications', notificationRoutes);

// Global Error Handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled API Error:', err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal Server Error',
  });
});

export default app;
