/**
 * Run WhatsApp integration migration
 * This adds whatsapp_configs and whatsapp_messages tables
 */

import { Pool } from 'pg';
import dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config();

async function runWhatsAppMigration() {
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
    console.log('🔄 Running WhatsApp integration migration...');
    
    // Find migration file
    const possiblePaths = [
      join(__dirname, '../migrations/add-whatsapp-integration.sql'),
      join(__dirname, '../../migrations/add-whatsapp-integration.sql'),
      join(process.cwd(), 'server/migrations/add-whatsapp-integration.sql'),
      join(process.cwd(), 'migrations/add-whatsapp-integration.sql'),
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
      throw new Error(`Could not find add-whatsapp-integration.sql. Tried: ${possiblePaths.join(', ')}`);
    }
    
    console.log('📋 Reading migration from:', migrationPath);
    const migrationSQL = readFileSync(migrationPath, 'utf8');
    
    // Execute migration
    await pool.query(migrationSQL);
    
    console.log('✅ WhatsApp integration migration completed successfully');
    
    await pool.end();
  } catch (error: any) {
    console.error('❌ Migration error:', error.message);
    
    // Check if tables already exist
    if (error.code === '42P07') {
      console.log('⚠️  Tables already exist (this is normal if migration was run before)');
      console.log('✅ Migration skipped');
    } else {
      console.error('Error details:', error);
      await pool.end();
      process.exit(1);
    }
  }
}

runWhatsAppMigration().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
