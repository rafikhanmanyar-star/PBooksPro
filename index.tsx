
import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';

// Show immediate loading screen before anything else loads
const rootElement = document.getElementById('root');
if (rootElement) {
  rootElement.innerHTML = `
    <div style="
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 25%, #f093fb 50%, #4facfe 75%, #00f2fe 100%);
      background-size: 400% 400%;
      animation: gradient 15s ease infinite;
      padding: 2rem;
      font-family: system-ui, -apple-system, sans-serif;
    ">
      <div style="
        background: rgba(255, 255, 255, 0.95);
        backdrop-filter: blur(10px);
        padding: 3rem;
        border-radius: 1.5rem;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
        border: 1px solid rgba(255, 255, 255, 0.5);
        max-width: 500px;
        width: 100%;
        text-align: center;
      ">
        <div style="
          font-size: 2.5rem;
          font-weight: bold;
          margin-bottom: 0.5rem;
          background: linear-gradient(135deg, #16a34a 0%, #0891b2 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          animation: pulse 2s ease-in-out infinite;
        ">
          PBooksPro
        </div>
        <div style="
          font-size: 0.875rem;
          color: #6b7280;
          margin-bottom: 2rem;
          font-weight: 500;
        ">
          Professional Business Management Suite
        </div>
        <div style="
          background: linear-gradient(135deg, #f0f9ff 0%, #f5f3ff 100%);
          border-radius: 1rem;
          padding: 2rem;
          margin-bottom: 1.5rem;
          border: 2px solid rgba(255, 255, 255, 0.8);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
        ">
          <div style="font-size: 3rem; margin-bottom: 1rem; animation: bounce 2s ease-in-out infinite;">
            🚀
          </div>
          <div style="font-size: 0.875rem; color: #374151; font-weight: 500;">
            Starting application...
          </div>
        </div>
        <div style="
          width: 50px;
          height: 50px;
          border: 4px solid #e5e7eb;
          border-top: 4px solid #16a34a;
          border-radius: 50%;
          animation: spin 1s linear infinite;
          margin: 0 auto;
        "></div>
        <style>
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
          @keyframes gradient {
            0% { background-position: 0% 50%; }
            50% { background-position: 100% 50%; }
            100% { background-position: 0% 50%; }
          }
          @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.7; }
          }
          @keyframes bounce {
            0%, 100% { transform: translateY(0); }
            50% { transform: translateY(-10px); }
          }
        </style>
      </div>
    </div>
  `;
}

// Now load the actual app
let appLoadError: Error | null = null;

