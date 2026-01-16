/**
 * Connection Status Indicator Component
 * 
 * Displays real-time connection status (online/offline/checking)
 * Uses the new useConnectionStatus hook
 */

import React from 'react';
import { useConnectionStatus } from '../../hooks/useConnectionStatus';
import { isMobileDevice } from '../../utils/platformDetection';

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
        <span className="text-xs font-medium text-slate-700 hidden sm:inline">
          {statusDisplay.text}
        </span>
      )}
      {isMobile && isOffline && (
        <span className="text-xs text-red-600 font-medium hidden sm:inline">
          (Internet required)
        </span>
      )}
    </div>
  );
};

export default ConnectionStatusIndicator;
