/**
 * Check if recurring_invoice_templates table exists in production database
 */

import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

async function checkTable() {
  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL environment variable is not set');
    process.exit(1);
  }

  const shouldUseSSL = process.env.NODE_ENV === 'production' ||
    process.env.NODE_ENV === 'staging' ||
    (process.env.DATABASE_URL && process.env.DATABASE_URL.includes('.render.com'));

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: shouldUseSSL ? { rejectUnauthorized: false } : false,
  });

  try {
    console.log('🔍 Checking if recurring_invoice_templates table exists...\n');

    // Check if table exists
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'recurring_invoice_templates'
      ) AS table_exists
    `);

    const tableExists = tableCheck.rows[0].table_exists;
    console.log(`Table exists: ${tableExists ? '✅ YES' : '❌ NO'}\n`);

    if (tableExists) {
      // Check table structure
      console.log('📋 Table structure:');
      const columns = await pool.query(`
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_name = 'recurring_invoice_templates'
        ORDER BY ordinal_position
      `);
      
      console.table(columns.rows);

      // Check if RLS is enabled
      const rlsCheck = await pool.query(`
        SELECT relrowsecurity
        FROM pg_class
        WHERE relname = 'recurring_invoice_templates'
      `);
      
      const rlsEnabled = rlsCheck.rows[0]?.relrowsecurity;
      console.log(`\n🔒 Row Level Security: ${rlsEnabled ? '✅ ENABLED' : '❌ DISABLED'}`);

      // Check policies
      const policies = await pool.query(`
        SELECT policyname, permissive, roles, cmd, qual, with_check
        FROM pg_policies
        WHERE tablename = 'recurring_invoice_templates'
      `);
      
      if (policies.rows.length > 0) {
        console.log('\n🛡️ RLS Policies:');
        console.table(policies.rows);
      } else {
        console.log('\n⚠️ No RLS policies found');
      }

      // Check if get_current_tenant_id function exists
      const functionCheck = await pool.query(`
        SELECT EXISTS (
          SELECT FROM pg_proc
          WHERE proname = 'get_current_tenant_id'
        ) AS function_exists
      `);
      
      const functionExists = functionCheck.rows[0].function_exists;
      console.log(`\n🔧 get_current_tenant_id function: ${functionExists ? '✅ EXISTS' : '❌ MISSING'}`);

      // Count records
      const countResult = await pool.query('SELECT COUNT(*) FROM recurring_invoice_templates');
      console.log(`\n📊 Total records: ${countResult.rows[0].count}`);

      // Check migration status
      console.log('\n📜 Migration status:');
      const migrations = await pool.query(`
        SELECT migration_name, applied_at, execution_time_ms, notes
        FROM schema_migrations
        WHERE migration_name LIKE '%recurring%'
        ORDER BY applied_at DESC
      `);
      
      if (migrations.rows.length > 0) {
        console.table(migrations.rows);
      } else {
        console.log('⚠️ No recurring template migrations found in schema_migrations table');
      }
    } else {
      console.log('❌ Table does not exist. The migration needs to be run.');
      
      // Check if migration files exist
      console.log('\n📜 Checking migration status:');
      const migrations = await pool.query(`
        SELECT migration_name, applied_at
        FROM schema_migrations
        WHERE migration_name LIKE '%recurring%'
        ORDER BY applied_at DESC
      `);
      
      if (migrations.rows.length > 0) {
        console.log('Found recurring template migrations:');
        console.table(migrations.rows);
      } else {
        console.log('⚠️ No recurring template migrations have been applied');
      }
    }

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    if (error.code) {
      console.error('Error code:', error.code);
    }
  } finally {
    await pool.end();
  }
}

checkTable()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
