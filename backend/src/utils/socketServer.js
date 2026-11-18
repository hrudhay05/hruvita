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
      if (!token) return next(new Error('Authentication required'));

      const secret = process.env.JWT_SECRET || 'hruvita-jwt-access-secret-2026-secure';
      const decoded = jwt.verify(token, secret);
      const user = await findUserById(decoded.id);
      if (!user || user.blocked) return next(new Error('Account unavailable'));

      socket.user = {
        id: user.id,
        role: user.role,
        email: user.email,
      };
      return next();
    } catch {
      return next(new Error('Invalid session'));
    }
  });

  io.on('connection', (socket) => {
    const { id, role } = socket.user;
    // Join strictly authenticated user-specific and role-specific rooms only
    socket.join(`user:${id}`);
    if (role === 'admin' || role === 'staff') {
      socket.join('role:admin');
    } else if (role === 'delivery_boy') {
      socket.join(`delivery:${id}`);
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

export function emitToDeliveryPartner(partnerId, event, payload) {
  if (!io || !partnerId) return;
  io.to(`delivery:${partnerId}`).emit(event, payload);
}
