import { Pool, PoolClient } from 'pg';

export class DatabaseService {
  private pool: Pool;
  private connectionString: string;

  constructor(connectionString: string) {
    this.connectionString = connectionString;
    this.pool = new Pool({
      connectionString,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
      max: 20, // Maximum number of clients in the pool
      idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
      connectionTimeoutMillis: 10000, // Increased to 10 seconds for Render cold starts
      // Retry configuration
      keepAlive: true,
      keepAliveInitialDelayMillis: 10000,
    });

    // Handle pool errors
    this.pool.on('error', (err) => {
      console.error('❌ Unexpected database pool error:', err);
      // Don't exit - let the pool handle reconnection
    });

    // Handle connection events
    this.pool.on('connect', () => {
      console.log('✅ New database connection established');
    });
  }

  /**
   * Execute a query with retry logic for transient errors
   */
  async query<T = any>(text: string, params?: any[], retries = 3): Promise<T[]> {
    let lastError: any;
    
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const result = await this.pool.query(text, params);
        return result.rows;
      } catch (error: any) {
        lastError = error;
        
        // Check if error is retryable
        const isRetryable = this.isRetryableError(error);
        
        if (!isRetryable || attempt === retries) {
          // Not retryable or out of retries
          console.error('❌ Database query error:', {
            query: text.substring(0, 100),
            error: error.message,
            code: error.code,
            attempt
          });
          throw error;
        }
        
        // Wait before retry (exponential backoff)
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
        console.warn(`⚠️ Database query failed (attempt ${attempt}/${retries}), retrying in ${delay}ms...`, error.message);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    throw lastError;
  }

  /**
   * Check if an error is retryable (transient)
   */
  private isRetryableError(error: any): boolean {
    if (!error || !error.code) return false;
    
    // PostgreSQL error codes that are retryable
    const retryableCodes = [
      'ECONNREFUSED',      // Connection refused
      'ETIMEDOUT',         // Connection timeout
      'ENOTFOUND',         // DNS lookup failed
      '57P01',             // Admin shutdown
      '57P02',             // Crash shutdown
      '57P03',             // Cannot connect now
      '08003',             // Connection does not exist
      '08006',             // Connection failure
      '08001',             // SQL client unable to establish connection
      '08004',             // SQL server rejected connection
      '53300',             // Too many connections
    ];
    
    return retryableCodes.includes(error.code);
  }

  /**
   * Execute a statement (INSERT, UPDATE, DELETE) with retry logic
   */
  async execute(text: string, params?: any[], retries = 3): Promise<void> {
    let lastError: any;
    
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        await this.pool.query(text, params);
        return;
      } catch (error: any) {
        lastError = error;
        
        const isRetryable = this.isRetryableError(error);
        
        if (!isRetryable || attempt === retries) {
          console.error('❌ Database execute error:', {
            query: text.substring(0, 100),
            error: error.message,
            code: error.code,
            attempt
          });
          throw error;
        }
        
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
        console.warn(`⚠️ Database execute failed (attempt ${attempt}/${retries}), retrying in ${delay}ms...`, error.message);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    throw lastError;
  }

  /**
   * Check database connection health
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.pool.query('SELECT 1');
      return true;
    } catch (error) {
      console.error('❌ Database health check failed:', error);
      return false;
    }
  }

  /**
   * Execute operations in a transaction with retry logic
   * The callback receives a PoolClient that should be used for all queries within the transaction
   */
  async transaction<T>(callback: (client: PoolClient) => Promise<T>, retries = 3): Promise<T> {
    let lastError: any;
    
    for (let attempt = 1; attempt <= retries; attempt++) {
      const client = await this.pool.connect();
      try {
        await client.query('BEGIN');
        const result = await callback(client);
        await client.query('COMMIT');
        client.release();
        return result;
      } catch (error: any) {
        try {
          await client.query('ROLLBACK');
        } catch (rollbackError) {
          console.error('Error during rollback:', rollbackError);
        }
        client.release();
        
        lastError = error;
        
        // Check if error is retryable
        const isRetryable = this.isRetryableError(error);
        
        if (!isRetryable || attempt === retries) {
          throw error;
        }
        
        // Wait before retry (exponential backoff)
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
        console.warn(`⚠️ Transaction failed (attempt ${attempt}/${retries}), retrying in ${delay}ms...`, error.message);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    throw lastError;
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  getPool(): Pool {
    return this.pool;
  }
}

// Singleton instance
let dbServiceInstance: DatabaseService | null = null;

export function getDatabaseService(): DatabaseService {
  if (!dbServiceInstance) {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL environment variable is not set');
    }
    dbServiceInstance = new DatabaseService(process.env.DATABASE_URL);
  }
  return dbServiceInstance;
}

