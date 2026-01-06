/**
 * WebSocket Client Service
 * 
 * Handles WebSocket connection to the server for real-time updates
 */

import { io, Socket } from 'socket.io-client';
import { apiClient } from '../api/client';

const WS_BASE_URL = 'https://pbookspro-api.onrender.com';

class WebSocketClientService {
  private socket: Socket | null = null;
  private isConnecting = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private listeners: Map<string, Set<(data: any) => void>> = new Map();

  /**
   * Connect to WebSocket server
   */
  connect(): void {
    if (this.socket?.connected || this.isConnecting) {
      return;
    }

    this.isConnecting = true;
    const token = apiClient.getToken();

    if (!token) {
      console.warn('No auth token available for WebSocket connection');
      this.isConnecting = false;
      return;
    }

    try {
      this.socket = io(WS_BASE_URL, {
        auth: {
          token: token
        },
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionAttempts: this.maxReconnectAttempts
      });

      this.socket.on('connect', () => {
        console.log('✅ WebSocket connected');
        this.isConnecting = false;
        this.reconnectAttempts = 0;
        
        // Set up all registered listeners after connection
        this.listeners.forEach((callbacks, event) => {
          callbacks.forEach(callback => {
            this.socket?.on(event, callback);
          });
        });
      });

      this.socket.on('disconnect', (reason) => {
        console.log('❌ WebSocket disconnected:', reason);
        this.isConnecting = false;
      });

      this.socket.on('connect_error', (error) => {
        console.error('WebSocket connection error:', error);
        this.isConnecting = false;
        this.reconnectAttempts++;
        
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
          console.warn('Max WebSocket reconnection attempts reached');
        }
      });


    } catch (error) {
      console.error('Failed to initialize WebSocket:', error);
      this.isConnecting = false;
    }
  }

  /**
   * Disconnect from WebSocket server
   */
  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.isConnecting = false;
    this.reconnectAttempts = 0;
  }

  /**
   * Listen for a specific event
   */
  on(event: string, callback: (data: any) => void): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);

    // If socket is already connected, register the listener immediately
    if (this.socket?.connected) {
      this.socket.on(event, callback);
    }
  }

  /**
   * Remove event listener
   */
  off(event: string, callback: (data: any) => void): void {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      callbacks.delete(callback);
    }

    if (this.socket) {
      this.socket.off(event, callback);
    }
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.socket?.connected || false;
  }

  /**
   * Reconnect if disconnected
   */
  reconnect(): void {
    if (!this.isConnected() && !this.isConnecting) {
      this.disconnect();
      this.connect();
    }
  }
}

// Singleton instance
let wsClientInstance: WebSocketClientService | null = null;

export function getWebSocketClient(): WebSocketClientService {
  if (!wsClientInstance) {
    wsClientInstance = new WebSocketClientService();
  }
  return wsClientInstance;
}

