/**
 * Development-only logger utility
 * Wraps console methods to only log in development mode
 */

const isDevelopment = import.meta.env.DEV || process.env.NODE_ENV === 'development';

export const devLogger = {
    log: (...args: any[]) => {
        if (isDevelopment) {
            console.log(...args);
        }
    },
    warn: (...args: any[]) => {
        if (isDevelopment) {
            console.warn(...args);
        }
    },
    error: (...args: any[]) => {
        // Always log errors, even in production
        console.error(...args);
    },
    info: (...args: any[]) => {
        if (isDevelopment) {
            console.info(...args);
        }
    },
    debug: (...args: any[]) => {
        if (isDevelopment) {
            console.debug(...args);
        }
    },
};
