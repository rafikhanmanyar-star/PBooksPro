/**
 * Run database migrations on server startup
 * This ensures the database schema is always up to date
 */

import { Pool } from 'pg';
import dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config();

/**
 * Check if a migration has already been applied
 */
async function isMigrationApplied(pool: Pool, migrationName: string): Promise<boolean> {
  try {
    const result = await pool.query(
      'SELECT 1 FROM schema_migrations WHERE migration_name = $1',
      [migrationName]
    );
    return result.rows.length > 0;
  } catch (error: any) {
    // If table doesn't exist yet, migration hasn't been applied
    if (error.code === '42P01') {
      return false;
    }
    throw error;
  }
}

/**
 * Record that a migration has been applied
 */
async function recordMigration(
  pool: Pool,
  migrationName: string,
  executionTimeMs: number,
  notes?: string
): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO schema_migrations (migration_name, execution_time_ms, notes)
       VALUES ($1, $2, $3)
       ON CONFLICT (migration_name) DO NOTHING`,
      [migrationName, executionTimeMs, notes || null]
    );
  } catch (error: any) {
    // If table doesn't exist yet, that's okay - it will be created by schema
    if (error.code === '42P01') {
      console.warn(`   ⚠️  schema_migrations table not found, skipping migration record`);
    } else {
      throw error;
    }
  }
}

/**
 * Run a migration file if it hasn't been applied yet
 */
async function runMigrationIfNeeded(
  pool: Pool,
  migrationName: string,
  migrationPaths: string[],
  description?: string
): Promise<boolean> {
  // Check if already applied
  if (await isMigrationApplied(pool, migrationName)) {
    console.log(`   ⏭️  ${migrationName} already applied (skipping)`);
    return false;
  }

  // Find migration file
  let migrationPath: string | null = null;
  for (const path of migrationPaths) {
    try {
      readFileSync(path, 'utf8');
      migrationPath = path;
      break;
    } catch (e) {
      // Try next path
    }
  }

  if (!migrationPath) {
    console.warn(`   ⚠️  Could not find ${migrationName} migration file`);
    return false;
  }

  const startTime = Date.now();
  try {
    console.log(`📋 Running ${migrationName}${description ? `: ${description}` : ''}...`);
    const migrationSQL = readFileSync(migrationPath, 'utf8');
    await pool.query(migrationSQL);
    const executionTime = Date.now() - startTime;
    await recordMigration(pool, migrationName, executionTime);
    console.log(`✅ ${migrationName} completed (${executionTime}ms)`);
    return true;
  } catch (error: any) {
    const executionTime = Date.now() - startTime;
    // Handle common "already exists" errors gracefully
    if (
      error.code === '42P07' || // table already exists
      error.code === '42701' || // column already exists
      error.code === '42710' || // constraint already exists
      error.message?.includes('already exists')
    ) {
      console.log(`   ℹ️  ${migrationName} already applied (skipping)`);
      await recordMigration(pool, migrationName, executionTime, 'Already existed, marked as applied');
      return false;
    } else {
      console.error(`   ❌ ${migrationName} failed:`, error.message);
      throw error;
    }
  }
}

async function runMigrations() {
  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL environment variable is not set');
    process.exit(1);
  }

  // Enable SSL for production, staging, and any Render database URLs
  const shouldUseSSL = process.env.NODE_ENV === 'production' ||
    process.env.NODE_ENV === 'staging' ||
    (process.env.DATABASE_URL && process.env.DATABASE_URL.includes('.render.com'));

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: shouldUseSSL ? { rejectUnauthorized: false } : false,
  });

  try {
    console.log('🔄 Running database migrations (Consolidated Flow)...');

    // 1. Find and run the base schema
    const migrationsDir = join(process.cwd(), 'server/migrations');
    const schemaPath = join(migrationsDir, 'postgresql-schema.sql');

    console.log('📋 Reading base schema from:', schemaPath);
    const schemaSQL = readFileSync(schemaPath, 'utf8');

    const schemaStartTime = Date.now();
    try {
      await pool.query(schemaSQL);
      const schemaExecutionTime = Date.now() - schemaStartTime;
      // Record schema migration (only if not already recorded)
      if (!(await isMigrationApplied(pool, 'postgresql-schema'))) {
        await recordMigration(pool, 'postgresql-schema', schemaExecutionTime, 'Consolidated database schema');
      }
    } catch (error: any) {
      if (error.code === '42710' && error.message.includes('policy')) {
        console.log('   ⚠️  Some policies already exist');
      } else {
        throw error;
      }
    }

    console.log('✅ Database schema verified');

    // 2. Automatically run any NEW migrations found in the migrations folder
    // This allows for incremental updates in the future without updating this runner
    const fs = await import('fs');
    const migrationFiles = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql') && f !== 'postgresql-schema.sql')
      .sort(); // Sort alphabetically to ensure predictable order

    if (migrationFiles.length > 0) {
      console.log(`🔄 Checking ${migrationFiles.length} potential incremental migrations...`);
      for (const file of migrationFiles) {
        const migrationName = file.replace('.sql', '');
        const filePath = join(migrationsDir, file);
        await runMigrationIfNeeded(pool, migrationName, [filePath], `Auto-discovered migration`);
      }
    } else {
      console.log('✨ No additional migrations found.');
    }

    // Create default admin user if it doesn't exist
    console.log('👤 Ensuring admin user exists...');
    const bcrypt = await import('bcryptjs');
    const defaultPassword = await bcrypt.default.hash('admin123', 10);

    await pool.query(
      `INSERT INTO admin_users (id, username, name, email, password, role)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (username) DO NOTHING`,
      [
        'admin_1',
        'Admin',
        'Super Admin',
        'admin@pbookspro.com',
        defaultPassword,
        'super_admin'
      ]
    );

    console.log('✅ Admin user ready (username: Admin, password: admin123)');
    console.log('   ⚠️  Please change the password after first login!');

  } catch (error: any) {
    console.error('❌ Migration failed:', error.message);
    // Don't exit - let the server start anyway (schema might already exist)
    console.warn('⚠️  Continuing startup despite migration error...');
  } finally {
    await pool.end();
  }
}

// Run migrations if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runMigrations()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

export { runMigrations };

