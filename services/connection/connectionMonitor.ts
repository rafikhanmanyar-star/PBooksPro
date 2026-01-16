/**
 * Connection Monitor
 * 
 * Monitors online/offline status and cloud database connectivity.
 * Provides real-time status updates for the application.
 */

import { getCloudPostgreSQLService } from '../database/postgresqlCloudService';
import { apiClient } from '../api/client';

export type ConnectionStatus = 'online' | 'offline' | 'checking';

export interface ConnectionMonitorCallbacks {
  onStatusChange?: (status: ConnectionStatus) => void;
  onOnline?: () => void;
  onOffline?: () => void;
}

class ConnectionMonitor {
  private status: ConnectionStatus = 'checking';
  private callbacks: ConnectionMonitorCallbacks = {};
  private checkInterval: number | null = null;
  private isMonitoring = false;
  private lastCheckTime: number = 0;
  private checkIntervalMs = 30000; // Check every 30 seconds

  constructor() {
    // Listen to browser online/offline events
    if (typeof window !== 'undefined') {
      window.addEventListener('online', this.handleOnline);
      window.addEventListener('offline', this.handleOffline);
    }
  }

  /**
   * Start monitoring connection status
   */
  startMonitoring(callbacks?: ConnectionMonitorCallbacks): void {
    if (this.isMonitoring) {
      return;
    }

    this.callbacks = callbacks || {};
    this.isMonitoring = true;

    // Initial check
    this.checkStatus();

    // Periodic checks
    this.checkInterval = window.setInterval(() => {
      this.checkStatus();
    }, this.checkIntervalMs);
  }

  /**
   * Stop monitoring connection status
   */
  stopMonitoring(): void {
    this.isMonitoring = false;
    if (this.checkInterval !== null) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  /**
   * Check current connection status
   */
  async checkStatus(): Promise<ConnectionStatus> {
    const now = Date.now();
    
    // Throttle checks (don't check more than once per 5 seconds)
    if (now - this.lastCheckTime < 5000) {
      return this.status;
    }

    this.lastCheckTime = now;
    const previousStatus = this.status;
    this.status = 'checking';

    try {
      // Check browser online status first - if offline, trust it immediately
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        this.status = 'offline';
        if (previousStatus !== 'offline') {
          this.notifyStatusChange('offline');
        }
        return this.status;
      }

      // Check cloud database health
      const cloudService = getCloudPostgreSQLService();
      let isHealthy = false;
      
      if (cloudService.isReady()) {
        isHealthy = await cloudService.healthCheck();
      } else {
        // Try API health check as fallback
        // Health endpoint is at /health (not /api/health)
        // ApiClient base URL already includes /api, so we need to remove it
        const baseUrl = apiClient.getBaseUrl();
        const healthUrl = baseUrl.replace(/\/api$/, '') + '/health';
        
        try {
          const response = await fetch(healthUrl, {
            method: 'GET',
            signal: AbortSignal.timeout(10000), // 10 second timeout
            cache: 'no-cache',
          });
          isHealthy = response.ok;
        } catch (error) {
          console.warn('[ConnectionMonitor] Health check failed:', error);
          // If health check fails but browser says online, assume online
          // This is optimistic - data operations will fail gracefully if actually offline
          isHealthy = true; // Trust browser's online status
        }
      }

      // Set status based on health check
      this.status = isHealthy ? 'online' : 'offline';

      // Notify if status changed
      if (previousStatus !== this.status) {
        this.notifyStatusChange(this.status);
      }

      return this.status;
    } catch (error) {
      console.warn('[ConnectionMonitor] Status check failed:', error);
      // If browser says online, trust it (optimistic approach)
      // Data operations will fail gracefully if actually offline
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        this.status = 'online';
      } else {
        this.status = 'offline';
      }
      
      if (previousStatus !== this.status) {
        this.notifyStatusChange(this.status);
      }
      return this.status;
    }
  }

  /**
   * Get current status (synchronous, may be stale)
   */
  getStatus(): ConnectionStatus {
    return this.status;
  }

  /**
   * Check if currently online
   */
  isOnline(): boolean {
    return this.status === 'online';
  }

  /**
   * Check if currently offline
   */
  isOffline(): boolean {
    return this.status === 'offline';
  }

  /**
   * Handle browser online event
   */
  private handleOnline = (): void => {
    console.log('[ConnectionMonitor] Browser online event detected');
    // Recheck status when browser comes online
    setTimeout(() => {
      this.checkStatus();
    }, 1000);
  };

  /**
   * Handle browser offline event
   */
  private handleOffline = (): void => {
    console.log('[ConnectionMonitor] Browser offline event detected');
    this.status = 'offline';
    this.notifyStatusChange('offline');
  };

  /**
   * Notify callbacks of status change
   */
  private notifyStatusChange(status: ConnectionStatus): void {
    if (this.callbacks.onStatusChange) {
      this.callbacks.onStatusChange(status);
    }

    if (status === 'online' && this.callbacks.onOnline) {
      this.callbacks.onOnline();
    }

    if (status === 'offline' && this.callbacks.onOffline) {
      this.callbacks.onOffline();
    }
  }

  /**
   * Cleanup
   */
  destroy(): void {
    this.stopMonitoring();
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', this.handleOnline);
      window.removeEventListener('offline', this.handleOffline);
    }
  }
}

// Singleton instance
let connectionMonitorInstance: ConnectionMonitor | null = null;

export function getConnectionMonitor(): ConnectionMonitor {
  if (!connectionMonitorInstance) {
    connectionMonitorInstance = new ConnectionMonitor();
  }
  return connectionMonitorInstance;
}
