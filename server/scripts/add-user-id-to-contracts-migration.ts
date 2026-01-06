/**
 * Standalone migration script to add user_id column to contracts table
 * Run this script to add the user_id column to existing databases
 * 
 * Usage:
 *   npx tsx server/scripts/add-user-id-to-contracts-migration.ts
 *   or
 *   node dist/scripts/add-user-id-to-contracts-migration.js
 */

import { Pool } from 'pg';
import dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config();

async function runContractsUserIdMigration() {
  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL environment variable is not set');
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  });

  try {
    console.log('🔄 Running user_id migration for contracts table...');
    
    // Try multiple paths to find the migration file
    const possiblePaths = [
      join(__dirname, '../migrations/add-user-id-to-contracts.sql'),
      join(__dirname, '../../migrations/add-user-id-to-contracts.sql'),
      join(process.cwd(), 'server/migrations/add-user-id-to-contracts.sql'),
      join(process.cwd(), 'migrations/add-user-id-to-contracts.sql'),
    ];
    
    let migrationPath: string | null = null;
    for (const path of possiblePaths) {
      try {
        readFileSync(path, 'utf8');
        migrationPath = path;
        break;
      } catch (e) {
        // Try next path
      }
    }
    
    if (!migrationPath) {
      throw new Error(`Could not find add-user-id-to-contracts.sql. Tried: ${possiblePaths.join(', ')}`);
    }
    
    console.log('📋 Reading migration from:', migrationPath);
    const migrationSQL = readFileSync(migrationPath, 'utf8');
    
    // Execute migration
    await pool.query(migrationSQL);
    
    console.log('✅ user_id migration completed successfully!');
    console.log('   The contracts table now has a user_id column.');
    
  } catch (error: any) {
    // Check if column already exists
    if (error.code === '42701' && error.message.includes('user_id')) {
      console.log('✅ user_id column already exists - migration already applied');
    } else if (error.code === '42P07' && error.message.includes('idx_contracts_user_id')) {
      console.log('✅ user_id index already exists - migration already applied');
    } else {
      console.error('❌ Migration failed:', error.message);
      console.error('   Error details:', error);
      throw error;
    }
  } finally {
    await pool.end();
  }
}

// Run migration if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.includes('add-user-id-to-contracts-migration')) {
  runContractsUserIdMigration()
    .then(() => {
      console.log('✅ Migration script completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Migration script failed:', error);
      process.exit(1);
    });
}

export { runContractsUserIdMigration };

