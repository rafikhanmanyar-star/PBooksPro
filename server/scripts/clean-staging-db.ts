/**
 * Clean Staging Database - Remove all data except WhatsApp tables
 * 
 * This script will:
 * - Connect to the staging database
 * - List all tables
 * - Preserve WhatsApp tables (whatsapp_configs, whatsapp_messages)
 * - Truncate all other tables
 * 
 * ⚠️ WARNING: This will permanently delete all data except WhatsApp tables!
 * Make sure you're connected to the STAGING database, not production!
 */

import { Pool } from 'pg';
import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import * as readline from 'readline';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: resolve(__dirname, '../.env') });

// WhatsApp tables to preserve
const WHATSAPP_TABLES = ['whatsapp_configs', 'whatsapp_messages'];

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(query: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(query, resolve);
  });
}

async function cleanStagingDatabase() {
  // Check DATABASE_URL
  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL environment variable is not set');
    console.log('\n💡 Create a .env file in the server folder with:');
    console.log('   DATABASE_URL=postgresql://user:password@host:port/database');
    process.exit(1);
  }

  const dbUrl = process.env.DATABASE_URL;
  
  // Safety check: Warn if not staging
  const isStaging = dbUrl.includes('staging') || dbUrl.includes('_staging') || process.env.NODE_ENV === 'staging';
  
  if (!isStaging) {
    console.warn('⚠️  WARNING: DATABASE_URL does not appear to be staging!');
    console.warn('   URL:', dbUrl.replace(/:[^:@]+@/, ':****@')); // Hide password
    console.warn('\n   This script is designed for STAGING database only!');
    
    const confirm = await question('\n   Are you SURE you want to continue? (type "yes" to confirm): ');
    if (confirm.toLowerCase() !== 'yes') {
      console.log('❌ Operation cancelled');
      process.exit(0);
    }
  }

  console.log('\n🔍 Connecting to database...');
  const pool = new Pool({
    connectionString: dbUrl,
    ssl: process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging' 
      ? { rejectUnauthorized: false } 
      : false,
  });

  try {
    // Test connection
    await pool.query('SELECT NOW()');
    console.log('✅ Database connection successful\n');

    // Get all tables in public schema
    console.log('📊 Fetching list of tables...');
    const tablesResult = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);

    const allTables = tablesResult.rows.map((row: any) => row.table_name);
    
    if (allTables.length === 0) {
      console.log('📊 No tables found in database');
      await pool.end();
      process.exit(0);
    }

    // Separate WhatsApp tables from others
    const whatsappTables = allTables.filter(table => 
      WHATSAPP_TABLES.includes(table) || table.toLowerCase().includes('whatsapp')
    );
    const tablesToClean = allTables.filter(table => 
      !WHATSAPP_TABLES.includes(table) && !table.toLowerCase().includes('whatsapp')
    );

    console.log(`\n📋 Found ${allTables.length} tables:`);
    console.log(`   - ${whatsappTables.length} WhatsApp table(s) (will be preserved):`);
    whatsappTables.forEach(table => {
      console.log(`     ✓ ${table}`);
    });
    console.log(`   - ${tablesToClean.length} table(s) to clean:`);
    tablesToClean.forEach(table => {
      console.log(`     ✗ ${table}`);
    });

    if (tablesToClean.length === 0) {
      console.log('\n✅ No tables to clean (all tables are WhatsApp tables)');
      await pool.end();
      process.exit(0);
    }

    // Show row counts before deletion
    console.log('\n📊 Checking row counts...');
    const rowCounts: { [key: string]: number } = {};
    let totalRows = 0;

    for (const table of tablesToClean) {
      try {
        const countResult = await pool.query(`SELECT COUNT(*) as count FROM ${table}`);
        const count = parseInt(countResult.rows[0].count);
        rowCounts[table] = count;
        totalRows += count;
      } catch (error: any) {
        console.warn(`   ⚠️  Could not count rows in ${table}: ${error.message}`);
        rowCounts[table] = -1;
      }
    }

    console.log('\n📈 Row counts:');
    Object.entries(rowCounts).forEach(([table, count]) => {
      if (count >= 0) {
        console.log(`   ${table}: ${count.toLocaleString()} rows`);
      } else {
        console.log(`   ${table}: (unable to count)`);
      }
    });
    console.log(`\n   Total rows to delete: ${totalRows.toLocaleString()}`);

    // Final confirmation
    console.log('\n⚠️  WARNING: This will permanently delete all data from the above tables!');
    console.log('   WhatsApp tables will be preserved.');
    
    const confirm = await question('\n   Type "DELETE ALL" (in uppercase) to confirm: ');
    
    if (confirm !== 'DELETE ALL') {
      console.log('❌ Operation cancelled - confirmation text did not match');
      await pool.end();
      process.exit(0);
    }

    // Disable foreign key checks temporarily (PostgreSQL doesn't have this, but we'll handle CASCADE)
    console.log('\n🧹 Starting cleanup...\n');

    let successCount = 0;
    let errorCount = 0;

    // Truncate tables with CASCADE to handle foreign key constraints
    for (const table of tablesToClean) {
      try {
        // Use TRUNCATE with CASCADE to handle foreign key constraints
        await pool.query(`TRUNCATE TABLE ${table} CASCADE`);
        console.log(`   ✅ Cleaned: ${table}`);
        successCount++;
      } catch (error: any) {
        console.error(`   ❌ Error cleaning ${table}: ${error.message}`);
        errorCount++;
      }
    }

    // Verify WhatsApp tables are still intact
    console.log('\n🔍 Verifying WhatsApp tables are preserved...');
    for (const table of whatsappTables) {
      try {
        const countResult = await pool.query(`SELECT COUNT(*) as count FROM ${table}`);
        const count = parseInt(countResult.rows[0].count);
        console.log(`   ✅ ${table}: ${count.toLocaleString()} rows (preserved)`);
      } catch (error: any) {
        console.warn(`   ⚠️  ${table}: Could not verify (${error.message})`);
      }
    }

    // Summary
    console.log('\n📊 Cleanup Summary:');
    console.log(`   ✅ Successfully cleaned: ${successCount} table(s)`);
    if (errorCount > 0) {
      console.log(`   ❌ Errors: ${errorCount} table(s)`);
    }
    console.log(`   ✅ Preserved: ${whatsappTables.length} WhatsApp table(s)`);
    console.log('\n✅ Cleanup completed!');

  } catch (error: any) {
    console.error('\n❌ Error:', error.message);
    if (error.code === 'ENOTFOUND') {
      console.error('\n💡 Possible issues:');
      console.error('   1. Hostname is incorrect in DATABASE_URL');
      console.error('   2. Database server is not running');
      console.error('   3. Network connectivity issue');
    } else if (error.code === '28P01') {
      console.error('\n💡 Authentication failed:');
      console.error('   1. Check username and password in DATABASE_URL');
    } else if (error.code === '3D000') {
      console.error('\n💡 Database does not exist');
    }
    process.exit(1);
  } finally {
    await pool.end();
    rl.close();
  }
}

// Run the script
cleanStagingDatabase()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  });
