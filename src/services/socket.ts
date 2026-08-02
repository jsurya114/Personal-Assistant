import { Server } from 'socket.io';
import { Server as HttpServer } from 'http';
import { logger } from '../utils/logger';

let io: Server | null = null;

export function initSocket(server: HttpServer) {
  io = new Server(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST']
    }
  });

  io.on('connection', (socket) => {
    logger.info(`Dashboard connected via socket [${socket.id}]`);

    socket.on('disconnect', () => {
      logger.info(`Dashboard disconnected [${socket.id}]`);
    });
  });
}

export function emitToDashboard(event: string, data?: any) {
  if (io) {
    io.emit(event, data);
  } else {
    logger.debug(`Socket.io not active in this process; skipping '${event}' emit.`);
  }
}
