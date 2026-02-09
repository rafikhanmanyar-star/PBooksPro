import { Pool, PoolClient } from 'pg';
import { getCurrentTenantId } from './tenantContext.js';

export class DatabaseService {
  private pool: Pool;
  private connectionString: string;

  constructor(connectionString: string) {
    this.connectionString = connectionString;
    
    // Validate database URL format and warn if it looks like an internal URL
    if (connectionString && connectionString.includes('@dpg-') && !connectionString.includes('.render.com')) {
      console.warn('⚠️  WARNING: Database URL appears to be an internal URL (missing .render.com domain)');
      console.warn('   This may cause connection errors. Use the External Database URL from Render Dashboard.');
      console.warn('   Expected format: postgresql://user:pass@dpg-xxx-a.region-postgres.render.com:5432/dbname');
    }
    
    // Enable SSL for production, staging, and any Render database URLs
    const shouldUseSSL = process.env.NODE_ENV === 'production' || 
                         process.env.NODE_ENV === 'staging' ||
                         (connectionString && connectionString.includes('.render.com'));
    
    this.pool = new Pool({
      connectionString,
      ssl: shouldUseSSL ? { rejectUnauthorized: false } : false,
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
        const tenantId = getCurrentTenantId();
        if (!tenantId) {
          const result = await this.pool.query(text, params);
          return result.rows;
        }

        // RLS tenant context must be set on the SAME connection as the query.
        // Use a short transaction and SET LOCAL to avoid leaking across pooled connections.
        const client = await this.pool.connect();
        try {
          await client.query('BEGIN');
          await client.query('SET LOCAL app.current_tenant_id = $1', [tenantId]);
          const result = await client.query(text, params);
          await client.query('COMMIT');
          return result.rows;
        } catch (err) {
          try {
            await client.query('ROLLBACK');
          } catch {
            // ignore rollback errors
          }
          throw err;
        } finally {
          client.release();
        }
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
          
          // Provide helpful error message for ENOTFOUND errors
          if (error.code === 'ENOTFOUND' || error.message?.includes('getaddrinfo ENOTFOUND')) {
            const dbUrl = this.connectionString || '';
            const isInternalUrl = dbUrl.includes('@dpg-') && !dbUrl.includes('.render.com');
            if (isInternalUrl) {
              console.error('   💡 HINT: Database URL appears to be an internal URL.');
              console.error('   💡 SOLUTION: Use the External Database URL from Render Dashboard.');
              console.error('   💡 Expected format: postgresql://user:pass@dpg-xxx-a.region-postgres.render.com:5432/dbname');
            }
          }
          
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
        const tenantId = getCurrentTenantId();
        if (!tenantId) {
          await this.pool.query(text, params);
          return;
        }

        // Same logic as query(): run in a short transaction with SET LOCAL.
        const client = await this.pool.connect();
        try {
          await client.query('BEGIN');
          await client.query('SET LOCAL app.current_tenant_id = $1', [tenantId]);
          await client.query(text, params);
          await client.query('COMMIT');
          return;
        } catch (err) {
          try {
            await client.query('ROLLBACK');
          } catch {
            // ignore rollback errors
          }
          throw err;
        } finally {
          client.release();
        }
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
          
          // Provide helpful error message for ENOTFOUND errors
          if (error.code === 'ENOTFOUND' || error.message?.includes('getaddrinfo ENOTFOUND')) {
            const dbUrl = this.connectionString || '';
            const isInternalUrl = dbUrl.includes('@dpg-') && !dbUrl.includes('.render.com');
            if (isInternalUrl) {
              console.error('   💡 HINT: Database URL appears to be an internal URL.');
              console.error('   💡 SOLUTION: Use the External Database URL from Render Dashboard.');
              console.error('   💡 Expected format: postgresql://user:pass@dpg-xxx-a.region-postgres.render.com:5432/dbname');
            }
          }
          
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
        console.log(`🔄 Database transaction starting (attempt ${attempt}/${retries})`);
        await client.query('BEGIN');
        console.log('✅ Transaction BEGIN successful');

        const tenantId = getCurrentTenantId();
        if (tenantId) {
          // Apply RLS tenant context for this transaction.
          // SET LOCAL guarantees no leakage beyond this transaction.
          await client.query('SET LOCAL app.current_tenant_id = $1', [tenantId]);
        }

        const result = await callback(client);
        console.log('✅ Transaction callback completed, committing...');
        await client.query('COMMIT');
        console.log('✅ Transaction COMMIT successful');
        client.release();
        return result;
      } catch (error: any) {
        console.error(`❌ Transaction error (attempt ${attempt}/${retries}):`, {
          message: error.message,
          code: error.code,
          detail: error.detail,
          constraint: error.constraint
        });
        try {
          await client.query('ROLLBACK');
          console.log('✅ Transaction ROLLBACK successful');
        } catch (rollbackError) {
          console.error('❌ Error during rollback:', rollbackError);
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

