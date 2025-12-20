
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface PWAContextType {
  installPrompt: any;
  isInstalled: boolean;
  showInstallPrompt: () => void;
  isUpdateAvailable: boolean;
  checkForUpdates: () => Promise<void>;
  applyUpdate: () => void;
}

const PWAContext = createContext<PWAContextType | undefined>(undefined);

export const PWAProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isUpdateAvailable, setIsUpdateAvailable] = useState(false);
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);

  useEffect(() => {
    const handler = (e: any) => {
      e.preventDefault();
      setInstallPrompt(e);
      console.log('Capture Install Prompt');
    };

    window.addEventListener('beforeinstallprompt', handler);

    if (window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone === true) {
      setIsInstalled(true);
    }

    const appInstalledHandler = () => {
        setIsInstalled(true);
        setInstallPrompt(null);
        console.log('App Installed');
    };
    window.addEventListener('appinstalled', appInstalledHandler);

    // Service Worker Update Handling
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then(reg => {
        setRegistration(reg);
        
        // Check if there is already a waiting worker
        if (reg.waiting) {
            setIsUpdateAvailable(true);
        }

        // Listen for new workers
        reg.addEventListener('updatefound', () => {
            const newWorker = reg.installing;
            if (newWorker) {
                newWorker.addEventListener('statechange', () => {
                    if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                        // New content is available; please refresh.
                        setIsUpdateAvailable(true);
                    }
                });
            }
        });
      });

      // Reload when the new worker takes control
      let refreshing = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!refreshing) {
            refreshing = true;
            window.location.reload();
        }
      });
    }

    return () => {
        window.removeEventListener('beforeinstallprompt', handler);
        window.removeEventListener('appinstalled', appInstalledHandler);
    };
  }, []);

  const showInstallPrompt = () => {
    if (installPrompt) {
      installPrompt.prompt();
      installPrompt.userChoice.then((choiceResult: { outcome: string }) => {
        if (choiceResult.outcome === 'accepted') {
          console.log('User accepted the install prompt');
          setInstallPrompt(null);
        } else {
          console.log('User dismissed the install prompt');
        }
      });
    }
  };

  const checkForUpdates = async () => {
      if (registration) {
          try {
              await registration.update();
          } catch (e) {
              console.error("Failed to check for updates", e);
          }
      }
  };

  const applyUpdate = () => {
      if (registration && registration.waiting) {
          registration.waiting.postMessage({ type: 'SKIP_WAITING' });
      }
  };

  return (
    <PWAContext.Provider value={{ installPrompt, isInstalled, showInstallPrompt, isUpdateAvailable, checkForUpdates, applyUpdate }}>
      {children}
    </PWAContext.Provider>
  );
};

export const usePWA = () => {
  const context = useContext(PWAContext);
  if (!context) {
    throw new Error('usePWA must be used within a PWAProvider');
  }
  return context;
};
