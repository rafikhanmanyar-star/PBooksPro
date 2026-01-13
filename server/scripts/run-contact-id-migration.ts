/**
 * Run contact_id migration for rental_agreements table
 * This adds the missing contact_id column to store tenant contact information
 */

import { Pool } from 'pg';
import dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config();

async function runContactIdMigration() {
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
    console.log('🔄 Running contact_id migration for rental_agreements...');
    
    // Read migration SQL file
    const possiblePaths = [
      join(__dirname, '../migrations/add-contact-id-to-rental-agreements.sql'),
      join(__dirname, '../../migrations/add-contact-id-to-rental-agreements.sql'),
      join(process.cwd(), 'server/migrations/add-contact-id-to-rental-agreements.sql'),
      join(process.cwd(), 'migrations/add-contact-id-to-rental-agreements.sql'),
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
      throw new Error(`Could not find add-contact-id-to-rental-agreements.sql. Tried: ${possiblePaths.join(', ')}`);
    }
    
    console.log('📋 Reading migration from:', migrationPath);
    const migrationSQL = readFileSync(migrationPath, 'utf8');
    
    // Execute migration
    await pool.query(migrationSQL);
    console.log('✅ contact_id migration completed successfully');
    console.log('   ℹ️  Column contact_id has been added to rental_agreements table');
    console.log('   ℹ️  Foreign key constraint and index have been created');
    
  } catch (error: any) {
    // Check if error is because column already exists
    if (error.code === '42701' && error.message.includes('contact_id')) {
      console.log('   ℹ️  contact_id column already exists (migration already applied)');
    } else if (error.code === '42P07' && error.message.includes('idx_rental_agreements_contact_id')) {
      console.log('   ℹ️  contact_id index already exists (migration already applied)');
    } else {
      console.error('❌ Migration failed:', error.message);
      throw error;
    }
  } finally {
    await pool.end();
  }
}

// Run migration
runContactIdMigration()
  .then(() => {
    console.log('✅ Migration script completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Migration script failed:', error);
    process.exit(1);
  });
