import dotenv from 'dotenv';
import path from 'path';
// Force load .env.staging with override: true before any other imports
dotenv.config({ path: path.resolve(__dirname, '../.env.staging'), override: true });

import http from 'http';
import { Server } from 'socket.io';
import app from './app';
import { ENV } from './config/env';
import { setupInvigilatorHub } from './socket/invigilatorHub';

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: ['http://localhost:3001', 'http://localhost:3000', ENV.FRONTEND_URL].filter(Boolean),
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    credentials: true,
  },
});

setupInvigilatorHub(io);

const port = 5001;
server.listen(port, () => {
  console.log(`🚀 STAGING Backend API running on port ${port} [schema=staging]`);
  console.log(`🔒 Target Staging Database: ${process.env.DATABASE_URL?.includes('schema=staging') ? 'ISOLATED STAGING' : 'WARNING NOT STAGING'}`);
});
