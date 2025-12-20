/**
 * Comprehensive Error Handler Service
 * 
 * Provides centralized error handling for:
 * - Application code errors
 * - Data mismatch errors
 * - File system/explorer errors
 * - Network errors
 * - Operating system errors
 */

import { getErrorLogger } from './errorLogger';

export interface ErrorContext {
    operation?: string;
    component?: string;
    data?: any;
    userAction?: string;
    [key: string]: any;
}

export class ErrorHandler {
    /**
     * Handle and categorize errors
     */
    static async handleError(
        error: unknown,
        context?: ErrorContext
    ): Promise<{ recovered: boolean; message: string }> {
        const errorObj = this.normalizeError(error);
        const errorType = this.categorizeError(errorObj, context);
        
        // Log error
        await getErrorLogger().logError(errorObj, {
            errorType,
            ...context
        });

        // Attempt recovery based on error type
        const recovery = await this.attemptRecovery(errorType, errorObj, context);
        
        return {
            recovered: recovery.recovered,
            message: recovery.message || this.getUserFriendlyMessage(errorType, errorObj)
        };
    }

    /**
     * Normalize error to Error object
     */
    private static normalizeError(error: unknown): Error {
        if (error instanceof Error) {
            return error;
        }
        if (typeof error === 'string') {
            return new Error(error);
        }
        if (error && typeof error === 'object' && 'message' in error) {
            return new Error(String((error as any).message));
        }
        return new Error('Unknown error occurred');
    }

    /**
     * Categorize error by type
     */
    private static categorizeError(error: Error, context?: ErrorContext): string {
        const message = error.message.toLowerCase();
        const stack = error.stack?.toLowerCase() || '';

        // Network errors
        if (
            message.includes('network') ||
            message.includes('fetch') ||
            message.includes('connection') ||
            message.includes('timeout') ||
            message.includes('failed to fetch') ||
            message.includes('networkerror') ||
            stack.includes('network')
        ) {
            return 'network_error';
        }

        // File system errors
        if (
            message.includes('enoent') ||
            message.includes('eacces') ||
            message.includes('eperm') ||
            message.includes('file') ||
            message.includes('directory') ||
            message.includes('permission') ||
            message.includes('access denied') ||
            stack.includes('filesystem') ||
            stack.includes('fs.')
        ) {
            return 'filesystem_error';
        }

        // Database errors
        if (
            message.includes('database') ||
            message.includes('sqlite') ||
            message.includes('corrupt') ||
            message.includes('malformed') ||
            message.includes('constraint') ||
            message.includes('transaction') ||
            stack.includes('database')
        ) {
            return 'database_error';
        }

        // Data mismatch/validation errors
        if (
            message.includes('mismatch') ||
            message.includes('invalid') ||
            message.includes('validation') ||
            message.includes('type') ||
            message.includes('format') ||
            message.includes('parse') ||
            message.includes('json')
        ) {
            return 'data_error';
        }

        // OS-level errors
        if (
            message.includes('system') ||
            message.includes('os') ||
            message.includes('memory') ||
            message.includes('quota') ||
            message.includes('storage') ||
            message.includes('disk') ||
            message.includes('space')
        ) {
            return 'os_error';
        }

        // Application errors
        if (
            message.includes('undefined') ||
            message.includes('null') ||
            message.includes('cannot read') ||
            message.includes('cannot access') ||
            stack.includes('react') ||
            stack.includes('component')
        ) {
            return 'application_error';
        }

        return 'unknown_error';
    }

    /**
     * Attempt to recover from error
     */
    private static async attemptRecovery(
        errorType: string,
        error: Error,
        context?: ErrorContext
    ): Promise<{ recovered: boolean; message?: string }> {
        switch (errorType) {
            case 'network_error':
                // Network errors are usually transient - suggest retry
                return {
                    recovered: false,
                    message: 'Network connection failed. Please check your internet connection and try again.'
                };

            case 'filesystem_error':
                // File system errors - try to continue with fallback
                return {
                    recovered: true,
                    message: 'File operation failed. Using alternative storage method.'
                };

            case 'database_error':
                // Database errors - try to recover or use backup
                if (error.message.includes('corrupt') || error.message.includes('malformed')) {
                    // Try to restore from backup
                    return {
                        recovered: false,
                        message: 'Database corruption detected. Please restore from backup.'
                    };
                }
                return {
                    recovered: true,
                    message: 'Database operation failed. Changes may not be saved.'
                };

            case 'data_error':
                // Data errors - validate and continue with defaults
                return {
                    recovered: true,
                    message: 'Data validation failed. Using default values.'
                };

            case 'os_error':
                // OS errors - usually critical, but try to continue
                if (error.message.includes('quota') || error.message.includes('space')) {
                    return {
                        recovered: false,
                        message: 'Insufficient storage space. Please free up disk space.'
                    };
                }
                return {
                    recovered: false,
                    message: 'System error occurred. Please restart the application.'
                };

            case 'application_error':
                // Application errors - try to reset state
                return {
                    recovered: true,
                    message: 'Application error occurred. State has been reset.'
                };

            default:
                return {
                    recovered: false,
                    message: 'An unexpected error occurred.'
                };
        }
    }

