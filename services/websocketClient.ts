/**
 * WebSocket Client Service
 * 
 * Handles real-time synchronization via WebSocket connection to the server.
 * Provides tenant-scoped event handling for real-time updates.
 */

import { io, Socket } from 'socket.io-client';
import { logger } from './logger';
import { apiClient } from './api/client';

// WebSocket server URL (same base as API)
const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://pbookspro-api.onrender.com/api';
const WS_SERVER_URL = import.meta.env.VITE_WS_URL || API_BASE_URL.replace(/\/api\/?$/, '');

export interface WebSocketEvent {
  type: string;
  data: any;
  timestamp: string;
  userId?: string;
  username?: string;
}

export type WebSocketEventHandler = (data: any) => void;

export type WebSocketConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface WebSocketDebugState {
  status: WebSocketConnectionStatus;
  serverUrl: string;
  tenantId: string | null;
  lastEvent?: {
    type: string;
    timestamp: string;
    data: any;
  };
  lastStatusAt?: string;
  lastError?: string;
}

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
  private isRefreshingAuth: boolean = false;
  private debugState: WebSocketDebugState = {
    status: 'disconnected',
    serverUrl: WS_SERVER_URL,
    tenantId: null,
  };

  /**
   * Initialize WebSocket connection
   */
  connect(token?: string, tenantId?: string): void {
    if (this.socket?.connected) {
      logger.logCategory('websocket', 'WebSocket already connected');
      return;
    }

    if (this.isConnecting) {
      logger.logCategory('websocket', 'WebSocket connection already in progress');
      return;
    }

    const resolvedToken = token ?? (typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null);
    const resolvedTenantId = tenantId ?? (typeof window !== 'undefined' ? localStorage.getItem('tenant_id') : null);

    if (!resolvedToken || !resolvedTenantId) {
      logger.warnCategory('websocket', 'Missing auth token or tenant ID, cannot connect WebSocket');
      this.isConnecting = false;
      return;
    }

    this.token = resolvedToken;
    this.tenantId = resolvedTenantId;
    this.debugState = {
      ...this.debugState,
      status: 'connecting',
      tenantId: resolvedTenantId,
      lastStatusAt: new Date().toISOString(),
      lastError: undefined,
    };
    this.isConnecting = true;

    logger.logCategory('websocket', '🔌 Connecting to WebSocket server...');

    try {
      this.socket = io(WS_SERVER_URL, {
        auth: {
          token: resolvedToken,
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
      this.debugState = {
        ...this.debugState,
        status: 'connected',
        lastStatusAt: new Date().toISOString(),
        lastError: undefined,
      };
    });

    this.socket.on('disconnect', (reason) => {
      logger.warnCategory('websocket', '❌ WebSocket disconnected:', reason);
      this.isConnected = false;
      this.isConnecting = false;
      this.debugState = {
        ...this.debugState,
        status: 'disconnected',
        lastStatusAt: new Date().toISOString(),
        lastError: reason ? String(reason) : undefined,
      };

      if (reason === 'io server disconnect') {
        // Server disconnected, reconnect manually
        this.socket?.connect();
      }
    });

    this.socket.on('connect_error', (error) => {
      logger.errorCategory('websocket', 'WebSocket connection error:', error);
      this.isConnecting = false;
      this.isConnected = false;
      this.debugState = {
        ...this.debugState,
        status: 'error',
        lastStatusAt: new Date().toISOString(),
        lastError: error ? String(error) : undefined,
      };
      this.tryRefreshAuth(error);
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

    // Building events
    this.socket.on('building:created', (data: any) => {
      this.handleEvent('building:created', data);
    });

    this.socket.on('building:updated', (data: any) => {
      this.handleEvent('building:updated', data);
    });

    this.socket.on('building:deleted', (data: any) => {
      this.handleEvent('building:deleted', data);
    });

    // Property events
    this.socket.on('property:created', (data: any) => {
      this.handleEvent('property:created', data);
    });

    this.socket.on('property:updated', (data: any) => {
      this.handleEvent('property:updated', data);
    });

    this.socket.on('property:deleted', (data: any) => {
      this.handleEvent('property:deleted', data);
    });

    // Unit events
    this.socket.on('unit:created', (data: any) => {
      this.handleEvent('unit:created', data);
    });

    this.socket.on('unit:updated', (data: any) => {
      this.handleEvent('unit:updated', data);
    });

    this.socket.on('unit:deleted', (data: any) => {
      this.handleEvent('unit:deleted', data);
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
   * Attempt token refresh on auth failures
   */
  private async tryRefreshAuth(error: any): Promise<void> {
    if (this.isRefreshingAuth) return;
    const errorMessage = error?.message || String(error || '');
    const isAuthError = /auth|token|jwt|unauthorized/i.test(errorMessage);
    if (!isAuthError) return;

    const existingToken = this.token ?? (typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null);
    const tenantId = this.tenantId ?? (typeof window !== 'undefined' ? localStorage.getItem('tenant_id') : null);
    if (!existingToken || !tenantId) return;

    this.isRefreshingAuth = true;
    try {
      const baseUrl = apiClient.getBaseUrl();
      const response = await fetch(`${baseUrl}/auth/refresh-token`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${existingToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Refresh failed: ${response.status}`);
      }

      const data = await response.json();
      if (!data?.token) {
        throw new Error('Refresh failed: missing token');
      }

      apiClient.setAuth(data.token, tenantId, false);
      this.token = data.token;
      this.tenantId = tenantId;

      if (this.socket) {
        this.socket.auth = { token: data.token };
        this.socket.connect();
      } else {
        this.connect(data.token, tenantId);
      }
    } catch (refreshError) {
      logger.errorCategory('websocket', 'Token refresh failed:', refreshError);
    } finally {
      this.isRefreshingAuth = false;
    }
  }

  /**
   * Handle event from server
   */
  private handleEvent(eventType: string, data: any): void {
    logger.logCategory('websocket', `📨 Received event: ${eventType}`, data);
    this.debugState = {
      ...this.debugState,
      lastEvent: {
        type: eventType,
        timestamp: new Date().toISOString(),
        data,
      },
    };
    
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
      this.debugState = {
        ...this.debugState,
        status: 'disconnected',
        lastStatusAt: new Date().toISOString(),
      };
    }
  }

  /**
   * Check if WebSocket is connected
   */
  isConnectedToServer(): boolean {
    return this.isConnected && this.socket?.connected === true;
  }

  /**
   * Get current debug state snapshot
   */
  getDebugState(): WebSocketDebugState {
    return {
      ...this.debugState,
      tenantId: this.tenantId,
    };
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

