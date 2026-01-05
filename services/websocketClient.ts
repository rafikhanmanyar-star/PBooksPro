/**
 * WebSocket Client Service
 * 
 * Handles real-time synchronization via WebSocket connection to the server.
 * Provides tenant-scoped event handling for real-time updates.
 */

import { io, Socket } from 'socket.io-client';
import { logger } from './logger';

// WebSocket server URL (same base as API)
const WS_SERVER_URL = 'https://pbookspro-api.onrender.com';

export interface WebSocketEvent {
  type: string;
  data: any;
  timestamp: string;
  userId?: string;
  username?: string;
}

export type WebSocketEventHandler = (data: any) => void;

export class WebSocketClient {
  private socket: Socket | null = null;
  private token: string | null = null;
  private tenantId: string | null = null;
  private isConnecting: boolean = false;
  private isConnected: boolean = false;
  private eventHandlers: Map<string, Set<WebSocketEventHandler>> = new Map();
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;
  private reconnectDelay: number = 1000; // Start with 1 second

  /**
   * Initialize WebSocket connection
   */
  connect(token: string, tenantId: string): void {
    if (this.socket?.connected) {
      logger.logCategory('websocket', 'WebSocket already connected');
      return;
    }

    if (this.isConnecting) {
      logger.logCategory('websocket', 'WebSocket connection already in progress');
      return;
    }

    this.token = token;
    this.tenantId = tenantId;
    this.isConnecting = true;

    logger.logCategory('websocket', '🔌 Connecting to WebSocket server...');

    try {
      this.socket = io(WS_SERVER_URL, {
        auth: {
          token: token,
        },
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionDelay: this.reconnectDelay,
        reconnectionDelayMax: 10000,
        reconnectionAttempts: this.maxReconnectAttempts,
      });

      this.setupEventHandlers();
    } catch (error) {
      logger.errorCategory('websocket', 'Failed to create WebSocket connection:', error);
      this.isConnecting = false;
    }
  }

  /**
   * Setup event handlers for the socket
   */
  private setupEventHandlers(): void {
    if (!this.socket) return;

    this.socket.on('connect', () => {
      logger.logCategory('websocket', '✅ WebSocket connected');
      this.isConnected = true;
      this.isConnecting = false;
      this.reconnectAttempts = 0;
      this.reconnectDelay = 1000;
    });

    this.socket.on('disconnect', (reason) => {
      logger.warnCategory('websocket', '❌ WebSocket disconnected:', reason);
      this.isConnected = false;
      this.isConnecting = false;

      if (reason === 'io server disconnect') {
        // Server disconnected, reconnect manually
        this.socket?.connect();
      }
    });

    this.socket.on('connect_error', (error) => {
      logger.errorCategory('websocket', 'WebSocket connection error:', error);
      this.isConnecting = false;
      this.isConnected = false;
    });

    // Handle real-time events from server
    // Transaction events
    this.socket.on('transaction:created', (data: any) => {
      this.handleEvent('transaction:created', data);
    });

    this.socket.on('transaction:updated', (data: any) => {
      this.handleEvent('transaction:updated', data);
    });

    this.socket.on('transaction:deleted', (data: any) => {
      this.handleEvent('transaction:deleted', data);
    });

    // Invoice events
    this.socket.on('invoice:created', (data: any) => {
      this.handleEvent('invoice:created', data);
    });

    this.socket.on('invoice:updated', (data: any) => {
      this.handleEvent('invoice:updated', data);
    });

    this.socket.on('invoice:deleted', (data: any) => {
      this.handleEvent('invoice:deleted', data);
    });

    // Bill events
    this.socket.on('bill:created', (data: any) => {
      this.handleEvent('bill:created', data);
    });

    this.socket.on('bill:updated', (data: any) => {
      this.handleEvent('bill:updated', data);
    });

    this.socket.on('bill:deleted', (data: any) => {
      this.handleEvent('bill:deleted', data);
    });

    // Contact events
    this.socket.on('contact:created', (data: any) => {
      this.handleEvent('contact:created', data);
    });

    this.socket.on('contact:updated', (data: any) => {
      this.handleEvent('contact:updated', data);
    });

    this.socket.on('contact:deleted', (data: any) => {
      this.handleEvent('contact:deleted', data);
    });

    // Project events
    this.socket.on('project:created', (data: any) => {
      this.handleEvent('project:created', data);
    });

    this.socket.on('project:updated', (data: any) => {
      this.handleEvent('project:updated', data);
    });

    this.socket.on('project:deleted', (data: any) => {
      this.handleEvent('project:deleted', data);
    });

    // Account events
    this.socket.on('account:created', (data: any) => {
      this.handleEvent('account:created', data);
    });

    this.socket.on('account:updated', (data: any) => {
      this.handleEvent('account:updated', data);
    });

    this.socket.on('account:deleted', (data: any) => {
      this.handleEvent('account:deleted', data);
    });

    // Category events
    this.socket.on('category:created', (data: any) => {
      this.handleEvent('category:created', data);
    });

    this.socket.on('category:updated', (data: any) => {
      this.handleEvent('category:updated', data);
    });

    this.socket.on('category:deleted', (data: any) => {
      this.handleEvent('category:deleted', data);
    });

    // Budget events
    this.socket.on('budget:created', (data: any) => {
      this.handleEvent('budget:created', data);
    });

    this.socket.on('budget:updated', (data: any) => {
      this.handleEvent('budget:updated', data);
    });

    this.socket.on('budget:deleted', (data: any) => {
      this.handleEvent('budget:deleted', data);
    });

    // Rental agreement events
    this.socket.on('rental_agreement:created', (data: any) => {
      this.handleEvent('rental_agreement:created', data);
    });

    this.socket.on('rental_agreement:updated', (data: any) => {
      this.handleEvent('rental_agreement:updated', data);
    });

    this.socket.on('rental_agreement:deleted', (data: any) => {
      this.handleEvent('rental_agreement:deleted', data);
    });

    // Project agreement events
    this.socket.on('project_agreement:created', (data: any) => {
      this.handleEvent('project_agreement:created', data);
    });

    this.socket.on('project_agreement:updated', (data: any) => {
      this.handleEvent('project_agreement:updated', data);
    });

    this.socket.on('project_agreement:deleted', (data: any) => {
      this.handleEvent('project_agreement:deleted', data);
    });

    // Contract events
    this.socket.on('contract:created', (data: any) => {
      this.handleEvent('contract:created', data);
    });

    this.socket.on('contract:updated', (data: any) => {
      this.handleEvent('contract:updated', data);
    });

    this.socket.on('contract:deleted', (data: any) => {
      this.handleEvent('contract:deleted', data);
    });

    // User connection events
    this.socket.on('user:connected', (data: any) => {
      logger.logCategory('websocket', 'User connected:', data);
    });

    this.socket.on('user:disconnected', (data: any) => {
      logger.logCategory('websocket', 'User disconnected:', data);
    });
  }