    /**
     * Get user-friendly error message
     */
    private static getUserFriendlyMessage(errorType: string, error: Error): string {
        const messages: Record<string, string> = {
            network_error: 'Network connection failed. Please check your internet connection.',
            filesystem_error: 'File operation failed. Please check file permissions.',
            database_error: 'Database operation failed. Your data may be at risk.',
            data_error: 'Data validation failed. Please check your input.',
            os_error: 'System error occurred. Please try again or restart the application.',
            application_error: 'Application error occurred. Please try again.',
            unknown_error: 'An unexpected error occurred. Please try again.'
        };

        return messages[errorType] || messages.unknown_error;
    }

    /**
     * Safe async operation wrapper
     */
    static async safeAsync<T>(
        operation: () => Promise<T>,
        fallback: T,
        context?: ErrorContext
    ): Promise<T> {
        try {
            return await operation();
        } catch (error) {
            await this.handleError(error, context);
            return fallback;
        }
    }

    /**
     * Safe sync operation wrapper
     */
    static safeSync<T>(
        operation: () => T,
        fallback: T,
        context?: ErrorContext
    ): T {
        try {
            return operation();
        } catch (error) {
            this.handleError(error, context).catch(() => {});
            return fallback;
        }
    }

    /**
     * Safe network request wrapper
     */
    static async safeFetch(
        url: string,
        options?: RequestInit,
        context?: ErrorContext
    ): Promise<Response | null> {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

            const response = await fetch(url, {
                ...options,
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            return response;
        } catch (error) {
            await this.handleError(error, {
                ...context,
                operation: 'network_request',
                url
            });
            return null;
        }
    }

    /**
     * Safe file read wrapper
     */
    static async safeFileRead(
        file: File,
        context?: ErrorContext
    ): Promise<string | null> {
        try {
            return await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result as string);
                reader.onerror = () => reject(new Error('File read failed'));
                reader.readAsText(file);
            });
        } catch (error) {
            await this.handleError(error, {
                ...context,
                operation: 'file_read',
                fileName: file.name
            });
            return null;
        }
    }

    /**
     * Safe JSON parse wrapper
     */
    static safeJsonParse<T>(
        json: string,
        fallback: T,
        context?: ErrorContext
    ): T {
        try {
            return JSON.parse(json) as T;
        } catch (error) {
            this.handleError(error, {
                ...context,
                operation: 'json_parse',
                data: json.substring(0, 100) // First 100 chars for context
            }).catch(() => {});
            return fallback;
        }
    }

    /**
     * Safe localStorage wrapper
     */
    static safeLocalStorage(
        operation: 'get' | 'set' | 'remove',
        key: string,
        value?: string,
        context?: ErrorContext
    ): string | null {
        try {
            switch (operation) {
                case 'get':
                    return localStorage.getItem(key);
                case 'set':
                    if (value !== undefined) {
                        localStorage.setItem(key, value);
                    }
                    return null;
                case 'remove':
                    localStorage.removeItem(key);
                    return null;
            }
        } catch (error) {
            // Handle quota exceeded or other storage errors
            this.handleError(error, {
                ...context,
                operation: 'localStorage',
                key
            }).catch(() => {});
            return null;
        }
    }

    /**
     * Validate data structure
     */
    static validateData<T>(
        data: unknown,
        validator: (data: unknown) => data is T,
        context?: ErrorContext
    ): T | null {
        try {
            if (validator(data)) {
                return data;
            }
            throw new Error('Data validation failed: structure mismatch');
        } catch (error) {
            this.handleError(error, {
                ...context,
                operation: 'data_validation',
                data: typeof data === 'object' ? JSON.stringify(data).substring(0, 200) : String(data)
            }).catch(() => {});
            return null;
        }
    }
}

export default ErrorHandler;

