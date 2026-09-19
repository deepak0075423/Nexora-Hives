import { AppState } from 'react-native';
import { io, Socket } from 'socket.io-client';
import { BASE_URL } from '@/api/axios';
import storage from '@/utils/storage';

// WebSocket Gateway runs as a separate service on port 4000.
// Override with EXPO_PUBLIC_WS_URL; otherwise derive from the API base URL.
const GATEWAY_URL =
  process.env.EXPO_PUBLIC_WS_URL ||
  BASE_URL.replace(/\/api\/?$/, '').replace(/:\d+$/, '') + ':4000';

let socket: Socket | null = null;

export type SocketState = 'connecting' | 'connected' | 'offline';
let state: SocketState = 'offline';
const stateListeners = new Set<(s: SocketState) => void>();
function setState(next: SocketState) {
  if (next === state) return;
  state = next;
  stateListeners.forEach((fn) => { try { fn(state); } catch { /* listener's problem */ } });
}

/**
 * One socket for the whole app. `token` is only a hint — the socket reads the
 * current token from storage on every (re)connect, so a refreshed token is used
 * and a reconnect after the old one expired is not refused for good.
 */
export function connectSocket(_token?: string): Socket {
  if (socket) return socket;
  socket = io(GATEWAY_URL, {
    auth: (cb) => { storage.getItem('token').then((token) => cb({ token })).catch(() => cb({})); },
    transports: ['websocket'],
    // Keep trying for as long as the app is open — giving up after ten
    // attempts left the app silently deaf until it was restarted.
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000,
  });
  setState('connecting');
  socket.on('connect', () => setState('connected'));
  socket.on('disconnect', (reason) => {
    // The server hung up on purpose — socket.io will not retry that itself.
    if (reason === 'io server disconnect') socket?.connect();
    setState('connecting');
  });
  socket.on('connect_error', () => setState('connecting'));
  watchAppState();
  return socket;
}

// Coming back to the foreground should not wait out the reconnect backoff.
let watching = false;
function watchAppState() {
  if (watching) return;
  watching = true;
  AppState.addEventListener('change', (s) => {
    if (s === 'active' && socket && !socket.connected) socket.connect();
  });
}

export function disconnectSocket() {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
  setState('offline');
}

export function getSocket(): Socket | null {
  return socket;
}

export const socketState = () => state;

export function onSocketState(fn: (s: SocketState) => void) {
  stateListeners.add(fn);
  return () => { stateListeners.delete(fn); };
}

/** Emit and wait for the gateway's acknowledgement; rejects when not connected or on timeout. */
export function emitWithAck<T = any>(event: string, payload: any, timeoutMs = 8000): Promise<T> {
  return new Promise((resolve, reject) => {
    if (!socket || !socket.connected) { reject(new Error('not connected')); return; }
    socket.timeout(timeoutMs).emit(event, payload, (err: any, res: T) => {
      if (err) reject(err); else resolve(res);
    });
  });
}
