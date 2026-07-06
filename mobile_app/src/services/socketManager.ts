import { io, Socket } from 'socket.io-client';
import { API_BASE } from './api/client';

let socket: Socket | null = null;
const listeners: Map<string, Set<(...args: any[]) => void>> = new Map();

export const SocketManager = {
  connect(token: string) {
    if (socket?.connected) return;
    socket = io(API_BASE, {
      path: '/api/socket',
      auth: { token },
      autoConnect: true,
    });

    // Pub/Sub Engine: Route all incoming events to registered listeners
    socket.onAny((event, ...args) => {
      listeners.get(event)?.forEach((cb) => cb(...args));
    });

    // Explicitly route reserved socket.io events (onAny doesn't catch these)
    socket.on('connect', () => {
      console.log("[SocketManager] Connected:", socket?.id);
      listeners.get('connect')?.forEach((cb) => cb());
    });

    socket.on('connect_error', (err) => {
      console.error("[SocketManager] Connection Error:", err.message);
      listeners.get('connect_error')?.forEach((cb) => cb(err));
    });

    socket.on('disconnect', (reason) => {
      listeners.get('disconnect')?.forEach((cb) => cb(reason));
      if (reason === 'io server disconnect') {
        socket?.connect();
      }
    });
  },

  disconnect() {
    if (socket) {
      socket.disconnect();
      socket = null;
      listeners.clear(); // CRITICAL: Clear all dynamic listeners to prevent memory leaks on logout
    }
  },

  emit(event: string, ...args: any[]) {
    if (socket?.connected) {
      socket.emit(event, ...args);
    } else {
      console.warn(`[SocketManager] Missed emit: "${event}". Socket disconnected.`);
    }
  },

  on(event: string, cb: (...args: any[]) => void): () => void {
    if (!listeners.has(event)) {
      listeners.set(event, new Set());
    }
    listeners.get(event)!.add(cb);

    // Return an explicit unsubscribe cleanup function
    return () => {
      const eventListeners = listeners.get(event);
      if (eventListeners) {
        eventListeners.delete(cb);
        if (eventListeners.size === 0) listeners.delete(event);
      }
    };
  },
  
  get connected() { return socket?.connected ?? false; }
};
