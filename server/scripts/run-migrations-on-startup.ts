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
    console.log('🔄 Running database migrations...');
    
    // Read and execute PostgreSQL schema
    // Try multiple paths to find the SQL file (works in both dev and production)
    const possiblePaths = [
      join(__dirname, '../migrations/postgresql-schema.sql'),      // dist/scripts -> dist/migrations
      join(__dirname, '../../migrations/postgresql-schema.sql'),  // dist/scripts -> migrations (source)
      join(process.cwd(), 'server/migrations/postgresql-schema.sql'), // From project root
      join(process.cwd(), 'migrations/postgresql-schema.sql'),    // From project root (if in server/)
    ];
    
    let schemaPath: string | null = null;
    for (const path of possiblePaths) {
      try {
        readFileSync(path, 'utf8'); // Test if file exists
        schemaPath = path;
        break;
      } catch (e) {
        // Try next path
      }
    }
    
    if (!schemaPath) {
      throw new Error(`Could not find postgresql-schema.sql. Tried: ${possiblePaths.join(', ')}`);
    }
    
    console.log('📋 Reading schema from:', schemaPath);
    const schemaSQL = readFileSync(schemaPath, 'utf8');
    
    // Execute schema - DROP IF EXISTS and CREATE IF NOT EXISTS ensure idempotency
    try {
      await pool.query(schemaSQL);
    } catch (error: any) {
      // If it's a policy error, it's likely already exists - that's okay
      if (error.code === '42710' && error.message.includes('policy')) {
        console.log('   ⚠️  Some policies already exist (this is normal)');
      } else {
        throw error;
      }
    }
    
    console.log('✅ Database migrations completed successfully');
    
    // Run additional migrations
    console.log('🔄 Running additional migrations...');
    
    // Migration: Add user_id to transactions table
    const userIdMigrationPaths = [
      join(__dirname, '../migrations/add-user-id-to-transactions.sql'),
      join(__dirname, '../../migrations/add-user-id-to-transactions.sql'),
      join(process.cwd(), 'server/migrations/add-user-id-to-transactions.sql'),
      join(process.cwd(), 'migrations/add-user-id-to-transactions.sql'),
    ];
    
    let userIdMigrationPath: string | null = null;
    for (const path of userIdMigrationPaths) {
      try {
        readFileSync(path, 'utf8');
        userIdMigrationPath = path;
        break;
      } catch (e) {
        // Try next path
      }
    }
    
    if (userIdMigrationPath) {
      try {
        console.log('📋 Running user_id migration from:', userIdMigrationPath);
        const userIdMigrationSQL = readFileSync(userIdMigrationPath, 'utf8');
        await pool.query(userIdMigrationSQL);
        console.log('✅ user_id migration completed');
      } catch (error: any) {
        // If column already exists, that's okay
        if (error.code === '42701' && error.message.includes('user_id')) {
          console.log('   ℹ️  user_id column already exists (skipping)');
        } else if (error.code === '42P07' && error.message.includes('idx_transactions_user_id')) {
          console.log('   ℹ️  user_id index already exists (skipping)');
        } else {
          console.warn('   ⚠️  user_id migration warning:', error.message);
          // Don't throw - migration might already be applied
        }
      }
    } else {
      console.warn('   ⚠️  Could not find add-user-id-to-transactions.sql migration file');
    }
    
    // Run additional migrations
    console.log('🔄 Running additional migrations...');
    
    // Migration: Add payment_id column to license_history (if missing)
    try {
      const columnCheck = await pool.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'license_history' AND column_name = 'payment_id'
      `);
      
      if (columnCheck.rows.length === 0) {
        console.log('📋 Adding payment_id column to license_history...');
        await pool.query('ALTER TABLE license_history ADD COLUMN payment_id TEXT');
        console.log('✅ Added payment_id column to license_history');
      }
    } catch (migrationError: any) {
      console.warn('   ⚠️  payment_id migration warning:', migrationError.message);
      // Don't throw - migration might already be applied or table might not exist yet
    }
    
    // Migration: Make transaction_audit_log.user_id nullable
    const auditLogMigrationPath = join(__dirname, '../migrations/make-audit-log-user-id-nullable.sql');
    const auditLogMigrationAltPath = join(process.cwd(), 'server/migrations/make-audit-log-user-id-nullable.sql');
    
    let auditLogMigrationSQL: string | null = null;
    try {
      auditLogMigrationSQL = readFileSync(auditLogMigrationPath, 'utf8');
    } catch (e) {
      try {
        auditLogMigrationSQL = readFileSync(auditLogMigrationAltPath, 'utf8');
      } catch (e2) {
        // Migration file not found - that's okay, might not exist yet
      }
    }
    
    if (auditLogMigrationSQL) {
      try {
        await pool.query(auditLogMigrationSQL);
        console.log('   ✅ Made transaction_audit_log.user_id nullable');
      } catch (error: any) {
        // If column is already nullable or doesn't exist, that's okay
        if (error.code === '42703' || error.message.includes('does not exist') || 
            error.message.includes('already nullable')) {
          console.log('   ℹ️  transaction_audit_log.user_id migration already applied (skipping)');
        } else {
          console.warn('   ⚠️  transaction_audit_log.user_id migration warning:', error.message);
          // Don't throw - migration might already be applied
        }
      }
    }
    
    // Migration: Add contact_id to rental_agreements table
    const contactIdMigrationPaths = [
      join(__dirname, '../migrations/add-contact-id-to-rental-agreements.sql'),
      join(__dirname, '../../migrations/add-contact-id-to-rental-agreements.sql'),
      join(process.cwd(), 'server/migrations/add-contact-id-to-rental-agreements.sql'),
      join(process.cwd(), 'migrations/add-contact-id-to-rental-agreements.sql'),
    ];
    
    let contactIdMigrationPath: string | null = null;
    for (const path of contactIdMigrationPaths) {
      try {
        readFileSync(path, 'utf8');
        contactIdMigrationPath = path;
        break;
      } catch (e) {
        // Try next path
      }
    }
    
    if (contactIdMigrationPath) {
      try {
        console.log('📋 Running contact_id migration from:', contactIdMigrationPath);
        const contactIdMigrationSQL = readFileSync(contactIdMigrationPath, 'utf8');
        await pool.query(contactIdMigrationSQL);
        console.log('✅ contact_id migration completed');
      } catch (error: any) {
        // If column already exists, that's okay
        if (error.code === '42701' && error.message.includes('contact_id')) {
          console.log('   ℹ️  contact_id column already exists (skipping)');
        } else if (error.code === '42P07' && error.message.includes('idx_rental_agreements_contact_id')) {
          console.log('   ℹ️  contact_id index already exists (skipping)');
        } else {
          console.warn('   ⚠️  contact_id migration warning:', error.message);
          // Don't throw - migration might already be applied
        }
      }
    } else {
      console.warn('   ⚠️  Could not find add-contact-id-to-rental-agreements.sql migration file');
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

