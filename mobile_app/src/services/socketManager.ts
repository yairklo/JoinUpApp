import { io, Socket } from 'socket.io-client';
import { SOCKET_BASE } from './api/client';

let socket: Socket | null = null;
let isConnecting = false;
let lastErrorLogAt = 0;
let consecutiveFailures = 0;
let reconnectCooldownUntil = 0;
let authRefresher: (() => Promise<string | null>) | null = null;
const listeners: Map<string, Set<(...args: any[]) => void>> = new Map();

const TRANSIENT_ERRORS = new Set(['timeout', 'xhr poll error', 'websocket error', 'transport error']);
const MAX_RECONNECT_ATTEMPTS = 12;
const COOLDOWN_AFTER_FAILURES_MS = 60_000;
const COOLDOWN_FAILURE_THRESHOLD = 4;

/**
 * Normalize base URL for Socket.IO:
 * - strip trailing slash
 * - strip trailing /api (would produce /api/api/socket with path option)
 * - force https:// for remote production hosts (wss:// handshake)
 */
function socketServerUrl(): string {
  let url = String(SOCKET_BASE || '').trim().replace(/\/+$/, '');
  if (!url) return url;

  if (url.endsWith('/api')) {
    url = url.slice(0, -4);
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

function isInCooldown(): boolean {
  return Date.now() < reconnectCooldownUntil;
}

function enterCooldown(reason: string) {
  reconnectCooldownUntil = Date.now() + COOLDOWN_AFTER_FAILURES_MS;
  console.warn(`[SocketManager] Backing off ${COOLDOWN_AFTER_FAILURES_MS / 1000}s (${reason})`);
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

function handleConnectFailure() {
  consecutiveFailures += 1;
  if (consecutiveFailures >= COOLDOWN_FAILURE_THRESHOLD && !isInCooldown()) {
    enterCooldown(`${consecutiveFailures} consecutive failures`);
    socket?.io.reconnection(false);
    setTimeout(() => {
      consecutiveFailures = 0;
      socket?.io.reconnection(true);
      void refreshAuthToken().then(() => {
        if (socket && !socket.connected && !isConnecting) {
          isConnecting = true;
          socket.connect();
        }
      });
    }, COOLDOWN_AFTER_FAILURES_MS);
  }
}

function attachCoreHandlers(active: Socket) {
  active.onAny((event, ...args) => {
    listeners.get(event)?.forEach((cb) => cb(...args));
  });

  active.io.on('reconnect_attempt', () => {
    if (isInCooldown()) return;
    void refreshAuthToken();
  });

  active.on('connect', () => {
    isConnecting = false;
    consecutiveFailures = 0;
    reconnectCooldownUntil = 0;
    console.log('[SocketManager] Connected:', active.id, 'transport:', active.io.engine?.transport?.name);
    listeners.get('connect')?.forEach((cb) => cb());
  });

  active.on('connect_error', (err: Error & { description?: string; type?: string }) => {
    isConnecting = false;
    logConnectError(err);
    void refreshAuthToken();
    handleConnectFailure();
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

function isRemoteProductionHost(): boolean {
  const url = socketServerUrl();
  if (!url || __DEV__) return false;
  return (
    url.startsWith('https://') &&
    !/^https:\/\/(localhost|127\.0\.0\.1|10\.|192\.168\.)/i.test(url)
  );
}

export const SocketManager = {
  /** Called once from AuthGuard so reconnect attempts always use a fresh Clerk JWT. */
  setAuthRefresher(refresher: () => Promise<string | null>) {
    authRefresher = refresher;
  },

  /**
   * Idempotent singleton connect — never destroy/recreate on AppState or token refresh.
   * Polling-first helps behind reverse proxies / load balancers on React Native.
   */
  connect(token: string) {
    if (isInCooldown()) return;

    const authToken = normalizeAuthToken(token);
    if (!authToken) {
      console.warn('[SocketManager] connect() skipped — missing or invalid token');
      return;
    }

    const url = socketServerUrl();
    if (!url) {
      console.error('[SocketManager] Missing EXPO_PUBLIC_SOCKET_URL / EXPO_PUBLIC_API_URL');
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

    const handshakeTimeout = isRemoteProductionHost() ? 45000 : 20000;

    socket = io(url, {
      path: '/api/socket',
      transports: ['polling', 'websocket'],
      upgrade: true,
      rememberUpgrade: true,
      forceNew: false,
      reconnection: true,
      reconnectionAttempts: MAX_RECONNECT_ATTEMPTS,
      reconnectionDelay: 3000,
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
    if (!socket || socket.connected || isConnecting || isInCooldown()) return;
    isConnecting = true;
    void refreshAuthToken().then(() => socket?.connect());
  },

  disconnect() {
    isConnecting = false;
    lastErrorLogAt = 0;
    consecutiveFailures = 0;
    reconnectCooldownUntil = 0;
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
    if (socket?.connected) {
      socket.emit(event, ...args);
    } else if (socket) {
      // Queue nothing — avoid emit storms while server is down
      console.warn(`[SocketManager] Skipped emit "${event}" — socket not connected`);
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
