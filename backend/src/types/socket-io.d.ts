import 'socket.io';

declare module 'socket.io' {
  interface SocketData {
    userId?: string;
    tenantId?: string;
    connectedAt?: string;
  }
}
