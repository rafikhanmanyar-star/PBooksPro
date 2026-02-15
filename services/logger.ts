/**
 * Centralized Logging Service
 * 
 * Filters console logs to show only:
 * - Authentication logs
 * - Database access logs
 * - Synchronization logs
 * 
 * All other logs are hidden to simplify debugging.
 */

type LogLevel = 'log' | 'warn' | 'error' | 'info' | 'debug';

interface LogEntry {
  level: LogLevel;
  message: string;
  args?: any[];
  timestamp: Date;
}

const isProduction = typeof import.meta !== 'undefined' && !import.meta.env?.DEV;

class Logger {
  private enabled = true;
  private allowedCategories = new Set<string>([
    'auth',
    'authentication',
    'database',
    'db',
    'sync',
    'synchronization',
    'api',
    'token',
    'session',
    'login',
    'logout'
  ]);

  /**
   * Check if a log message should be displayed.
   * In production, suppress all non-error logs.
   */
  private shouldLog(message: string, category?: string): boolean {
    if (!this.enabled) return false;
    if (isProduction) return false; // Suppress log/warn in production

    const lowerMessage = message.toLowerCase();
    
    // Check if message contains allowed keywords
    const hasAllowedKeyword = Array.from(this.allowedCategories).some(category => 
      lowerMessage.includes(category)
    );

    // Check category if provided
    if (category) {
      const lowerCategory = category.toLowerCase();
      if (this.allowedCategories.has(lowerCategory)) {
        return true;
      }
    }

    // Check for specific patterns
    const patterns = [
      /auth/i,
      /token/i,
      /login/i,
      /logout/i,
      /session/i,
      /database/i,
      /db/i,
      /sync/i,
      /synchronization/i,
      /api.*error/i,
      /failed.*sync/i,
      /synced/i,
      /saved.*database/i,
      /database.*saved/i,
      /opfs/i,
      /localStorage/i,
      /tenant/i,
      /user.*authenticated/i,
      /token.*expired/i,
      /token.*invalid/i,
      /401/i,
      /unauthorized/i
    ];

    return hasAllowedKeyword || patterns.some(pattern => pattern.test(message));
  }

  /**
   * Format log message
   */
  private formatMessage(level: LogLevel, message: string, category?: string): string {
    const timestamp = new Date().toISOString();
    const categoryTag = category ? `[${category.toUpperCase()}]` : '';
    const levelTag = level.toUpperCase().padEnd(5);
    return `${timestamp} ${levelTag} ${categoryTag} ${message}`;
  }

  /**
   * Log message (only if it matches allowed categories)
   */
  log(message: string, ...args: any[]): void {
    if (this.shouldLog(message)) {
      console.log(this.formatMessage('log', message), ...args);
    }
  }

  /**
   * Log with category
   */
  logCategory(category: string, message: string, ...args: any[]): void {
    if (this.shouldLog(message, category)) {
      console.log(this.formatMessage('log', message, category), ...args);
    }
  }

  /**
   * Warn message (only if it matches allowed categories)
   */
  warn(message: string, ...args: any[]): void {
    if (this.shouldLog(message)) {
      console.warn(this.formatMessage('warn', message), ...args);
    }
  }

  /**
   * Warn with category
   */
  warnCategory(category: string, message: string, ...args: any[]): void {
    if (this.shouldLog(message, category)) {
      console.warn(this.formatMessage('warn', message, category), ...args);
    }
  }

  /**
   * Error message (always shown)
   */
  error(message: string, ...args: any[]): void {
    console.error(this.formatMessage('error', message), ...args);
  }

  /**
   * Error with category
   */
  errorCategory(category: string, message: string, ...args: any[]): void {
    console.error(this.formatMessage('error', message, category), ...args);
  }

  /**
   * Info message (only if it matches allowed categories)
   */
  info(message: string, ...args: any[]): void {
    if (this.shouldLog(message)) {
      console.info(this.formatMessage('info', message), ...args);
    }
  }

  /**
   * Debug message (only if it matches allowed categories)
   */
  debug(message: string, ...args: any[]): void {
    if (this.shouldLog(message)) {
      console.debug(this.formatMessage('debug', message), ...args);
    }
  }

  /**
   * Force log (always shown, regardless of filters)
   */
  force(message: string, ...args: any[]): void {
    console.log(`[FORCE] ${message}`, ...args);
  }

  /**
   * Enable/disable logging
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /**
   * Add allowed category
   */
  addCategory(category: string): void {
    this.allowedCategories.add(category.toLowerCase());
  }

  /**
   * Remove allowed category
   */
  removeCategory(category: string): void {
    this.allowedCategories.delete(category.toLowerCase());
  }
}

// Export singleton instance
export const logger = new Logger();

// Export for convenience
export default logger;