try {
  // Initialize error logger early (but don't block)
  const initErrorLogger = async () => {
    try {
      const { getErrorLogger } = await import('./services/errorLogger');
      await getErrorLogger().initialize();
      console.log('✅ Error logger initialized');
    } catch (error) {
      console.error('❌ Failed to initialize error logger:', error);
    }
  };
  initErrorLogger().catch(() => {}); // Don't block on error logger

  // Set up comprehensive global error handlers
  const setupGlobalErrorHandlers = () => {
    // Unhandled JavaScript errors
    window.addEventListener('error', (event) => {
      event.preventDefault(); // Prevent default error handling
      const { getErrorLogger } = require('./services/errorLogger');
      getErrorLogger().logError(event.error || new Error(event.message), {
        errorType: 'unhandled_error',
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        source: 'global_error_handler'
      }).catch(() => {}); // Don't let error logging fail
    });

    // Unhandled promise rejections
    window.addEventListener('unhandledrejection', (event) => {
      event.preventDefault(); // Prevent default error handling
      const { getErrorLogger } = require('./services/errorLogger');
      const error = event.reason instanceof Error 
        ? event.reason 
        : new Error(String(event.reason));
      getErrorLogger().logError(error, {
        errorType: 'unhandled_promise_rejection',
        source: 'global_promise_handler'
      }).catch(() => {});
    });

    // Resource loading errors (images, scripts, etc.)
    window.addEventListener('error', (event) => {
      if (event.target && event.target !== window) {
        const target = event.target as HTMLElement;
        const { getErrorLogger } = require('./services/errorLogger');
        getErrorLogger().logError(new Error(`Resource loading failed: ${target.tagName}`), {
          errorType: 'resource_error',
          resource: target.tagName,
          source: (target as any).src || (target as any).href
        }).catch(() => {});
      }
    }, true); // Use capture phase

    // Console error interceptor (for additional context)
    const originalConsoleError = console.error;
    console.error = (...args: any[]) => {
      originalConsoleError.apply(console, args);
      // Log to error logger if it's an Error object
      if (args.length > 0 && args[0] instanceof Error) {
        const { getErrorLogger } = require('./services/errorLogger');
        getErrorLogger().logError(args[0], {
          errorType: 'console_error',
          source: 'console_interceptor'
        }).catch(() => {});
      }
    };
  };

  // Set up error handlers immediately
  try {
    setupGlobalErrorHandlers();
  } catch (error) {
    console.error('Failed to set up global error handlers:', error);
  }

  // Expose error logger and diagnostics to window for debugging (development only)
  if (process.env.NODE_ENV === 'development') {
    import('./services/errorLogger').then(({ getErrorLogger }) => {
      (window as any).errorLogger = getErrorLogger();
      (window as any).getDatabaseService = () => import('./services/database/databaseService').then(m => m.getDatabaseService());
      console.log('💡 Debug helpers available:');
      console.log('   - window.errorLogger');
      console.log('   - window.getDatabaseService()');
      console.log('   - Press F12 to open DevTools');
    }).catch(() => {});
  }

  if (!rootElement) {
    throw new Error("Could not find root element to mount to");
  }

  // Ensure DOM is fully ready before loading React
  // This helps prevent React 19.2.x Activity initialization errors
  const initApp = () => {
    // Import and render app
    // Import AppContext separately with better error handling
    console.log('[index] Starting module imports...');
    Promise.all([
    import('./App').catch(err => {
      console.error('❌ Failed to import App:', err);
      throw new Error(`Failed to import App: ${err instanceof Error ? err.message : String(err)}`);
    }),
    import('./context/AppContext').catch(err => {
      console.error('❌ Failed to import AppContext:', err);
      console.error('❌ AppContext import error details:', {
        message: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
        name: err instanceof Error ? err.name : typeof err
      });
      throw new Error(`Failed to import AppContext: ${err instanceof Error ? err.message : String(err)}`);
    }),
    import('./context/AuthContext').catch(err => {
      console.error('❌ Failed to import AuthContext:', err);
      throw new Error(`Failed to import AuthContext: ${err instanceof Error ? err.message : String(err)}`);
    }),
    import('./context/ProgressContext'),
    import('./context/KeyboardContext'),
    import('./context/KPIContext'),
    import('./context/NotificationContext'),
    import('./context/LicenseContext'),
    import('./context/PWAContext'),
    import('./context/UpdateContext'),
    import('./components/ErrorBoundary')
  ]).then(([
    { default: App },
    { AppProvider },
    { AuthProvider },
    { ProgressProvider },
    { KeyboardProvider },
    { KPIProvider },
    { NotificationProvider },
    { LicenseProvider },
    { PWAProvider },
    { UpdateProvider },
    { default: ErrorBoundary }
  ]) => {
    // Top-level error boundary
    const TopLevelErrorBoundary: React.FC<{ children: React.ReactNode }> = ({ children }) => {
      return (
        <ErrorBoundary
          onError={(error, errorInfo) => {
            console.error('Top-level error caught:', error, errorInfo);
          }}
        >
          {children}
        </ErrorBoundary>
      );
    };

    const root = ReactDOM.createRoot(rootElement);
    
    root.render(
      <React.StrictMode>
        <TopLevelErrorBoundary>
          <AuthProvider>
            <AppProvider>
              <PWAProvider>
                <UpdateProvider>
                  <LicenseProvider>
                    <ProgressProvider>
                      <KeyboardProvider>
                        <KPIProvider>
                          <NotificationProvider>
                            <App />
                          </NotificationProvider>
                        </KPIProvider>
                      </KeyboardProvider>
                    </ProgressProvider>
                  </LicenseProvider>
                </UpdateProvider>
              </PWAProvider>
            </AppProvider>
          </AuthProvider>
        </TopLevelErrorBoundary>
      </React.StrictMode>
    );
  }).catch((error) => {
    appLoadError = error instanceof Error ? error : new Error(String(error));
    console.error('❌ Failed to load application:', appLoadError);
    console.error('❌ Error details:', {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      name: error instanceof Error ? error.name : typeof error,
      cause: (error as any)?.cause,
      fileName: (error as any)?.fileName,
      lineNumber: (error as any)?.lineNumber,
      columnNumber: (error as any)?.columnNumber
    });
    
    // Show error UI
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
              ${appLoadError.message}
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
            <p style="color: #94a3b8; font-size: 0.75rem; margin-top: 1rem;">
              If this problem persists, try clearing your browser cache and reloading.
            </p>
          </div>
        </div>
      `;
    }
  });
  };

  // Wait for DOM to be fully ready before initializing React
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
  } else {
    // DOM is already ready, but add a small delay to ensure everything is initialized
    setTimeout(initApp, 0);
  }
} catch (error) {
  appLoadError = error instanceof Error ? error : new Error(String(error));
  console.error('❌ Critical error during initialization:', appLoadError);
  
  // Show error UI
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
          max-width: 500px;
          text-align: center;
        ">
          <h1 style="color: #b91c1c; margin-bottom: 1rem;">Critical Error</h1>
          <p style="color: #64748b; margin-bottom: 1.5rem;">
            ${appLoadError.message}
          </p>
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
            "
          >
            Reload Page
          </button>
        </div>
      </div>
    `;
  }
}
