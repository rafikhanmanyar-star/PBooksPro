import React, { useState, useEffect } from 'react';
import { RefreshCw, X, Clock } from 'lucide-react';
import { versionService } from '../../services/versionService';

interface VersionUpdateNotificationProps {
  onUpdateRequested?: () => void;
}

export const VersionUpdateNotification: React.FC<VersionUpdateNotificationProps> = ({ 
  onUpdateRequested 
}) => {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [serverVersion, setServerVersion] = useState<string>('');
  const [clientVersion, setClientVersion] = useState<string>('');
  const [dismissedUntil, setDismissedUntil] = useState<Date | null>(null);

  useEffect(() => {
    // Check if notification was dismissed
    const dismissed = localStorage.getItem('version_update_dismissed_until');
    if (dismissed) {
      const dismissedDate = new Date(dismissed);
      if (dismissedDate > new Date()) {
        setDismissedUntil(dismissedDate);
        return; // Don't show notification yet
      } else {
        localStorage.removeItem('version_update_dismissed_until');
      }
    }

    // Start periodic version checking
    versionService.startPeriodicCheck((serverVer, clientVer) => {
      const now = new Date();
      const dismissed = localStorage.getItem('version_update_dismissed_until');
      const dismissedDate = dismissed ? new Date(dismissed) : null;
      
      // Only show if not dismissed or dismissal period expired
      if (!dismissedDate || now > dismissedDate) {
        setUpdateAvailable(true);
        setServerVersion(serverVer);
        setClientVersion(clientVer);
        setDismissedUntil(null);
      }
    });

    // Get initial version
    setClientVersion(versionService.getCurrentVersion());

    return () => {
      versionService.stopPeriodicCheck();
    };
  }, []);

  const handleUpdateNow = () => {
    if (onUpdateRequested) {
      onUpdateRequested();
    } else {
      // Default behavior: reload page to get new version
      // Service worker should have already cached the new version
      window.location.reload();
    }
  };

  const handleDismiss = (hours: number = 24) => {
    const dismissUntil = new Date();
    dismissUntil.setHours(dismissUntil.getHours() + hours);
    setDismissedUntil(dismissUntil);
    localStorage.setItem('version_update_dismissed_until', dismissUntil.toISOString());
    setUpdateAvailable(false);
  };

  if (!updateAvailable || (dismissedUntil && new Date() < dismissedUntil)) {
    return null;
  }

  return (
    <div className="fixed top-4 right-4 z-50 w-96 max-w-[calc(100vw-2rem)] animate-slide-in-right">
      <div className="bg-white rounded-lg shadow-xl border border-blue-200 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-blue-500 to-blue-600">
          <div className="flex items-center gap-2 text-white">
            <RefreshCw className="w-5 h-5" />
            <span className="font-semibold text-sm">Update Available</span>
          </div>
          <button
            onClick={() => handleDismiss(24)}
            className="text-white/80 hover:text-white p-1 rounded-md hover:bg-white/20 transition-colors"
            aria-label="Dismiss"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        
        <div className="px-4 py-3 space-y-3">
          <div className="text-sm text-slate-700">
            <p className="font-medium mb-1">A new version is available!</p>
            <p className="text-xs text-slate-500">
              Current: <span className="font-mono">{clientVersion}</span> → 
              New: <span className="font-mono text-blue-600">{serverVersion}</span>
            </p>
          </div>
          
          <div className="flex gap-2">
            <button
              onClick={handleUpdateNow}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-md transition-colors flex items-center justify-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              Update Now
            </button>
            <button
              onClick={() => handleDismiss(1)}
              className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-md transition-colors flex items-center gap-1"
              title="Remind me in 1 hour"
            >
              <Clock className="w-4 h-4" />
              Later
            </button>
          </div>
          
          <div className="text-xs text-slate-400 text-center">
            You can continue working - the update will only apply when you choose
          </div>
        </div>
      </div>
    </div>
  );
};
