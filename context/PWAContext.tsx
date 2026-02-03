
import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';

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
  const isUserInitiatedUpdate = useRef(false);

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
    // Only use service worker if not in Electron (service workers don't work with file:// protocol)
    const isElectron = typeof window !== 'undefined' && (window as any).electronAPI !== undefined;
    
    if ('serviceWorker' in navigator && !isElectron) {
      // Add timeout to prevent hanging if service worker registration was removed
      const readyPromise = navigator.serviceWorker.ready;
      const timeoutPromise = new Promise<ServiceWorkerRegistration>((_, reject) => {
        setTimeout(() => reject(new Error('Service worker ready timeout')), 5000);
      });

      Promise.race([readyPromise, timeoutPromise])
        .then(reg => {
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
        })
        .catch(err => {
          // Service worker not available or timed out - this is expected in Electron or if registration was removed
          console.log('Service worker not available:', err.message);
          setRegistration(null);
        });

      // REMOVED: Automatic reload on controllerchange
      // Only reload when user explicitly requests update via applyUpdate()
      // The controllerchange event will still fire, but we won't auto-reload
      // This allows the update notification to show and wait for user consent
      // The service worker will wait in "waiting" state until user clicks "Update Now"
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
          // Mark that this is a user-initiated update
          isUserInitiatedUpdate.current = true;
          
          // Send message to service worker to skip waiting
          registration.waiting.postMessage({ type: 'SKIP_WAITING' });
          
          // Reload page after a short delay to allow service worker to activate
          setTimeout(() => {
              window.location.reload();
          }, 500);
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
