/**
 * Mobile Offline Warning Component
 * 
 * Displays a warning banner when mobile device is offline
 * Mobile devices require internet connection to use the app
 */

import React from 'react';
import { useConnectionStatus } from '../../hooks/useConnectionStatus';
import { isMobileDevice } from '../../utils/platformDetection';

const MobileOfflineWarning: React.FC = () => {
  const { isOffline, isChecking } = useConnectionStatus();
  const isMobile = isMobileDevice();

  // Only show on mobile devices when offline
  if (!isMobile || !isOffline || isChecking) {
    return null;
  }

  return (
    <div className="fixed top-16 left-0 right-0 z-40 bg-red-50 border-b border-red-200 shadow-sm">
      <div className="px-4 py-3">
        <div className="flex items-center gap-3">
          {/* Warning Icon */}
          <div className="flex-shrink-0">
            <svg 
              className="w-5 h-5 text-red-600" 
              fill="none" 
              viewBox="0 0 24 24" 
              stroke="currentColor"
            >
              <path 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                strokeWidth={2} 
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" 
              />
            </svg>
          </div>

          {/* Message */}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-red-900">
              Internet connection required
            </p>
            <p className="text-xs text-red-700 mt-0.5">
              This app requires an active internet connection on mobile devices. Please check your connection.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MobileOfflineWarning;
