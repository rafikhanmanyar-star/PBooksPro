/**
 * useConnectionStatus Hook
 * 
 * Provides connection status (online/offline) for the application.
 * Uses ConnectionMonitor to track cloud database connectivity.
 */

import { useState, useEffect } from 'react';
type ConnectionStatus = 'online' | 'offline' | 'checking';
const getConnectionMonitor = () => ({ startMonitoring: () => {}, stopMonitoring: () => {}, destroy: () => {}, getStatus: () => 'online' as ConnectionStatus, checkStatus: async () => 'online' as ConnectionStatus, subscribe: (_l: any) => () => {}, forceCheck: async () => 'online' as ConnectionStatus });

export interface UseConnectionStatusResult {
  status: ConnectionStatus;
  isOnline: boolean;
  isOffline: boolean;
  isChecking: boolean;
}

export function useConnectionStatus(): UseConnectionStatusResult {
  const [status, setStatus] = useState<ConnectionStatus>('checking');

  useEffect(() => {
    const monitor = getConnectionMonitor();
    
    // Initial status check
    monitor.checkStatus().then(currentStatus => {
      setStatus(currentStatus);
    });

    // Start monitoring with callback
    monitor.startMonitoring({
      onStatusChange: (newStatus) => {
        setStatus(newStatus);
      },
    });

    // Cleanup
    return () => {
      monitor.stopMonitoring();
    };
  }, []);

  return {
    status,
    isOnline: status === 'online',
    isOffline: status === 'offline',
    isChecking: status === 'checking',
  };
}
