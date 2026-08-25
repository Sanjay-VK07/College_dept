import http from 'http';
import { Server } from 'socket.io';
import app from './app';
import { ENV } from './config/env';
import { prisma } from './config/prisma';
import { setupInvigilatorHub } from './socket/invigilatorHub';
import { startDocumentProcessingWorker, stopDocumentProcessingWorker } from './jobs/documentProcessingWorker';
import { startBatchGenerationWorker, stopBatchGenerationWorker } from './jobs/batchGenerationWorker';
import { AIInferenceQueue } from './modules/ai/services/aiInferenceQueue';

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: [ENV.FRONTEND_URL, 'http://localhost:3000'].filter(Boolean),
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

setupInvigilatorHub(io);

server.listen(ENV.PORT, () => {
  console.log(`🚀 GSMAS Backend API & Socket.IO server running on port ${ENV.PORT} [${ENV.NODE_ENV}]`);
  console.log(`🔒 Domain Enforcement Active for: ${ENV.ALLOWED_DOMAINS.join(', ')}`);
  startDocumentProcessingWorker();
  startBatchGenerationWorker();
});

// Graceful Server Lifecycle & Shutdown Handler
let isShuttingDown = false;

const gracefulShutdown = async (signal: string) => {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log(`\n[Server Lifecycle] Received ${signal}. Starting graceful shutdown...`);

  // Emergency force exit timer safeguard (10s limit)
  const forceExitTimeout = setTimeout(() => {
    console.error('[Server Lifecycle] Shutdown timeout reached (10s). Forcing process exit.');
    process.exit(1);
  }, 10000);
  forceExitTimeout.unref();

  stopDocumentProcessingWorker();
  stopBatchGenerationWorker();

  // 1. Close HTTP server (stop receiving new connections)
  server.close(() => {
    console.log('[Server Lifecycle] HTTP API server closed.');
  });

  // 2. Close Socket.IO server
  try {
    io.close(() => {
      console.log('[Server Lifecycle] Socket.IO gateway closed.');
    });
  } catch (err) {
    console.error('[Server Lifecycle] Error closing Socket.IO:', err);
  }

  // 3. Drain and cancel AI Inference Queue
  try {
    AIInferenceQueue.handleShutdown();
  } catch (err) {
    console.error('[Server Lifecycle] Error in AI queue shutdown:', err);
  }

  // 4. Disconnect Prisma DB pool
  try {
    await prisma.$disconnect();
    console.log('[Server Lifecycle] Database connection pool disconnected.');
  } catch (err) {
    console.error('[Server Lifecycle] Error disconnecting Prisma:', err);
  }

  console.log('[Server Lifecycle] Shutdown complete. Exiting process.');
  process.exit(0);
};

process.once('SIGINT', () => gracefulShutdown('SIGINT'));
process.once('SIGTERM', () => gracefulShutdown('SIGTERM'));
