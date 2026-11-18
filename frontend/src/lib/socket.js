import { io } from 'socket.io-client';
import { API_BASE, getStoredToken } from './api.js';

export function createHruvitaSocket() {
  const token = getStoredToken();
  return io(API_BASE || window.location.origin, {
    auth: token ? { token } : undefined,
    withCredentials: true,
    transports: ['websocket', 'polling'],
  });
}
