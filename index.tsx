
import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import './index.css';
import { setupElectronFocusRecovery } from './utils/electronFocusRecovery';
import { initStabilityLayer } from './services/stability/stabilityLayer';
import { getQueryClient } from './config/queryClient';

// Get root element
const rootElement = document.getElementById('root');

initStabilityLayer();

/**
 * Repair keyboard focus when the window gains focus (e.g. restore from taskbar).
 * If the active element is detached from the DOM or invalid, move focus to body
 * so the next click can focus the correct input. Fixes "keyboard not working"
 * until minimize/restore in Electron on Windows.
 */
const setupFocusRepair = () => {
  if (typeof document === 'undefined' || !document.body) return;
  document.body.setAttribute('tabindex', '-1');
  window.addEventListener('focus', () => {
    const active = document.activeElement;
    if (!active || active === document.body || active === document.documentElement) return;
    if (!document.body.contains(active)) {
      document.body.focus();
    }
  });
};
setupFocusRepair();
setupElectronFocusRecovery();

const showErrorUI = (message: string) => {
  if (rootElement) {
    rootElement.innerHTML = `
        <div style="
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 2rem;
          font-family: system-ui, -apple-system, sans-serif;
          background: #ffffff;
        ">
          <div style="
            background: white;
            padding: 2rem;
            border-radius: 1rem;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
            max-width: 600px;
            text-align: center;
          ">
            <h1 style="color: #b91c1c; margin-bottom: 1rem; font-size: 1.5rem;">Failed to Load Application</h1>
            <p style="color: #64748b; margin-bottom: 1rem;">
              The application failed to load. Please check the browser console (F12) for details.
            </p>
            <div style="
              background: #f8fafc;
              padding: 1rem;
              border-radius: 0.5rem;
              margin: 1rem 0;
              text-align: left;
              font-family: monospace;
              font-size: 0.75rem;
              color: #475569;
              max-height: 200px;
              overflow: auto;
            ">
              ${message}
            </div>
            <button 
              onclick="window.location.reload()"
              style="
                padding: 0.75rem 1.5rem;
                background-color: #4f46e5;
                color: white;
                border: none;
                border-radius: 0.5rem;
                cursor: pointer;
                font-weight: 500;
                margin-top: 1rem;
              "
            >
              Reload Page
            </button>
          </div>
        </div>
      `;
  }
};

const initApp = async () => {
  if (!rootElement) return;

  try {
    console.log('[index] Starting application load...');

    // Import all providers
    const [
      { default: App },
      { AppProvider },
      { ThemeProvider },
      { AuthProvider },
      { CompanyProvider },
      { CompanyGate },
      { ViewportProvider },
      { ProgressProvider },
      { KeyboardProvider },
      { KPIProvider },
      { NotificationProvider },
      { WhatsAppProvider },
      { LicenseProvider },
      { PWAProvider },
      { UpdateProvider },
      { default: ErrorBoundary },
      { PayrollProvider },
      { PrintProvider },
      { SpellCheckerProvider },
    ] = await Promise.all([
      import('./App'),
      import('./context/AppContext'),
      import('./context/ThemeContext'),
      import('./context/AuthContext'),
      import('./context/CompanyContext'),
      import('./components/company/CompanyGate'),
      import('./context/ViewportContext'),
      import('./context/ProgressContext'),
      import('./context/KeyboardContext'),
      import('./context/KPIContext'),
      import('./context/NotificationContext'),
      import('./context/WhatsAppContext'),
      import('./context/LicenseContext'),
      import('./context/PWAContext'),
      import('./context/UpdateContext'),
      import('./components/ErrorBoundary'),
      import('./context/PayrollContext'),
      import('./context/PrintContext'),
      import('./context/SpellCheckerContext'),
    ]);

    const root = ReactDOM.createRoot(rootElement);
    const queryClient = getQueryClient();

    root.render(
      <React.StrictMode>
        <QueryClientProvider client={queryClient}>
        <ErrorBoundary
          onError={(error, errorInfo) => {
            console.error('Top-level error caught:', error, errorInfo);
          }}
        >
          <ThemeProvider>
          <CompanyProvider>
          <ViewportProvider>
          <CompanyGate>
          <AuthProvider>
            <AppProvider>
              <PrintProvider>
                <PWAProvider>
                  <UpdateProvider>
                    <LicenseProvider>
                      <ProgressProvider>
                        <KeyboardProvider>
                          <KPIProvider>
                            <NotificationProvider>
                              <WhatsAppProvider>
                                <PayrollProvider>
                                  <SpellCheckerProvider>
                                    <App />
                                  </SpellCheckerProvider>
                                </PayrollProvider>
                              </WhatsAppProvider>
                            </NotificationProvider>
                          </KPIProvider>
                        </KeyboardProvider>
                      </ProgressProvider>
                    </LicenseProvider>
                  </UpdateProvider>
                </PWAProvider>
              </PrintProvider>
            </AppProvider>
          </AuthProvider>
          </CompanyGate>
          </ViewportProvider>
          </CompanyProvider>
          </ThemeProvider>
        </ErrorBoundary>
        </QueryClientProvider>
      </React.StrictMode>
    );
  } catch (error) {
    console.error('❌ Failed to load application:', error);
    showErrorUI(error instanceof Error ? error.message : String(error));
  }
};

// Wait for DOM to be fully ready before initializing React
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
