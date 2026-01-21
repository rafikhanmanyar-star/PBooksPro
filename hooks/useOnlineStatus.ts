/**
 * useOnlineStatus Hook
 * 
 * React hook for accessing online/offline status
 */

import { useState, useEffect } from 'react';
import { getConnectionMonitor } from '../services/connectionMonitor';
import { ConnectionStatus } from '../types/sync';

export const useOnlineStatus = (): {
  isOnline: boolean;
  isOffline: boolean;
  status: ConnectionStatus;
  forceCheck: () => Promise<ConnectionStatus>;
} => {
  const monitor = getConnectionMonitor();
  const [status, setStatus] = useState<ConnectionStatus>(monitor.getStatus());

  useEffect(() => {
    // Subscribe to connection changes
    const unsubscribe = monitor.subscribe((newStatus) => {
      setStatus(newStatus);
    });

    // Cleanup
    return unsubscribe;
  }, []);

  return {
    isOnline: status === 'online',
    isOffline: status === 'offline',
    status,
    forceCheck: () => monitor.forceCheck()
  };
};
