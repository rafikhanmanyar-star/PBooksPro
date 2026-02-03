#!/usr/bin/env node

/**
 * CLI tool to run database queries using MCP server's database connection
 * Usage:
 *   npm run query "SELECT * FROM tenants LIMIT 5"
 *   npm run query "SELECT COUNT(*) FROM contacts WHERE type = 'Broker'"
 */

import { Pool } from 'pg';
import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables - try multiple paths (same as MCP server)
const envPaths = [
  resolve(__dirname, '../server/.env'),  // From mcp-server/ to server/.env
  resolve(__dirname, '../../server/.env'), // From mcp-server/dist/ to server/.env (when built)
  resolve(__dirname, '../.env'),        // From mcp-server/ to root .env
  resolve(__dirname, '../../.env'),     // From mcp-server/dist/ to root .env (when built)
  resolve(process.cwd(), 'server/.env'),
  resolve(process.cwd(), '.env'),
];

let envLoaded = false;
for (const envPath of envPaths) {
  const result = dotenv.config({ path: envPath });
  if (!result.error) {
    envLoaded = true;
    break;
  }
}

if (!envLoaded && !process.env.DATABASE_URL) {
  console.error('⚠️  Warning: Could not load .env file. Using DATABASE_URL from environment.');
}

// Database connection (same as MCP server)
// Try STAGING_DATABASE_URL first (from server/.env), then DATABASE_URL
const connectionString = process.env.STAGING_DATABASE_URL || process.env.DATABASE_URL || '';
if (!connectionString) {
  console.error('❌ DATABASE_URL or STAGING_DATABASE_URL environment variable is not set');
  console.error('   Please set STAGING_DATABASE_URL or DATABASE_URL in server/.env file');
  process.exit(1);
}

// Enable SSL for Render.com databases (they always require SSL)
// Check if connection string contains render.com or if NODE_ENV is set
const requiresSSL = 
  connectionString.includes('render.com') || 
  connectionString.includes('amazonaws.com') ||
  process.env.NODE_ENV === 'production' || 
  process.env.NODE_ENV === 'staging';

const pool = new Pool({
  connectionString,
  ssl: requiresSSL ? { rejectUnauthorized: false } : false,
  max: 5,
});

// Handle pool errors gracefully
pool.on('error', (err) => {
  console.error('❌ Unexpected database pool error:', err);
});

// Parse command line arguments
const args = process.argv.slice(2);

if (args.length === 0) {
  console.log(`
🔍 MCP Server Database Query CLI

Usage:
  npm run query "SELECT * FROM tenants LIMIT 5"
  npm run query "SELECT COUNT(*) FROM contacts WHERE type = 'Broker'"
  npm run query "SELECT * FROM users WHERE tenant_id = 'tenant_123'"

Available Commands:
  query <sql>     - Run a SELECT query
  tables          - List all tables
  schema <table>  - Show schema of a table
  tenant <email>  - Get tenant info by email
  help            - Show this help message

Examples:
  npm run query "SELECT COUNT(*) FROM tenants"
  npm run query tables
  npm run query schema tenants
  npm run query tenant J7@empo.com
`);
  process.exit(0);
}

const command = args[0].toLowerCase();

async function runQuery() {
  try {
    if (command === 'help') {
      console.log(`
🔍 MCP Server Database Query CLI

Usage:
  npm run query "SELECT * FROM tenants LIMIT 5"
  npm run query "SELECT COUNT(*) FROM contacts WHERE type = 'Broker'"

Available Commands:
  query <sql>     - Run a SELECT query
  tables          - List all tables
  schema <table>  - Show schema of a table
  tenant <email>  - Get tenant info by email
  help            - Show this help message

Examples:
  npm run query "SELECT COUNT(*) FROM tenants"
  npm run query tables
  npm run query schema tenants
  npm run query tenant J7@empo.com
`);
      await pool.end();
      return;
    }

    if (command === 'tables') {
      console.log('📋 Listing all tables...\n');
      const result = await pool.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_type = 'BASE TABLE'
        ORDER BY table_name
      `);
      
      console.log('Tables:');
      result.rows.forEach((row: any) => {
        console.log(`  - ${row.table_name}`);
      });
      console.log(`\nTotal: ${result.rows.length} tables`);
      await pool.end();
      return;
    }

    if (command === 'schema') {
      const tableName = args[1];
      if (!tableName) {
        console.error('❌ Please provide a table name');
        console.error('   Usage: npm run query schema <table_name>');
        await pool.end();
        process.exit(1);
      }

      console.log(`📊 Schema for table: ${tableName}\n`);
      const result = await pool.query(`
        SELECT 
          column_name,
          data_type,
          is_nullable,
          column_default,
          character_maximum_length
        FROM information_schema.columns
        WHERE table_name = $1
        ORDER BY ordinal_position
      `, [tableName]);

      if (result.rows.length === 0) {
        console.error(`❌ Table "${tableName}" not found`);
        await pool.end();
        process.exit(1);
      }

      console.log('Columns:');
      result.rows.forEach((col: any) => {
        const nullable = col.is_nullable === 'YES' ? 'NULL' : 'NOT NULL';
        const maxLength = col.character_maximum_length ? `(${col.character_maximum_length})` : '';
        const defaultValue = col.column_default ? ` DEFAULT ${col.column_default}` : '';
        console.log(`  ${col.column_name.padEnd(30)} ${col.data_type}${maxLength} ${nullable}${defaultValue}`);
      });
      await pool.end();
      return;
    }

    if (command === 'tenant') {
      const email = args[1];
      if (!email) {
        console.error('❌ Please provide a tenant email');
        console.error('   Usage: npm run query tenant <email>');
        await pool.end();
        process.exit(1);
      }

      console.log(`🔍 Looking up tenant: ${email}\n`);
      const result = await pool.query(
        'SELECT * FROM tenants WHERE email = $1',
        [email]
      );

      if (result.rows.length === 0) {
        console.log(`❌ No tenant found with email: ${email}`);
        await pool.end();
        return;
      }

      console.log(JSON.stringify(result.rows[0], null, 2));
      await pool.end();
      return;
    }

    // Default: treat as SQL query
    let query = args.join(' ');
    
    // Safety: Only allow SELECT queries (same as MCP server)
    const trimmedQuery = query.trim().toUpperCase();
    if (!trimmedQuery.startsWith('SELECT')) {
      console.error('❌ Only SELECT queries are allowed for safety.');
      console.error('   INSERT, UPDATE, DELETE operations are not permitted.');
      await pool.end();
      process.exit(1);
    }

    console.log(`🔍 Running query...\n`);
    console.log(`SQL: ${query}\n`);

    const result = await pool.query(query);
    
    if (result.rows.length === 0) {
      console.log('✅ Query executed successfully (0 rows returned)');
      await pool.end();
      return;
    }

    // Pretty print results
    console.log('Results:');
    console.log(JSON.stringify(result.rows, null, 2));
    console.log(`\n✅ Returned ${result.rows.length} row(s)`);
    
    await pool.end();
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    if (error.code) {
      console.error(`   Code: ${error.code}`);
    }
    await pool.end();
    process.exit(1);
  }
}

runQuery();
