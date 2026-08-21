import express from 'express';
import cors from 'cors';
import { ENV } from './config/env';
import authRoutes from './routes/authRoutes';
import examRoutes from './routes/examRoutes';
import questionRoutes from './routes/questionRoutes';
import analyticsRoutes from './routes/analyticsRoutes';
import adminRoutes from './routes/adminRoutes';
import notificationRoutes from './routes/notificationRoutes';
import healthRoutes from './routes/healthRoutes';
import aiRoutes from './modules/ai/routes/aiRoutes';
import { aiErrorHandler } from './modules/ai/middleware/aiErrorHandler';

const app = express();

// Security Headers Middleware
app.use((req, res, next) => {
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// CORS Configuration
const allowedOrigins = [ENV.FRONTEND_URL, 'http://localhost:3000'].filter(Boolean);
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin) || ENV.NODE_ENV !== 'production') {
        callback(null, true);
      } else {
        callback(new Error('CORS Policy: Origin not allowed.'));
      }
    },
    credentials: true,
  })
);

// Payload Limits
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// Health & Readiness Probes
app.use('/api/health', healthRoutes);

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/exam', examRoutes);
app.use('/api/questions', questionRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/ai', aiRoutes);

// Safe AI Error Handler
app.use(aiErrorHandler);

// Global Error Handler Fallback
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled API Error:', err.message || err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message && ENV.NODE_ENV !== 'production' ? err.message : 'Internal Server Error',
  });
});

export default app;
