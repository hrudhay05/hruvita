import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import { findUserById } from '../store/repository.js';

let io = null;

function parseCookieToken(cookieHeader = '', name = 'hruvita_access_token') {
  const parts = String(cookieHeader || '').split(';');
  for (const part of parts) {
    const [k, ...rest] = part.trim().split('=');
    if (k === name) return decodeURIComponent(rest.join('='));
  }
  return '';
}

export function initSocketServer(httpServer, allowedOrigins = []) {
  io = new Server(httpServer, {
    cors: {
      origin: allowedOrigins.length ? allowedOrigins : true,
      credentials: true,
    },
  });

  io.use(async (socket, next) => {
    try {
      const authToken = socket.handshake.auth?.token || '';
      const cookieToken = parseCookieToken(socket.handshake.headers?.cookie || '');
      const token = authToken || cookieToken;
      if (!token) {
        socket.user = { id: 'guest', role: 'guest', email: '' };
        return next();
      }

      const secret = process.env.JWT_SECRET || 'hruvita-jwt-access-secret-2026-secure';
      const decoded = jwt.verify(token, secret);
      const user = await findUserById(decoded.id);
      if (!user || user.blocked) {
        socket.user = { id: 'guest', role: 'guest', email: '' };
        return next();
      }

      socket.user = {
        id: user.id,
        role: user.role,
        email: user.email,
      };
      return next();
    } catch {
      socket.user = { id: 'guest', role: 'guest', email: '' };
      return next();
    }
  });

  io.on('connection', (socket) => {
    const { id, role } = socket.user;
    socket.join('public:catalog');

    if (role === 'guest') return;

    // Strictly join authenticated user-specific and role-specific rooms on backend
    socket.join(`user:${id}`);
    if (role === 'admin' || role === 'staff') {
      socket.join('role:admin');
    } else if (role === 'admin_analyser') {
      socket.join('role:admin_analyser');
    } else if (role === 'delivery_boy') {
      socket.join(`delivery:${id}`);
      socket.join('role:delivery_boy');
    } else if (role === 'customer') {
      socket.join('role:customer');
    }
  });

  return io;
}

export function emitToUser(userId, event, payload) {
  if (!io || !userId) return;
  io.to(`user:${userId}`).emit(event, payload);
}

export function emitToAdmins(event, payload) {
  if (!io) return;
  io.to('role:admin').emit(event, payload);
}

export function emitToAnalysts(event, payload) {
  if (!io) return;
  io.to('role:admin_analyser').emit(event, payload);
}

export function emitToDeliveryPartner(partnerId, event, payload) {
  if (!io || !partnerId) return;
  io.to(`delivery:${partnerId}`).emit(event, payload);
}

export function emitPublicCatalog(event, payload) {
  if (!io) return;
  io.to('public:catalog').emit(event, payload);
}
