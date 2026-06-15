/**
 * Error Logger Service
 * 
 * Centralized error logging service that logs errors to:
 * - Browser console
 * - Database (error_log table)
 * - localStorage (for persistence across sessions)
 */

import { ErrorLogEntry } from '../types';

export interface ExtendedErrorLogEntry extends ErrorLogEntry {
    id: string;
    url?: string;
    userAgent?: string;
    errorType?: string;
    additionalInfo?: any;
}

class ErrorLogger {
    private maxLogs = 1000; // Maximum number of logs to keep
    private logs: ExtendedErrorLogEntry[] = [];

    /**
     * Initialize error logger
     */
    async initialize(): Promise<void> {
        try {
            // Try to load from localStorage first (works even if database isn't ready)
            try {
                const stored = localStorage.getItem('error_logs');
                if (stored) {
                    const parsed = JSON.parse(stored);
                    if (Array.isArray(parsed)) {
                        this.logs = parsed;
                    }
                }
            } catch (e) {
                console.warn('Failed to load error logs from localStorage:', e);
            }
        } catch (error) {
            console.error('Failed to initialize error logger:', error);
            // Logger should never fail - continue with empty logs
        }
    }

    /**
     * Log an error
     */
    async logError(
        error: Error | string,
        additionalInfo?: {
            componentStack?: string;
            errorType?: string;
            [key: string]: any;
        }
    ): Promise<void> {
        try {
            const errorMessage = error instanceof Error ? error.message : error;
            const errorStack = error instanceof Error ? error.stack : undefined;

            const logEntry: ExtendedErrorLogEntry = {
                id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                timestamp: new Date().toISOString(),
                message: errorMessage,
                stack: errorStack,
                componentStack: additionalInfo?.componentStack,
                errorType: additionalInfo?.errorType || 'unknown',
                url: typeof window !== 'undefined' ? window.location.href : undefined,
                userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
                additionalInfo: additionalInfo ? { ...additionalInfo } : undefined
            };

            // Log to console
            console.error('Error logged:', logEntry);

            // Add to in-memory logs
            this.logs.unshift(logEntry);
            if (this.logs.length > this.maxLogs) {
                this.logs = this.logs.slice(0, this.maxLogs);
            }

            // Also save to localStorage as backup
            this.saveToLocalStorage(logEntry);
        } catch (logError) {
            console.error('Failed to log error:', logError);
        }
    }

    /**
     * Save error to localStorage as backup
     */
    private saveToLocalStorage(entry: ExtendedErrorLogEntry): void {
        try {
            const existing = localStorage.getItem('error_logs');
            const logs: ExtendedErrorLogEntry[] = existing ? JSON.parse(existing) : [];
            logs.unshift(entry);

            // Keep only last 100 logs in localStorage
            const trimmedLogs = logs.slice(0, 100);
            localStorage.setItem('error_logs', JSON.stringify(trimmedLogs));
        } catch (error) {
            console.error('Failed to save error to localStorage:', error);
        }
    }

    /**
     * Get all error logs
     */
    getLogs(limit?: number): ExtendedErrorLogEntry[] {
        return limit ? this.logs.slice(0, limit) : this.logs;
    }

    /**
     * Clear all error logs
     */
    async clearLogs(): Promise<void> {
        try {
            this.logs = [];

            // Clear from localStorage
            localStorage.removeItem('error_logs');
        } catch (error) {
            console.error('Failed to clear error logs:', error);
        }
    }

    /**
     * Get error statistics
     */
    getStatistics(): {
        total: number;
        byType: Record<string, number>;
        recent: number; // Errors in last 24 hours
    } {
        const now = Date.now();
        const oneDayAgo = now - 24 * 60 * 60 * 1000;

        const byType: Record<string, number> = {};
        let recent = 0;

        this.logs.forEach(log => {
            // Count by type
            const type = log.errorType || 'unknown';
            byType[type] = (byType[type] || 0) + 1;

            // Count recent
            const logTime = new Date(log.timestamp).getTime();
            if (logTime > oneDayAgo) {
                recent++;
            }
        });

        return {
            total: this.logs.length,
            byType,
            recent
        };
    }
}

// Singleton instance
let errorLoggerInstance: ErrorLogger | null = null;

export const getErrorLogger = (): ErrorLogger => {
    if (!errorLoggerInstance) {
        errorLoggerInstance = new ErrorLogger();
    }
    return errorLoggerInstance;
};

// Global error handlers
if (typeof window !== 'undefined') {
    // Unhandled errors
    window.addEventListener('error', (event) => {
        getErrorLogger().logError(event.error || new Error(event.message), {
            errorType: 'unhandled',
            filename: event.filename,
            lineno: event.lineno,
            colno: event.colno
        });
    });

    // Unhandled promise rejections
    window.addEventListener('unhandledrejection', (event) => {
        getErrorLogger().logError(
            event.reason instanceof Error
                ? event.reason
                : new Error(String(event.reason)),
            {
                errorType: 'unhandled_promise_rejection'
            }
        );
    });
}

export default ErrorLogger;
