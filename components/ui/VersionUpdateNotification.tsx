import React, { useState, useEffect } from 'react';
import { RefreshCw, X } from 'lucide-react';
import {
  getEmbeddedBuildVersion,
  versionCheck,
} from '../../services/versionCheck';
import { useFeatures } from '../../hooks/useFeatures';

interface VersionUpdateNotificationProps {
  onUpdateRequested?: () => void;
}

export const VersionUpdateNotification: React.FC<VersionUpdateNotificationProps> = ({
  onUpdateRequested,
}) => {
  const { features } = useFeatures();
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [serverVersion, setServerVersion] = useState<string>('');
  const [clientVersion, setClientVersion] = useState<string>('');
  const [dismissedUntil, setDismissedUntil] = useState<Date | null>(null);

  useEffect(() => {
    if (!features.applicationUpdates) {
      versionCheck.stop();
      setUpdateAvailable(false);
      return;
    }

    const dismissed = localStorage.getItem('version_update_dismissed_until');
    if (dismissed) {
      const dismissedDate = new Date(dismissed);
      if (dismissedDate > new Date()) {
        setDismissedUntil(dismissedDate);
        return;
      }
      localStorage.removeItem('version_update_dismissed_until');
    }

    versionCheck.start((serverVer, clientVer) => {
      const now = new Date();
      const storedDismiss = localStorage.getItem('version_update_dismissed_until');
      const dismissedDate = storedDismiss ? new Date(storedDismiss) : null;

      if (!dismissedDate || now > dismissedDate) {
        setUpdateAvailable(true);
        setServerVersion(serverVer);
        setClientVersion(clientVer);
        setDismissedUntil(null);
      }
    });

    setClientVersion(getEmbeddedBuildVersion());

    return () => {
      versionCheck.stop();
    };
  }, [features.applicationUpdates]);

  if (!features.applicationUpdates) {
    return null;
  }

  const handleRefreshNow = () => {
    if (onUpdateRequested) {
      onUpdateRequested();
    } else {
      versionCheck.reloadForUpdate();
    }
  };

  const handleLater = (hours: number = 1) => {
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
      <div className="ds-notification-card border-blue-200 dark:border-blue-900/60">
        <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-blue-500 to-blue-600">
          <div className="flex items-center gap-2 text-white">
            <RefreshCw className="w-5 h-5" />
            <span className="font-semibold text-sm">New version available</span>
          </div>
          <button
            onClick={() => handleLater(1)}
            className="text-white/80 hover:text-white p-1 rounded-md hover:bg-white/20 transition-colors"
            aria-label="Dismiss"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-4 py-3 space-y-3">
          <div className="text-sm text-app-text">
            <p className="font-medium mb-1">
              A newer version of PBooksPro has been deployed.
            </p>
            <p className="text-xs text-app-muted">
              Current: <span className="font-mono">{clientVersion}</span>
              {' → '}
              New: <span className="font-mono text-ds-primary">{serverVersion}</span>
            </p>
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleRefreshNow}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-md transition-colors flex items-center justify-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh Now
            </button>
            <button
              onClick={() => handleLater(1)}
              className="px-4 py-2 text-sm text-app-muted hover:text-app-text hover:bg-app-toolbar rounded-md transition-colors"
            >
              Later
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
