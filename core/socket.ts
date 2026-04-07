import { io, type Socket } from 'socket.io-client';
import { getWsServerUrl } from '../config/apiUrl';

let socket: Socket | null = null;

export function getRealtimeSocket(): Socket | null {
  return socket;
}

/** Connects to the API host WebSocket (same origin as REST). Call only in LAN/API mode with a valid JWT. */
export function connectRealtimeSocket(token: string): Socket {
  if (socket && socket.auth && typeof socket.auth === 'object' && (socket.auth as { token?: string }).token === token && socket.connected) {
    return socket;
  }
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
  socket = io(getWsServerUrl(), {
    auth: { token },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelayMax: 10000,
  });
  return socket;
}

export function disconnectRealtimeSocket(): void {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
}
