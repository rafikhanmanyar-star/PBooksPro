import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AppAction } from '../types';
import { getErrorLogger } from '../services/errorLogger';

interface ErrorBoundaryProps {
  dispatch?: React.Dispatch<AppAction>;
  children?: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  copied?: boolean;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState = {
    hasError: false,
    error: null,
    errorInfo: null,
    copied: false,
  };

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    // Update state so the next render will show the fallback UI.
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log error
    console.error("ErrorBoundary caught an error:", error, errorInfo);
    
    // Update state with error info
    this.setState({
      error,
      errorInfo
    });

    // Log to error logger
    getErrorLogger().logError(error, {
      componentStack: errorInfo.componentStack,
      errorType: 'react_error_boundary'
    });

    // Dispatch to app context if available
    if (this.props.dispatch) {
      try {
        this.props.dispatch({
          type: 'ADD_ERROR_LOG',
          payload: {
            message: `React render error: ${error.message}`,
            stack: error.stack,
            componentStack: errorInfo.componentStack,
            timestamp: new Date().toISOString()
          }
        });
      } catch (dispatchError) {
        console.error('Failed to dispatch error to app context:', dispatchError);
      }
    }

    // Call custom error handler if provided
    if (this.props.onError) {
      try {
        this.props.onError(error, errorInfo);
      } catch (handlerError) {
        console.error('Error in custom error handler:', handlerError);
      }
    }
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null
    });
  };

  handleReload = () => {
    window.location.reload();
  };

  handleCopyDetails = async () => {
    const { error, errorInfo } = this.state;
    const details =
      (error?.stack || error?.toString() || '') +
      (errorInfo?.componentStack ? `\n\nComponent Stack:\n${errorInfo.componentStack}` : '');

    try {
      await navigator.clipboard.writeText(details);
      this.setState({ copied: true });
      window.setTimeout(() => this.setState({ copied: false }), 1500);
    } catch (e) {
      // Fallback: select/copy is still available via the textarea
      console.error('Failed to copy error details:', e);
    }
  };

  render() {
    if (this.state.hasError) {
      // Use custom fallback if provided
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default fallback UI
      return (
        <div style={{ 
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '2rem',
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          fontFamily: 'system-ui, -apple-system, sans-serif'
        }}>
          <div style={{
            background: 'white',
            padding: '2rem',
            borderRadius: '1rem',
            boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
            maxWidth: '600px',
            width: '100%'
          }}>
            <div style={{
              fontSize: '3rem',
              marginBottom: '1rem',
              textAlign: 'center'
            }}>⚠️</div>
            
            <h1 style={{ 
              fontSize: '1.5rem', 
              color: '#b91c1c',
              marginBottom: '0.5rem',
              textAlign: 'center'
            }}>
              Something went wrong
            </h1>
            
            <p style={{ 
              color: '#64748b', 
              marginBottom: '1.5rem',
              textAlign: 'center'
            }}>
              An unexpected error occurred. Don't worry, your data is safe.
            </p>

            {this.state.error && (
              <div style={{
                marginBottom: '1.5rem',
                padding: '1rem',
                backgroundColor: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '0.5rem'
              }}>
                <div style={{
                  fontWeight: 'bold',
                  marginBottom: '0.5rem',
                  color: '#475569'
                }}>
                  Error: {this.state.error.message}
                </div>
                <details style={{ marginTop: '0.5rem' }}>
                  <summary style={{ 
                    cursor: 'pointer', 
                    fontWeight: 'bold',
                    color: '#64748b',
                    fontSize: '0.875rem'
                  }}>
                    Show technical details
                  </summary>
                  <div style={{ marginTop: '0.5rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.5rem' }}>
                      <button
                        type="button"
                        onClick={this.handleCopyDetails}
                        style={{
                          padding: '0.4rem 0.6rem',
                          backgroundColor: this.state.copied ? '#16a34a' : '#e2e8f0',
                          color: this.state.copied ? 'white' : '#0f172a',
                          border: '1px solid #cbd5e1',
                          borderRadius: '0.375rem',
                          cursor: 'pointer',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                        }}
                      >
                        {this.state.copied ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                    <textarea
                      readOnly
                      value={
                        (this.state.error.stack || this.state.error.toString() || '') +
                        (this.state.errorInfo?.componentStack ? `\n\nComponent Stack:\n${this.state.errorInfo.componentStack}` : '')
                      }
                      style={{
                        width: '100%',
                        marginTop: '0',
                        padding: '0.75rem',
                        backgroundColor: '#f1f5f9',
                        border: '1px solid #e2e8f0',
                        borderRadius: '0.375rem',
                        fontSize: '0.75rem',
                        color: '#475569',
                        maxHeight: '300px',
                        overflow: 'auto',
                        resize: 'vertical',
                        whiteSpace: 'pre',
                        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace'
                      }}
                    />
                  </div>
                </details>
              </div>
            )}

            <div style={{
              display: 'flex',
              gap: '0.75rem',
              justifyContent: 'center',
              flexWrap: 'wrap'
            }}>
              <button 
                style={{ 
                  padding: '0.75rem 1.5rem', 
                  backgroundColor: '#4f46e5', 
                  color: 'white', 
                  border: 'none', 
                  borderRadius: '0.5rem', 
                  cursor: 'pointer',
                  fontWeight: '500',
                  fontSize: '0.875rem',
                  transition: 'background-color 0.2s'
                }}
                onClick={this.handleReset}
                onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#4338ca'}
                onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#4f46e5'}
              >
                Try Again
              </button>
              <button 
                style={{ 
                  padding: '0.75rem 1.5rem', 
                  backgroundColor: '#64748b', 
                  color: 'white', 
                  border: 'none', 
                  borderRadius: '0.5rem', 
                  cursor: 'pointer',
                  fontWeight: '500',
                  fontSize: '0.875rem',
                  transition: 'background-color 0.2s'
                }}
                onClick={this.handleReload}
                onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#475569'}
                onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#64748b'}
              >
                Reload Page
              </button>
            </div>

            <div style={{
              marginTop: '1.5rem',
              paddingTop: '1.5rem',
              borderTop: '1px solid #e2e8f0',
              fontSize: '0.75rem',
              color: '#94a3b8',
              textAlign: 'center'
            }}>
              If this problem persists, please check the error log in Settings.
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
