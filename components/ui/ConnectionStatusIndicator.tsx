/**
 * Connection Status Indicator Component
 * 
 * Displays real-time connection status (online/offline/checking)
 * Uses the new useConnectionStatus hook
 */

import React, { useEffect, useState } from 'react';
import { useConnectionStatus } from '../../hooks/useConnectionStatus';
import { isMobileDevice } from '../../utils/platformDetection';
import { apiClient } from '../../services/api/client';
import { getWebSocketClient } from '../../services/websocketClient';
import { getConnectionMonitor } from '../../services/connection/connectionMonitor';

interface ConnectionStatusIndicatorProps {
  showLabel?: boolean;
  className?: string;
}

const ConnectionStatusIndicator: React.FC<ConnectionStatusIndicatorProps> = ({ 
  showLabel = true,
  className = '' 
}) => {
  const { status, isOnline, isOffline, isChecking } = useConnectionStatus();
  const isMobile = isMobileDevice();
  const [tokenExpired, setTokenExpired] = useState(false);
  const [hasAuth, setHasAuth] = useState(false);

  useEffect(() => {
    const checkAuth = () => {
      const token = apiClient.getToken();
      const tenantId = apiClient.getTenantId();
      setHasAuth(!!token && !!tenantId);
      setTokenExpired(token ? apiClient.isTokenExpired() : false);
    };

    checkAuth();
    const interval = setInterval(checkAuth, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleReconnect = async () => {
    try {
      const monitor = getConnectionMonitor();
      const currentStatus = await monitor.checkStatus();
      if (currentStatus !== 'online') return;

      const token = apiClient.getToken();
      const tenantId = apiClient.getTenantId();
      if (!token || !tenantId || apiClient.isTokenExpired()) return;

      const wsClient = getWebSocketClient();
      wsClient.connect(token, tenantId);
    } catch (error) {
      console.warn('Reconnect failed:', error);
    }
  };

  const handleRenewToken = async () => {
    try {
      const newToken = await apiClient.refreshToken();
      const tenantId = apiClient.getTenantId();
      if (newToken && tenantId) {
        const wsClient = getWebSocketClient();
        wsClient.connect(newToken, tenantId);
        setTokenExpired(false);
      }
    } catch (error) {
      console.warn('Token refresh failed:', error);
    }
  };

  // Determine status display
  const getStatusDisplay = () => {
    if (isChecking) {
      return {
        text: 'Checking...',
        color: 'bg-amber-500',
        dotColor: 'bg-amber-500',
      };
    }
    if (isOnline) {
      return {
        text: 'Online',
        color: 'bg-green-500',
        dotColor: 'bg-green-500',
      };
    }
    return {
      text: 'Offline',
      color: 'bg-red-500',
      dotColor: 'bg-red-500',
    };
  };

  const statusDisplay = getStatusDisplay();
  const authLabel = tokenExpired ? 'Session expired' : hasAuth ? 'Authenticated' : 'Signed out';

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className="relative">
        <div 
          className={`w-2 h-2 rounded-full ${statusDisplay.dotColor} ${
            isChecking ? 'animate-pulse' : ''
          }`}
          title={statusDisplay.text}
          aria-label={`Connection status: ${statusDisplay.text}`}
        />
        {isChecking && (
          <div 
            className={`absolute inset-0 w-2 h-2 rounded-full ${statusDisplay.color} animate-ping opacity-75`}
          />
        )}
      </div>
      {showLabel && (
        <div className="flex items-center gap-2 text-xs font-medium text-slate-700 hidden sm:flex">
          <span>{statusDisplay.text}</span>
          <span className="text-slate-400">•</span>
          <span className={tokenExpired ? 'text-red-600' : 'text-slate-600'}>
            {authLabel}
          </span>
        </div>
      )}
      {isMobile && isOffline && (
        <span className="text-xs text-red-600 font-medium hidden sm:inline">
          (Internet required)
        </span>
      )}
      {(isOffline || tokenExpired) && (
        <div className="hidden sm:flex items-center gap-1">
          {isOffline && (
            <button
              onClick={handleReconnect}
              className="text-[11px] px-2 py-0.5 rounded-full border border-slate-200 text-slate-600 hover:text-slate-900 hover:border-slate-300 transition"
            >
              Reconnect
            </button>
          )}
          {tokenExpired && (
            <button
              onClick={handleRenewToken}
              className="text-[11px] px-2 py-0.5 rounded-full border border-amber-200 text-amber-700 hover:text-amber-800 hover:border-amber-300 transition"
            >
              Renew token
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default ConnectionStatusIndicator;