  /**
   * Handle event from server
   */
  private handleEvent(eventType: string, data: any): void {
    logger.logCategory('websocket', `📨 Received event: ${eventType}`, data);
    
    const handlers = this.eventHandlers.get(eventType);
    if (handlers) {
      handlers.forEach((handler) => {
        try {
          handler(data);
        } catch (error) {
          logger.errorCategory('websocket', `Error in event handler for ${eventType}:`, error);
        }
      });
    }
  }

  /**
   * Subscribe to an event
   */
  on(eventType: string, handler: WebSocketEventHandler): () => void {
    if (!this.eventHandlers.has(eventType)) {
      this.eventHandlers.set(eventType, new Set());
    }
    this.eventHandlers.get(eventType)!.add(handler);

    // Return unsubscribe function
    return () => {
      const handlers = this.eventHandlers.get(eventType);
      if (handlers) {
        handlers.delete(handler);
        if (handlers.size === 0) {
          this.eventHandlers.delete(eventType);
        }
      }
    };
  }

  /**
   * Unsubscribe from an event
   */
  off(eventType: string, handler: WebSocketEventHandler): void {
    const handlers = this.eventHandlers.get(eventType);
    if (handlers) {
      handlers.delete(handler);
      if (handlers.size === 0) {
        this.eventHandlers.delete(eventType);
      }
    }
  }

  /**
   * Disconnect WebSocket
   */
  disconnect(): void {
    if (this.socket) {
      logger.logCategory('websocket', '🔌 Disconnecting WebSocket...');
      this.socket.disconnect();
      this.socket = null;
      this.isConnected = false;
      this.isConnecting = false;
      this.eventHandlers.clear();
    }
  }

  /**
   * Check if WebSocket is connected
   */
  isConnectedToServer(): boolean {
    return this.isConnected && this.socket?.connected === true;
  }

  /**
   * Update authentication token
   */
  updateAuth(token: string, tenantId: string): void {
    if (this.token !== token || this.tenantId !== tenantId) {
      // Reconnect with new credentials
      this.disconnect();
      this.connect(token, tenantId);
    }
  }
}

// Singleton instance
let websocketClientInstance: WebSocketClient | null = null;

export function getWebSocketClient(): WebSocketClient {
  if (!websocketClientInstance) {
    websocketClientInstance = new WebSocketClient();
  }
  return websocketClientInstance;
}

