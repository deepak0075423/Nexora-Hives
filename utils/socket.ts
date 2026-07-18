import { io, Socket } from 'socket.io-client';
import { BASE_URL } from '@/api/axios';

// WebSocket Gateway runs as a separate service on port 4000.
// Override with EXPO_PUBLIC_WS_URL; otherwise derive from the API base URL.
const GATEWAY_URL =
  process.env.EXPO_PUBLIC_WS_URL ||
  BASE_URL.replace(/\/api\/?$/, '').replace(/:\d+$/, '') + ':4000';

let socket: Socket | null = null;

export function connectSocket(token: string): Socket {
  if (socket?.connected) return socket;
  socket = io(GATEWAY_URL, {
    auth: { token },
    transports: ['websocket'],
    reconnectionAttempts: 10,
    reconnectionDelay: 2000,
  });
  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

export function getSocket(): Socket | null {
  return socket;
}
