import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server as HTTPServer } from 'http';
import jwt from 'jsonwebtoken';
import { getDatabaseService } from './databaseService.js';

interface AuthenticatedSocket extends Socket {
  userId?: string;
  tenantId?: string;
  username?: string;
  role?: string;
}

interface UserSocket {
  socketId: string;
  userId: string;
  tenantId: string;
}

/**
 * WebSocket Service for Real-Time Synchronization
 * Handles tenant-scoped pub/sub for real-time updates
 */
export class WebSocketService {
  private io: SocketIOServer | null = null;
  private connectedClients: Map<string, Set<string>> = new Map(); // tenantId -> Set of socketIds
  private userSockets: Map<string, UserSocket> = new Map(); // socketId -> UserSocket

  /**
   * Initialize WebSocket server
   */
  initialize(httpServer: HTTPServer, corsOrigins: string[] | string = '*'): SocketIOServer {
    this.io = new SocketIOServer(httpServer, {
      cors: {
        origin: corsOrigins,
        methods: ['GET', 'POST'],
        credentials: true,
      },
      transports: ['websocket', 'polling'],
    });

    // Authentication middleware
    this.io.use(async (socket: AuthenticatedSocket, next) => {
      try {
        const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');
        
        if (!token) {
          return next(new Error('Authentication token required'));
        }

        if (!process.env.JWT_SECRET) {
          return next(new Error('JWT_SECRET not configured'));
        }

        // Verify JWT token
        const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
        
        // Verify user exists and is active
        const db = getDatabaseService();
        const users = await db.query(
          'SELECT * FROM users WHERE id = $1 AND tenant_id = $2 AND is_active = TRUE',
          [decoded.userId, decoded.tenantId]
        );

        if (users.length === 0) {
          return next(new Error('User not found or inactive'));
        }

        const user = users[0];

        // Attach user info to socket
        socket.userId = user.id;
        socket.tenantId = user.tenant_id;
        socket.username = user.username;
        socket.role = user.role;

        next();
      } catch (error: any) {
        console.error('WebSocket authentication error:', error);
        next(new Error('Authentication failed'));
      }
    });

    // Connection handler
    this.io.on('connection', (socket: AuthenticatedSocket) => {
      const tenantId = socket.tenantId!;
      const userId = socket.userId!;

      console.log(`✅ WebSocket connected: User ${userId} from tenant ${tenantId} (socket: ${socket.id})`);

      // Join tenant-specific room
      socket.join(`tenant:${tenantId}`);

      // Track connected clients
      if (!this.connectedClients.has(tenantId)) {
        this.connectedClients.set(tenantId, new Set());
      }
      this.connectedClients.get(tenantId)!.add(socket.id);
      
      // Track user socket mapping
      this.userSockets.set(socket.id, {
        socketId: socket.id,
        userId: userId,
        tenantId: tenantId
      });

      // Emit connection status to other clients in the tenant
      socket.to(`tenant:${tenantId}`).emit('user:connected', {
        userId,
        username: socket.username,
        timestamp: new Date().toISOString(),
      });

      // Handle disconnection
      socket.on('disconnect', () => {
        console.log(`❌ WebSocket disconnected: User ${userId} from tenant ${tenantId} (socket: ${socket.id})`);
        
        // Remove from tracking
        const tenantClients = this.connectedClients.get(tenantId);
        if (tenantClients) {
          tenantClients.delete(socket.id);
          if (tenantClients.size === 0) {
            this.connectedClients.delete(tenantId);
          }
        }
        
        // Remove from user sockets
        this.userSockets.delete(socket.id);

        // Emit disconnection status
        socket.to(`tenant:${tenantId}`).emit('user:disconnected', {
          userId,
          username: socket.username,
          timestamp: new Date().toISOString(),
        });
      });

      // Handle ping/pong for connection health
      socket.on('ping', () => {
        socket.emit('pong', { timestamp: new Date().toISOString() });
      });
    });

    console.log('✅ WebSocket service initialized');
    return this.io;
  }

  /**
   * Emit event to all clients in a tenant
   */
  emitToTenant(tenantId: string, event: string, data: any): void {
    if (!this.io) {
      console.warn('WebSocket server not initialized');
      return;
    }

    this.io.to(`tenant:${tenantId}`).emit(event, {
      ...data,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Emit event to all clients except the sender
   */
  emitToTenantExcept(tenantId: string, excludeSocketId: string, event: string, data: any): void {
    if (!this.io) {
      console.warn('WebSocket server not initialized');
      return;
    }

    this.io.to(`tenant:${tenantId}`).except(excludeSocketId).emit(event, {
      ...data,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Get connected clients count for a tenant (socket count, not unique users)
   */
  getConnectedCount(tenantId: string): number {
    return this.connectedClients.get(tenantId)?.size || 0;
  }

  /**
   * Get number of unique users connected to a tenant.
   * One user with multiple tabs/devices counts as 1.
   */
  getUniqueUserCount(tenantId: string): number {
    const socketIds = this.connectedClients.get(tenantId);
    if (!socketIds || socketIds.size === 0) return 0;
    const userIds = new Set<string>();
    for (const sid of socketIds) {
      const us = this.userSockets.get(sid);
      if (us?.userId) userIds.add(us.userId);
    }
    return userIds.size;
  }

  /**
   * Get all connected tenants
   */
  getConnectedTenants(): string[] {
    return Array.from(this.connectedClients.keys());
  }

  /**
   * Emit event to a specific user
   */
  emitToUser(tenantId: string, userId: string, event: string, data: any): void {
    if (!this.io) {
      console.warn('WebSocket server not initialized');
      return;
    }

    // Find all sockets for this user
    const userSockets = Array.from(this.userSockets.values())
      .filter(us => us.userId === userId && us.tenantId === tenantId)
      .map(us => us.socketId);

    if (userSockets.length === 0) {
      console.log(`User ${userId} not connected, message will not be delivered`);
      return;
    }

    // Emit to all sockets for this user (user might have multiple tabs/devices)
    userSockets.forEach(socketId => {
      this.io!.to(socketId).emit(event, {
        ...data,
        timestamp: new Date().toISOString(),
      });
    });
  }

  /**
   * Get IO instance
   */
  getIO(): SocketIOServer | null {
    return this.io;
  }
}

// Singleton instance
let websocketServiceInstance: WebSocketService | null = null;

export function getWebSocketService(): WebSocketService {
  if (!websocketServiceInstance) {
    websocketServiceInstance = new WebSocketService();
  }
  return websocketServiceInstance;
}

