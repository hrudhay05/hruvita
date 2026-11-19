import { io } from 'socket.io-client';
import { API_BASE, getStoredToken } from './api.js';

const activeSockets = new Set();

export function createHruvitaSocket() {
  const token = getStoredToken();
  const sock = io(API_BASE || window.location.origin, {
    auth: token ? { token } : undefined,
    withCredentials: true,
    transports: ['websocket', 'polling'],
  });
  activeSockets.add(sock);
  sock.on('disconnect', () => {
    activeSockets.delete(sock);
  });
  return sock;
}

export function disconnectAllHruvitaSockets() {
  for (const sock of activeSockets) {
    try {
      sock.disconnect();
    } catch {
      /* ignore */
    }
  }
  activeSockets.clear();
}
