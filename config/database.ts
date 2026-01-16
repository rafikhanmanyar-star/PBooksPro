/**
 * Database Configuration
 * 
 * Platform-aware database configuration:
 * - Desktop: Local PostgreSQL + Cloud PostgreSQL
 * - Mobile: Cloud PostgreSQL only
 */

export interface LocalPostgreSQLConfig {
  enabled: boolean;
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl?: boolean;
  maxConnections?: number;
}

export interface CloudPostgreSQLConfig {
  enabled: boolean;
  connectionString: string;
  ssl?: boolean;
  maxConnections?: number;
}

export interface DatabaseConfig {
  local: LocalPostgreSQLConfig;
  staging: CloudPostgreSQLConfig;
  production: CloudPostgreSQLConfig;
}

/**
 * Get database configuration based on environment
 */
export function getDatabaseConfig(): DatabaseConfig {
  const isDevelopment = process.env.NODE_ENV === 'development';
  const isStaging = process.env.NODE_ENV === 'staging';
  const isProduction = process.env.NODE_ENV === 'production';

  return {
    local: {
      enabled: isDevelopment || isStaging, // Enable local DB for dev/staging
      host: process.env.LOCAL_DB_HOST || 'localhost',
      port: parseInt(process.env.LOCAL_DB_PORT || '5432', 10),
      database: process.env.LOCAL_DB_NAME || 'pbookspro_local',
      user: process.env.LOCAL_DB_USER || 'pbookspro',
      password: process.env.LOCAL_DB_PASSWORD || '',
      ssl: false,
      maxConnections: 10,
    },
    staging: {
      enabled: isStaging,
      connectionString: process.env.STAGING_DATABASE_URL || '',
      ssl: true,
      maxConnections: 20,
    },
    production: {
      enabled: isProduction,
      connectionString: process.env.DATABASE_URL || '',
      ssl: true,
      maxConnections: 20,
    },
  };
}

/**
 * Get the appropriate cloud database connection string
 * Based on current environment (staging or production)
 */
export function getCloudDatabaseConnectionString(): string {
  const config = getDatabaseConfig();
  const isStaging = process.env.NODE_ENV === 'staging';
  
  if (isStaging && config.staging.enabled && config.staging.connectionString) {
    return config.staging.connectionString;
  }
  
  if (config.production.enabled && config.production.connectionString) {
    return config.production.connectionString;
  }
  
  throw new Error('No cloud database connection string configured');
}

/**
 * Check if local PostgreSQL is enabled and configured
 */
export function isLocalPostgreSQLEnabled(): boolean {
  const config = getDatabaseConfig();
  return config.local.enabled && !!config.local.host;
}

/**
 * Check if cloud PostgreSQL is enabled and configured
 */
export function isCloudPostgreSQLEnabled(): boolean {
  const config = getDatabaseConfig();
  try {
    const connectionString = getCloudDatabaseConnectionString();
    return !!connectionString;
  } catch {
    return false;
  }
}
