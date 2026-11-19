import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext.jsx';
import { API_BASE, getStoredToken } from '../lib/api.js';

const SocketContext = createContext(null);

export function SocketProvider({ children }) {
  const { user } = useAuth();
  const socketRef = useRef(null);
  const seenEventsRef = useRef(new Set());
  const [status, setStatus] = useState('offline'); // 'connected' | 'reconnecting' | 'offline'
  const [lastSyncAt, setLastSyncAt] = useState(0);

  useEffect(() => {
    const token = getStoredToken();
    const sock = io(API_BASE || window.location.origin, {
      auth: token ? { token } : undefined,
      withCredentials: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1200,
      transports: ['websocket', 'polling'],
    });
    socketRef.current = sock;

    const onConnect = () => {
      setStatus('connected');
      setLastSyncAt(Date.now());
    };
    const onDisconnect = () => setStatus('offline');
    const onReconnecting = () => setStatus('reconnecting');
    const onReconnect = () => {
      setStatus('connected');
      setLastSyncAt(Date.now());
    };

    sock.on('connect', onConnect);
    sock.on('disconnect', onDisconnect);
    sock.io.on('reconnect_attempt', onReconnecting);
    sock.io.on('reconnect', onReconnect);

    return () => {
      sock.off('connect', onConnect);
      sock.off('disconnect', onDisconnect);
      sock.io.off('reconnect_attempt', onReconnecting);
      sock.io.off('reconnect', onReconnect);
      sock.disconnect();
      socketRef.current = null;
    };
  }, [user?.id, user?.role]);

  const subscribe = useCallback((eventName, handler) => {
    const sock = socketRef.current;
    if (!sock || !eventName || typeof handler !== 'function') return () => {};

    const wrapped = (payload) => {
      const evId = payload?.eventId;
      if (evId) {
        if (seenEventsRef.current.has(evId)) return;
        seenEventsRef.current.add(evId);
        if (seenEventsRef.current.size > 250) {
          const first = seenEventsRef.current.values().next().value;
          seenEventsRef.current.delete(first);
        }
      }
      handler(payload);
    };

    sock.on(eventName, wrapped);
    return () => sock.off(eventName, wrapped);
  }, []);

  return (
    <SocketContext.Provider value={{ socket: socketRef.current, status, lastSyncAt, subscribe }}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  return useContext(SocketContext);
}

export function useSocketEvents(eventsMap, deps = []) {
  const ctx = useSocket();
  useEffect(() => {
    if (!ctx?.subscribe || !eventsMap) return undefined;
    const unsubs = Object.entries(eventsMap).map(([ev, fn]) => ctx.subscribe(ev, fn));
    return () => {
      for (const u of unsubs) u();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx, ctx?.lastSyncAt, ...deps]);
}
