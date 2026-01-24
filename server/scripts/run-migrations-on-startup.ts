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

    // Migration: P2P system tables and tenant supplier metadata
    const p2pMigrationPaths = [
      join(__dirname, '../migrations/add-p2p-tables.sql'),
      join(__dirname, '../../migrations/add-p2p-tables.sql'),
      join(process.cwd(), 'server/migrations/add-p2p-tables.sql'),
      join(process.cwd(), 'migrations/add-p2p-tables.sql'),
    ];

    let p2pMigrationPath: string | null = null;
    for (const path of p2pMigrationPaths) {
      try {
        readFileSync(path, 'utf8');
        p2pMigrationPath = path;
        break;
      } catch (e) {
        // Try next path
      }
    }

    if (p2pMigrationPath) {
      try {
        console.log('📋 Running P2P migration from:', p2pMigrationPath);
        const p2pMigrationSQL = readFileSync(p2pMigrationPath, 'utf8');
        await pool.query(p2pMigrationSQL);
        console.log('✅ P2P migration completed');
      } catch (error: any) {
        console.warn('   ⚠️  P2P migration warning:', error.message);
        // Don't throw - migration might already be applied
      }
    } else {
      console.warn('   ⚠️  Could not find add-p2p-tables.sql migration file');
    }
    
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

    // Migration: Ensure tenant supplier metadata columns exist
    try {
      const ensureTenantColumns = async (column: string, sql: string) => {
        const columnCheck = await pool.query(`
          SELECT column_name 
          FROM information_schema.columns 
          WHERE table_name = 'tenants' AND column_name = $1
        `, [column]);
        if (columnCheck.rows.length === 0) {
          console.log(`📋 Adding tenants.${column} column...`);
          await pool.query(sql);
          console.log(`✅ Added tenants.${column} column`);
        }
      };

      await ensureTenantColumns('tax_id', 'ALTER TABLE tenants ADD COLUMN tax_id TEXT');
      await ensureTenantColumns('payment_terms', `
        ALTER TABLE tenants ADD COLUMN payment_terms TEXT;
        ALTER TABLE tenants ADD CONSTRAINT valid_payment_terms 
          CHECK (payment_terms IS NULL OR payment_terms IN ('Net 30', 'Net 60', 'Net 90', 'Due on Receipt', 'Custom'));
      `);
      await ensureTenantColumns('supplier_category', 'ALTER TABLE tenants ADD COLUMN supplier_category TEXT');
      await ensureTenantColumns('supplier_status', `
        ALTER TABLE tenants ADD COLUMN supplier_status TEXT DEFAULT 'Active';
        ALTER TABLE tenants ADD CONSTRAINT valid_supplier_status 
          CHECK (supplier_status IS NULL OR supplier_status IN ('Active', 'Inactive'));
      `);
    } catch (tenantColumnError: any) {
      console.warn('   ⚠️  tenant supplier metadata migration warning:', tenantColumnError.message);
      // Don't throw - migration might already be applied or constraints exist
    }
    
    // Migration: Add org_id to rental_agreements table (MUST run before contact_id)
    const orgIdMigrationPaths = [
      join(__dirname, '../migrations/add-org-id-to-rental-agreements.sql'),
      join(__dirname, '../../migrations/add-org-id-to-rental-agreements.sql'),
      join(process.cwd(), 'server/migrations/add-org-id-to-rental-agreements.sql'),
      join(process.cwd(), 'migrations/add-org-id-to-rental-agreements.sql'),
    ];

    let orgIdMigrationPath: string | null = null;
    for (const path of orgIdMigrationPaths) {
      try {
        readFileSync(path, 'utf8');
        orgIdMigrationPath = path;
        break;
      } catch (e) {
        // Try next path
      }
    }

    if (orgIdMigrationPath) {
      try {
        console.log('📋 Running org_id migration from:', orgIdMigrationPath);
        const orgIdMigrationSQL = readFileSync(orgIdMigrationPath, 'utf8');
        await pool.query(orgIdMigrationSQL);
        console.log('✅ org_id migration completed');
      } catch (error: any) {
        // If column/constraint already exists, that's okay
        if (error.code === '42701' && error.message.includes('org_id')) {
          console.log('   ℹ️  org_id column already exists (skipping)');
        } else if (error.code === '42P07' && error.message.includes('idx_rental_agreements_org_id')) {
          console.log('   ℹ️  org_id index already exists (skipping)');
        } else if (error.code === '42710' && error.message.includes('rental_agreements_org_id_agreement_number_key')) {
          console.log('   ℹ️  org_id unique constraint already exists (skipping)');
        } else {
          console.error('   ❌ org_id migration error:', error.message);
          console.error('   Error code:', error.code);
          // Don't throw - but log the error clearly
        }
      }
    } else {
      console.warn('   ⚠️  Could not find add-org-id-to-rental-agreements.sql migration file');
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

    // Migration: Add Tasks Management Schema
    const tasksMigrationPaths = [
      join(__dirname, '../migrations/add-tasks-schema.sql'),
      join(__dirname, '../../migrations/add-tasks-schema.sql'),
      join(process.cwd(), 'server/migrations/add-tasks-schema.sql'),
      join(process.cwd(), 'migrations/add-tasks-schema.sql'),
    ];
    
    let tasksMigrationPath: string | null = null;
    for (const path of tasksMigrationPaths) {
      try {
        readFileSync(path, 'utf8');
        tasksMigrationPath = path;
        break;
      } catch (e) {
        // Try next path
      }
    }
    
    if (tasksMigrationPath) {
      try {
        console.log('📋 Running tasks schema migration from:', tasksMigrationPath);
        const tasksMigrationSQL = readFileSync(tasksMigrationPath, 'utf8');
        await pool.query(tasksMigrationSQL);
        console.log('✅ Tasks schema migration completed');
      } catch (error: any) {
        // If tables/columns already exist, that's okay
        if (error.code === '42P07' || error.code === '42710' || error.message.includes('already exists')) {
          console.log('   ℹ️  Tasks schema already exists (skipping)');
        } else {
          console.warn('   ⚠️  Tasks schema migration warning:', error.message);
          // Don't throw - migration might already be applied
        }
      }
    } else {
      console.warn('   ⚠️  Could not find add-tasks-schema.sql migration file');
    }

    // Migration: Add is_supplier column to tenants table
    const isSupplierMigrationPaths = [
      join(__dirname, '../migrations/add-is-supplier-to-tenants.sql'),
      join(__dirname, '../../migrations/add-is-supplier-to-tenants.sql'),
      join(process.cwd(), 'server/migrations/add-is-supplier-to-tenants.sql'),
      join(process.cwd(), 'migrations/add-is-supplier-to-tenants.sql'),
    ];
    
    let isSupplierMigrationPath: string | null = null;
    for (const path of isSupplierMigrationPaths) {
      try {
        readFileSync(path, 'utf8');
        isSupplierMigrationPath = path;
        break;
      } catch (e) {
        // Try next path
      }
    }
    
    if (isSupplierMigrationPath) {
      try {
        console.log('📋 Running is_supplier migration from:', isSupplierMigrationPath);
        const isSupplierMigrationSQL = readFileSync(isSupplierMigrationPath, 'utf8');
        await pool.query(isSupplierMigrationSQL);
        console.log('✅ is_supplier migration completed');
      } catch (error: any) {
        // If column already exists, that's okay
        if (error.code === '42710' || error.message.includes('already exists')) {
          console.log('   ℹ️  is_supplier column already exists (skipping)');
        } else {
          console.warn('   ⚠️  is_supplier migration warning:', error.message);
          // Don't throw - migration might already be applied
        }
      }
    } else {
      console.warn('   ⚠️  Could not find add-is-supplier-to-tenants.sql migration file');
    }
    
    // Migration: Add WhatsApp Business API Integration tables
    const whatsappMigrationPaths = [
      join(__dirname, '../migrations/add-whatsapp-integration.sql'),
      join(__dirname, '../../migrations/add-whatsapp-integration.sql'),
      join(process.cwd(), 'server/migrations/add-whatsapp-integration.sql'),
      join(process.cwd(), 'migrations/add-whatsapp-integration.sql'),
    ];
    
    let whatsappMigrationPath: string | null = null;
    for (const path of whatsappMigrationPaths) {
      try {
        readFileSync(path, 'utf8');
        whatsappMigrationPath = path;
        break;
      } catch (e) {
        // Try next path
      }
    }
    
    if (whatsappMigrationPath) {
      try {
        console.log('📋 Running WhatsApp integration migration from:', whatsappMigrationPath);
        const whatsappMigrationSQL = readFileSync(whatsappMigrationPath, 'utf8');
        await pool.query(whatsappMigrationSQL);
        console.log('✅ WhatsApp integration migration completed');
      } catch (error: any) {
        // If tables already exist, that's okay
        if (error.code === '42P07' || error.message.includes('already exists')) {
          console.log('   ℹ️  WhatsApp tables already exist (skipping)');
        } else {
          console.warn('   ⚠️  WhatsApp integration migration warning:', error.message);
          // Don't throw - migration might already be applied
        }
      }
    } else {
      console.warn('   ⚠️  Could not find add-whatsapp-integration.sql migration file');
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

