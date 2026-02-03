#!/usr/bin/env node

/**
 * Quick test script to query the database
 * This can be used to test database connectivity before configuring MCP server
 */

import { Pool } from 'pg';
import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables - try multiple paths
const envPaths = [
  resolve(__dirname, '../server/.env'),
  resolve(__dirname, '../.env'),
  resolve(process.cwd(), 'server/.env'),
  resolve(process.cwd(), '.env'),
];

let envLoaded = false;
for (const envPath of envPaths) {
  const result = dotenv.config({ path: envPath });
  if (!result.error) {
    console.log(`✅ Loaded .env from: ${envPath}`);
    envLoaded = true;
    break;
  }
}

if (!envLoaded) {
  console.warn('⚠️  Could not load .env file, using environment variables');
}

const connectionString = process.env.DATABASE_URL || '';

if (!connectionString) {
  console.error('❌ DATABASE_URL environment variable is not set');
  console.error('   Please set DATABASE_URL in server/.env file');
  process.exit(1);
}

const pool = new Pool({
  connectionString,
  ssl: process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging' 
    ? { rejectUnauthorized: false } 
    : false,
});

async function queryTenantCount() {
  try {
    console.log('🔍 Querying database for tenant count...\n');
    
    const result = await pool.query('SELECT COUNT(*) as count FROM tenants');
    const count = result.rows[0].count;
    
    console.log(`✅ Total tenants in database: ${count}\n`);
    
    // Get additional info
    const activeResult = await pool.query(
      "SELECT COUNT(*) as count FROM tenants WHERE license_status = 'active'"
    );
    const activeCount = activeResult.rows[0].count;
    
    const expiredResult = await pool.query(
      "SELECT COUNT(*) as count FROM tenants WHERE license_status = 'expired'"
    );
    const expiredCount = expiredResult.rows[0].count;
    
    console.log('📊 Breakdown:');
    console.log(`   Active: ${activeCount}`);
    console.log(`   Expired: ${expiredCount}`);
    console.log(`   Other: ${parseInt(count) - parseInt(activeCount) - parseInt(expiredCount)}`);
    
    await pool.end();
  } catch (error: any) {
    console.error('❌ Error querying database:', error.message);
    process.exit(1);
  }
}

queryTenantCount();
