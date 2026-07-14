import { io, Socket } from 'socket.io-client';
import { API_BASE } from './api/client';

let socket: Socket | null = null;
let isConnecting = false;
let lastErrorLogAt = 0;
let authRefresher: (() => Promise<string | null>) | null = null;
const listeners: Map<string, Set<(...args: any[]) => void>> = new Map();

const TRANSIENT_ERRORS = new Set(['timeout', 'xhr poll error', 'websocket error', 'transport error']);

/**
 * Normalize API base for Socket.IO:
 * - strip trailing slash
 * - strip trailing /api (would produce /api/api/socket with path option)
 * - force https:// against Render in production (wss:// handshake)
 */
function socketServerUrl(): string {
  let url = String(API_BASE || '').trim().replace(/\/+$/, '');
  if (!url) return url;

  if (url.endsWith('/api')) {
    url = url.slice(0, -4);
  }

  if (url.includes('onrender.com') && url.startsWith('http://')) {
    url = url.replace(/^http:\/\//i, 'https://');
  }
  if (__DEV__ && url.startsWith('http://')) {
    return url;
  }
  if (!__DEV__ && url.startsWith('http://')) {
    url = url.replace(/^http:\/\//i, 'https://');
  }
  return url;
}

/** Clerk JWT only — server calls verifyToken() on auth.token directly (no Bearer prefix). */
function normalizeAuthToken(token: string): string | null {
  const trimmed = String(token || '').trim();
  if (!trimmed || trimmed === 'null' || trimmed === 'undefined') return null;
  return trimmed.startsWith('Bearer ') ? trimmed.slice(7).trim() : trimmed;
}

function handshakeLogLabel(url: string): string {
  return `${url}/api/socket/?EIO=4&transport=polling`;
}

async function refreshAuthToken(): Promise<void> {
  if (!authRefresher || !socket) return;
  try {
    const token = await authRefresher();
    const authToken = token ? normalizeAuthToken(token) : null;
    if (authToken) {
      socket.auth = { token: authToken };
    }
  } catch {
    // Reconnect will retry with the last known auth token
  }
}

function logConnectError(err: Error & { description?: string; type?: string }) {
  const now = Date.now();
  if (now - lastErrorLogAt < 8000) return;
  lastErrorLogAt = now;

  const msg = err.message || '';
  const isTransient = TRANSIENT_ERRORS.has(msg) || msg.includes('timeout');
  const detail = [err.description, err.type].filter(Boolean).join(' ');

  if (isTransient) {
    console.warn('[SocketManager] Transient disconnect, auto-reconnecting:', msg, detail);
  } else {
    console.error('[SocketManager] Connection Error:', msg, detail);
  }
}

function attachCoreHandlers(active: Socket) {
  active.onAny((event, ...args) => {
    listeners.get(event)?.forEach((cb) => cb(...args));
  });

  active.io.on('reconnect_attempt', () => {
    void refreshAuthToken();
  });

  active.on('connect', () => {
    isConnecting = false;
    console.log('[SocketManager] Connected:', active.id, 'transport:', active.io.engine?.transport?.name);
    listeners.get('connect')?.forEach((cb) => cb());
  });

  active.on('connect_error', (err: Error & { description?: string; type?: string }) => {
    isConnecting = false;
    logConnectError(err);
    void refreshAuthToken();
    listeners.get('connect_error')?.forEach((cb) => cb(err));
  });

  active.on('disconnect', (reason) => {
    isConnecting = false;
    if (reason === 'ping timeout' || reason === 'transport close' || reason === 'transport error') {
      console.warn('[SocketManager] Disconnected:', reason, '— will reconnect');
    }
    listeners.get('disconnect')?.forEach((cb) => cb(reason));
    if (reason === 'io server disconnect') {
      void refreshAuthToken().then(() => active.connect());
    }
  });
}

function isRenderHost(): boolean {
  return socketServerUrl().includes('onrender.com');
}

export const SocketManager = {
  /** Called once from AuthGuard so reconnect attempts always use a fresh Clerk JWT. */
  setAuthRefresher(refresher: () => Promise<string | null>) {
    authRefresher = refresher;
  },

  /**
   * Idempotent singleton connect — never destroy/recreate on AppState or token refresh.
   * Polling-first is required for Render sticky sessions on React Native.
   */
  connect(token: string) {
    const authToken = normalizeAuthToken(token);
    if (!authToken) {
      console.warn('[SocketManager] connect() skipped — missing or invalid token');
      return;
    }

    const url = socketServerUrl();
    if (!url) {
      console.error('[SocketManager] Missing EXPO_PUBLIC_API_URL / API_BASE');
      return;
    }

    if (socket?.connected) {
      socket.auth = { token: authToken };
      return;
    }

    if (socket) {
      socket.auth = { token: authToken };
      if (!socket.connected && !isConnecting) {
        isConnecting = true;
        socket.connect();
      }
      return;
    }

    if (isConnecting) return;

    isConnecting = true;
    console.log('[SocketManager] Creating socket →', handshakeLogLabel(url));

    // Render free tier can take 30–50s to wake — use a longer handshake timeout in prod
    const handshakeTimeout = isRenderHost() ? 45000 : 20000;

    socket = io(url, {
      path: '/api/socket',
      transports: ['polling', 'websocket'],
      upgrade: true,
      rememberUpgrade: true,
      forceNew: false,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 2000,
      reconnectionDelayMax: 30000,
      randomizationFactor: 0.5,
      timeout: handshakeTimeout,
      autoConnect: false,
      auth: { token: authToken },
      withCredentials: true,
    });

    attachCoreHandlers(socket);
    socket.connect();
  },

  ensureConnected() {
    if (!socket || socket.connected || isConnecting) return;
    isConnecting = true;
    void refreshAuthToken().then(() => socket?.connect());
  },

  disconnect() {
    isConnecting = false;
    lastErrorLogAt = 0;
    authRefresher = null;
    if (socket) {
      socket.removeAllListeners();
      socket.io.removeAllListeners();
      socket.disconnect();
      socket = null;
      listeners.clear();
    }
  },

  emit(event: string, ...args: any[]) {
    if (socket) {
      socket.emit(event, ...args);
    } else {
      console.warn(`[SocketManager] Missed emit: "${event}". Socket null.`);
    }
  },

  on(event: string, cb: (...args: any[]) => void): () => void {
    if (!listeners.has(event)) {
      listeners.set(event, new Set());
    }
    listeners.get(event)!.add(cb);

    return () => {
      const eventListeners = listeners.get(event);
      if (eventListeners) {
        eventListeners.delete(cb);
        if (eventListeners.size === 0) listeners.delete(event);
      }
    };
  },

  get connected() {
    return socket?.connected ?? false;
  },
};
