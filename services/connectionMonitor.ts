/**
 * Connection Monitor Service
 * 
 * Monitors internet connectivity status and emits events on changes.
 * Uses navigator.onLine API and browser online/offline events.
 */

import { ConnectionStatus } from '../types/sync';
import { getApiBaseUrl } from '../config/apiUrl';

type ConnectionChangeListener = (status: ConnectionStatus) => void;

class ConnectionMonitor {
  private listeners: Set<ConnectionChangeListener> = new Set();
  private currentStatus: ConnectionStatus = 'checking';
  private checkInterval?: number;
  private isInitialized = false;
  private consecutiveHealthCheckFailures = 0;

  constructor() {
    this.initialize();
  }

  /**
   * Initialize connection monitoring
   */
  private initialize(): void {
    if (this.isInitialized) return;

    // In Electron (file://), navigator.onLine is often false; start as online and let health check verify
    const isElectron = typeof window !== 'undefined' && (window as unknown as { electronAPI?: { isElectron?: boolean } }).electronAPI?.isElectron;
    this.currentStatus = (navigator.onLine || isElectron) ? 'online' : 'offline';
    
    // Listen to browser events
    window.addEventListener('online', this.handleOnline);
    window.addEventListener('offline', this.handleOffline);

    // Periodic health check (every 30 seconds when online)
    this.startPeriodicCheck();

    // Store initial status
    this.storeStatus();

    this.isInitialized = true;
    console.log('🌐 Connection Monitor initialized. Status:', this.currentStatus);
  }

  /**
   * Handle online event
   */
  private handleOnline = (): void => {
    console.log('🌐 Browser reports: ONLINE');
    this.consecutiveHealthCheckFailures = 0;
    this.updateStatus('online');
  };

  /**
   * Handle offline event
   */
  private handleOffline = (): void => {
    console.log('🌐 Browser reports: OFFLINE');
    this.updateStatus('offline');
  };

  /**
   * Update connection status and notify listeners
   */
  private updateStatus(newStatus: ConnectionStatus): void {
    const oldStatus = this.currentStatus;
    
    if (oldStatus !== newStatus) {
      this.currentStatus = newStatus;
      this.storeStatus();
      
      console.log(`🌐 Connection status changed: ${oldStatus} → ${newStatus}`);
      
      // Notify all listeners
      this.listeners.forEach(listener => {
        try {
          listener(newStatus);
        } catch (error) {
          console.error('Error in connection change listener:', error);
        }
      });

      // Dispatch custom event for non-React components
      window.dispatchEvent(new CustomEvent('connection:change', { 
        detail: { status: newStatus, previousStatus: oldStatus } 
      }));
    }
  }

  /**
   * Store status in localStorage for persistence
   */
  private storeStatus(): void {
    try {
      localStorage.setItem('connection_status', JSON.stringify({
        status: this.currentStatus,
        timestamp: Date.now()
      }));
    } catch (error) {
      console.warn('Failed to store connection status:', error);
    }
  }

  /**
   * Start periodic connection check with backoff on consecutive failures
   */
  private startPeriodicCheck(): void {
    const scheduleNext = () => {
      const baseMs = 30000;
      const intervalMs = Math.min(
        baseMs * Math.pow(2, this.consecutiveHealthCheckFailures),
        5 * 60 * 1000 // cap at 5 minutes
      );
      this.checkInterval = window.setTimeout(() => {
        if (navigator.onLine) {
          this.performHealthCheck();
        }
        scheduleNext();
      }, intervalMs);
    };
    scheduleNext();
  }

  /**
   * Perform API health check (optional)
   * Can be used to verify actual internet connectivity vs browser status
   */
  private async performHealthCheck(): Promise<void> {
    try {
      const baseUrl = getApiBaseUrl();
      const healthUrl = baseUrl.replace(/\/api\/?$/, '') + '/health';
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(healthUrl, {
        method: 'GET',
        cache: 'no-cache',
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        this.consecutiveHealthCheckFailures = 0;
        if (this.currentStatus !== 'online') {
          this.updateStatus('online');
        }
      } else {
        this.consecutiveHealthCheckFailures++;
        if (this.currentStatus !== 'offline') {
          this.updateStatus('offline');
        }
      }
    } catch (error) {
      this.consecutiveHealthCheckFailures++;
      if (this.currentStatus !== 'offline') {
        console.warn('Health check failed, marking as offline:', error);
        this.updateStatus('offline');
      }
    }
  }

  /**
   * Get current connection status
   */
  getStatus(): ConnectionStatus {
    return this.currentStatus;
  }

  /**
   * Check if currently online
   */
  isOnline(): boolean {
    return this.currentStatus === 'online';
  }

  /**
   * Check if currently offline
   */
  isOffline(): boolean {
    return this.currentStatus === 'offline';
  }

  /**
   * Subscribe to connection changes
   */
  subscribe(listener: ConnectionChangeListener): () => void {
    this.listeners.add(listener);
    
    // Return unsubscribe function
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Force a connection check
   */
  async forceCheck(): Promise<ConnectionStatus> {
    console.log('🌐 Forcing connection check...');
    
    // Check browser status first
    const browserStatus = navigator.onLine ? 'online' : 'offline';
    
    if (!navigator.onLine) {
      this.updateStatus('offline');
      return 'offline';
    }

    // Perform health check
    await this.performHealthCheck();
    
    return this.currentStatus;
  }

  /**
   * Cleanup
   */
  destroy(): void {
    window.removeEventListener('online', this.handleOnline);
    window.removeEventListener('offline', this.handleOffline);
    
    if (this.checkInterval) {
      clearTimeout(this.checkInterval);
    }
    
    this.listeners.clear();
    this.isInitialized = false;
  }
}

// Singleton instance
let connectionMonitorInstance: ConnectionMonitor | null = null;

export const getConnectionMonitor = (): ConnectionMonitor => {
  if (!connectionMonitorInstance) {
    connectionMonitorInstance = new ConnectionMonitor();
  }
  return connectionMonitorInstance;
};

export default ConnectionMonitor;
