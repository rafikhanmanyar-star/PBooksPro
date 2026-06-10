import { io, type Socket } from 'socket.io-client';
import { getWsServerUrl } from '../config/apiUrl';

let socket: Socket | null = null;
let activeToken: string | null = null;

export function getRealtimeSocket(): Socket | null {
  return socket;
}

function isSameToken(token: string): boolean {
  return (
    activeToken === token &&
    socket != null &&
    socket.auth != null &&
    typeof socket.auth === 'object' &&
    (socket.auth as { token?: string }).token === token
  );
}

/** Connects to the API host WebSocket (same origin as REST). Call only in LAN/API mode with a valid JWT. */
export function connectRealtimeSocket(token: string): Socket {
  // Reuse in-flight or established connection for the same token (Sidebar, ChatModal, AppContext share one socket).
  if (isSameToken(token) && socket && (socket.connected || socket.active)) {
    return socket;
  }
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
    activeToken = null;
  }
  activeToken = token;
  socket = io(getWsServerUrl(), {
    auth: { token },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelayMax: 10000,
  });
  return socket;
}

/** Force disconnect (logout / unauthenticated). Clears the shared socket for all consumers. */
export function disconnectRealtimeSocket(): void {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
    activeToken = null;
  }
}
