import http from 'http';
import { Server } from 'socket.io';
import app from './app';
import { ENV } from './config/env';
import { setupInvigilatorHub } from './socket/invigilatorHub';

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

setupInvigilatorHub(io);

server.listen(ENV.PORT, () => {
  console.log(`🚀 GSMAS Backend API & Socket.IO server running on port ${ENV.PORT}`);
  console.log(`🔒 Domain Enforcement Active for: ${ENV.ALLOWED_DOMAINS.join(', ')}`);
});
