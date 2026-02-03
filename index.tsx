
import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';

// Get root element
const rootElement = document.getElementById('root');

// Set up comprehensive global error handlers
const setupGlobalErrorHandlers = () => {
  // Unhandled JavaScript errors
  window.addEventListener('error', (event) => {
    console.error('Global Error Detected:', event.error || event.message);
  });

  // Unhandled promise rejections
  window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled Promise Rejection:', event.reason);
  });
};

// Set up error handlers immediately
setupGlobalErrorHandlers();

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
      { AuthProvider },
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
      { InventoryProvider },
      { AccountingProvider },
      { LoyaltyProvider }
    ] = await Promise.all([
      import('./App'),
      import('./context/AppContext'),
      import('./context/AuthContext'),
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
      import('./context/InventoryContext'),
      import('./context/AccountingContext'),
      import('./context/LoyaltyContext')
    ]);

    const root = ReactDOM.createRoot(rootElement);

    root.render(
      <React.StrictMode>
        <ErrorBoundary
          onError={(error, errorInfo) => {
            console.error('Top-level error caught:', error, errorInfo);
          }}
        >
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
                                  <InventoryProvider>
                                    <AccountingProvider>
                                      <LoyaltyProvider>
                                        <App />
                                      </LoyaltyProvider>
                                    </AccountingProvider>
                                  </InventoryProvider>
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
        </ErrorBoundary>
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
