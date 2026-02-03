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
    console.log('🔄 Running database migrations...');

    // Read and execute PostgreSQL schema (always run to ensure schema_migrations table exists)
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
    // This must run first to create the schema_migrations table
    const schemaStartTime = Date.now();
    try {
      await pool.query(schemaSQL);
      const schemaExecutionTime = Date.now() - schemaStartTime;
      // Record schema migration (only if not already recorded)
      if (!(await isMigrationApplied(pool, 'postgresql-schema'))) {
        await recordMigration(pool, 'postgresql-schema', schemaExecutionTime, 'Main database schema');
      }
    } catch (error: any) {
      // If it's a policy error, it's likely already exists - that's okay
      if (error.code === '42710' && error.message.includes('policy')) {
        console.log('   ⚠️  Some policies already exist (this is normal)');
      } else {
        throw error;
      }
    }

    console.log('✅ Database schema verified');

    // Run additional migrations (only if not already applied)
    console.log('🔄 Checking additional migrations...');

    // Migration: Payment tables (payments, payment_webhooks, subscriptions)
    await runMigrationIfNeeded(
      pool,
      'add-payment-tables',
      [
        join(__dirname, '../migrations/add-payment-tables.sql'),
        join(__dirname, '../../migrations/add-payment-tables.sql'),
        join(process.cwd(), 'server/migrations/add-payment-tables.sql'),
        join(process.cwd(), 'migrations/add-payment-tables.sql'),
      ],
      'Payment tables'
    );

    // Migration: Bill version column (optimistic locking)
    await runMigrationIfNeeded(
      pool,
      'add-bill-version-column',
      [
        join(__dirname, '../migrations/add-bill-version-column.sql'),
        join(__dirname, '../../migrations/add-bill-version-column.sql'),
        join(process.cwd(), 'server/migrations/add-bill-version-column.sql'),
        join(process.cwd(), 'migrations/add-bill-version-column.sql'),
      ],
      'Bill version column'
    );

    // Migration: P2P system tables and tenant supplier metadata
    await runMigrationIfNeeded(
      pool,
      'add-p2p-tables',
      [
        join(__dirname, '../migrations/add-p2p-tables.sql'),
        join(__dirname, '../../migrations/add-p2p-tables.sql'),
        join(process.cwd(), 'server/migrations/add-p2p-tables.sql'),
        join(process.cwd(), 'migrations/add-p2p-tables.sql'),
      ],
      'P2P system tables'
    );

    // Migration: target_delivery_date on purchase_orders (requires P2P)
    await runMigrationIfNeeded(
      pool,
      'add-target-delivery-date',
      [
        join(__dirname, '../migrations/add-target-delivery-date.sql'),
        join(__dirname, '../../migrations/add-target-delivery-date.sql'),
        join(process.cwd(), 'server/migrations/add-target-delivery-date.sql'),
        join(process.cwd(), 'migrations/add-target-delivery-date.sql'),
      ],
      'Target delivery date column'
    );

    // Migration: project_id on purchase_orders (required for New PO form)
    await runMigrationIfNeeded(
      pool,
      'add-project-id-to-purchase-orders',
      [
        join(__dirname, '../migrations/add-project-id-to-purchase-orders.sql'),
        join(__dirname, '../../migrations/add-project-id-to-purchase-orders.sql'),
        join(process.cwd(), 'server/migrations/add-project-id-to-purchase-orders.sql'),
        join(process.cwd(), 'migrations/add-project-id-to-purchase-orders.sql'),
      ],
      'Project ID column on purchase_orders'
    );

    // Migration: PO lock columns (buyer/supplier one-party-edit flow)
    await runMigrationIfNeeded(
      pool,
      'add-po-lock-columns',
      [
        join(__dirname, '../migrations/add-po-lock-columns.sql'),
        join(__dirname, '../../migrations/add-po-lock-columns.sql'),
        join(process.cwd(), 'server/migrations/add-po-lock-columns.sql'),
        join(process.cwd(), 'migrations/add-po-lock-columns.sql'),
      ],
      'PO lock columns for Biz Planet flow'
    );

    // Migration: P2P invoice income category (supplier assigns when converting PO to invoice)
    await runMigrationIfNeeded(
      pool,
      'add-p2p-invoice-income-category',
      [
        join(__dirname, '../migrations/add-p2p-invoice-income-category.sql'),
        join(__dirname, '../../migrations/add-p2p-invoice-income-category.sql'),
        join(process.cwd(), 'server/migrations/add-p2p-invoice-income-category.sql'),
        join(process.cwd(), 'migrations/add-p2p-invoice-income-category.sql'),
      ],
      'Income category on P2P invoices'
    );

    // Migration: Add document_id to contracts and bills (documents table link for local + cloud)
    await runMigrationIfNeeded(
      pool,
      'add-document-id-to-contracts-bills',
      [
        join(__dirname, '../migrations/add-document-id-to-contracts-bills.sql'),
        join(__dirname, '../../migrations/add-document-id-to-contracts-bills.sql'),
        join(process.cwd(), 'server/migrations/add-document-id-to-contracts-bills.sql'),
        join(process.cwd(), 'migrations/add-document-id-to-contracts-bills.sql'),
      ],
      'Document ID on contracts and bills'
    );

    // Migration: Add user_id to transactions table
    await runMigrationIfNeeded(
      pool,
      'add-user-id-to-transactions',
      [
        join(__dirname, '../migrations/add-user-id-to-transactions.sql'),
        join(__dirname, '../../migrations/add-user-id-to-transactions.sql'),
        join(process.cwd(), 'server/migrations/add-user-id-to-transactions.sql'),
        join(process.cwd(), 'migrations/add-user-id-to-transactions.sql'),
      ],
      'User ID to transactions'
    );

    // Migration: Add user_id to contracts table
    await runMigrationIfNeeded(
      pool,
      'add-user-id-to-contracts',
      [
        join(__dirname, '../migrations/add-user-id-to-contracts.sql'),
        join(__dirname, '../../migrations/add-user-id-to-contracts.sql'),
        join(process.cwd(), 'server/migrations/add-user-id-to-contracts.sql'),
        join(process.cwd(), 'migrations/add-user-id-to-contracts.sql'),
      ],
      'User ID to contracts'
    );

    // Migration: Add user_id to all entities
    await runMigrationIfNeeded(
      pool,
      'add-user-id-to-all-entities',
      [
        join(__dirname, '../migrations/add-user-id-to-all-entities.sql'),
        join(__dirname, '../../migrations/add-user-id-to-all-entities.sql'),
        join(process.cwd(), 'server/migrations/add-user-id-to-all-entities.sql'),
        join(process.cwd(), 'migrations/add-user-id-to-all-entities.sql'),
      ],
      'User ID to all entities'
    );

    // Migration: Add payment_id column to license_history (if missing)
    if (!(await isMigrationApplied(pool, 'add-payment-id-to-license-history'))) {
      try {
        const columnCheck = await pool.query(`
          SELECT column_name 
          FROM information_schema.columns 
          WHERE table_name = 'license_history' AND column_name = 'payment_id'
        `);

        const startTime = Date.now();
        if (columnCheck.rows.length === 0) {
          console.log('📋 Adding payment_id column to license_history...');
          await pool.query('ALTER TABLE license_history ADD COLUMN payment_id TEXT');
          const executionTime = Date.now() - startTime;
          await recordMigration(pool, 'add-payment-id-to-license-history', executionTime);
          console.log('✅ Added payment_id column to license_history');
        } else {
          await recordMigration(pool, 'add-payment-id-to-license-history', Date.now() - startTime, 'Already existed');
        }
      } catch (migrationError: any) {
        console.warn('   ⚠️  payment_id migration warning:', migrationError.message);
        // Don't throw - migration might already be applied or table might not exist yet
      }
    }

    // Migration: Make transaction_audit_log.user_id nullable
    await runMigrationIfNeeded(
      pool,
      'make-audit-log-user-id-nullable',
      [
        join(__dirname, '../migrations/make-audit-log-user-id-nullable.sql'),
        join(__dirname, '../../migrations/make-audit-log-user-id-nullable.sql'),
        join(process.cwd(), 'server/migrations/make-audit-log-user-id-nullable.sql'),
        join(process.cwd(), 'migrations/make-audit-log-user-id-nullable.sql'),
      ],
      'Make audit log user_id nullable'
    );

    // Migration: Ensure tenant supplier metadata columns exist
    if (!(await isMigrationApplied(pool, 'add-tenant-supplier-metadata'))) {
      try {
        const startTime = Date.now();
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
        const executionTime = Date.now() - startTime;
        await recordMigration(pool, 'add-tenant-supplier-metadata', executionTime);
        console.log('✅ Tenant supplier metadata migration completed');
      } catch (tenantColumnError: any) {
        console.warn('   ⚠️  tenant supplier metadata migration warning:', tenantColumnError.message);
        // Don't throw - migration might already be applied or constraints exist
      }
    }

    // Migration: Add org_id to rental_agreements table (MUST run before contact_id)
    await runMigrationIfNeeded(
      pool,
      'add-org-id-to-rental-agreements',
      [
        join(__dirname, '../migrations/add-org-id-to-rental-agreements.sql'),
        join(__dirname, '../../migrations/add-org-id-to-rental-agreements.sql'),
        join(process.cwd(), 'server/migrations/add-org-id-to-rental-agreements.sql'),
        join(process.cwd(), 'migrations/add-org-id-to-rental-agreements.sql'),
      ],
      'Org ID to rental agreements'
    );

    // Migration: Add contact_id to rental_agreements table
    await runMigrationIfNeeded(
      pool,
      'add-contact-id-to-rental-agreements',
      [
        join(__dirname, '../migrations/add-contact-id-to-rental-agreements.sql'),
        join(__dirname, '../../migrations/add-contact-id-to-rental-agreements.sql'),
        join(process.cwd(), 'server/migrations/add-contact-id-to-rental-agreements.sql'),
        join(process.cwd(), 'migrations/add-contact-id-to-rental-agreements.sql'),
      ],
      'Contact ID to rental agreements'
    );

    // Migration: Add Tasks Management Schema (Core)
    await runMigrationIfNeeded(
      pool,
      'task_management_schema',
      [
        join(__dirname, '../migrations/task_management_schema.sql'),
        join(__dirname, '../../migrations/task_management_schema.sql'),
        join(process.cwd(), 'server/migrations/task_management_schema.sql'),
        join(process.cwd(), 'migrations/task_management_schema.sql'),
      ],
      'Tasks Management Core'
    );

    // Migration: Add Tasks Organization Schema
    await runMigrationIfNeeded(
      pool,
      'task_organization_schema',
      [
        join(__dirname, '../migrations/task_organization_schema.sql'),
        join(__dirname, '../../migrations/task_organization_schema.sql'),
        join(process.cwd(), 'server/migrations/task_organization_schema.sql'),
        join(process.cwd(), 'migrations/task_organization_schema.sql'),
      ],
      'Tasks Organization'
    );

    // Migration: Add Tasks Roles Schema
    await runMigrationIfNeeded(
      pool,
      'task_roles_schema',
      [
        join(__dirname, '../migrations/task_roles_schema.sql'),
        join(__dirname, '../../migrations/task_roles_schema.sql'),
        join(process.cwd(), 'server/migrations/task_roles_schema.sql'),
        join(process.cwd(), 'migrations/task_roles_schema.sql'),
      ],
      'Tasks Roles'
    );

    // Migration: Add Tasks Workflow Schema
    await runMigrationIfNeeded(
      pool,
      'task_workflow_schema',
      [
        join(__dirname, '../migrations/task_workflow_schema.sql'),
        join(__dirname, '../../migrations/task_workflow_schema.sql'),
        join(process.cwd(), 'server/migrations/task_workflow_schema.sql'),
        join(process.cwd(), 'migrations/task_workflow_schema.sql'),
      ],
      'Tasks Workflow'
    );

    // Migration: Add Tasks Assignment Schema
    await runMigrationIfNeeded(
      pool,
      'task_assignment_schema',
      [
        join(__dirname, '../migrations/task_assignment_schema.sql'),
        join(__dirname, '../../migrations/task_assignment_schema.sql'),
        join(process.cwd(), 'server/migrations/task_assignment_schema.sql'),
        join(process.cwd(), 'migrations/task_assignment_schema.sql'),
      ],
      'Tasks Assignment'
    );

    // Migration: Add Tasks Execution Schema
    await runMigrationIfNeeded(
      pool,
      'task_execution_schema',
      [
        join(__dirname, '../migrations/task_execution_schema.sql'),
        join(__dirname, '../../migrations/task_execution_schema.sql'),
        join(process.cwd(), 'server/migrations/task_execution_schema.sql'),
        join(process.cwd(), 'migrations/task_execution_schema.sql'),
      ],
      'Tasks Execution'
    );

    // Migration: Add Tasks OKR Schema
    await runMigrationIfNeeded(
      pool,
      'task_okr_schema',
      [
        join(__dirname, '../migrations/task_okr_schema.sql'),
        join(__dirname, '../../migrations/task_okr_schema.sql'),
        join(process.cwd(), 'server/migrations/task_okr_schema.sql'),
        join(process.cwd(), 'migrations/task_okr_schema.sql'),
      ],
      'Tasks OKR'
    );

    // Migration: Add Tasks Initiatives Schema
    await runMigrationIfNeeded(
      pool,
      'task_initiatives_schema',
      [
        join(__dirname, '../migrations/task_initiatives_schema.sql'),
        join(__dirname, '../../migrations/task_initiatives_schema.sql'),
        join(process.cwd(), 'server/migrations/task_initiatives_schema.sql'),
        join(process.cwd(), 'migrations/task_initiatives_schema.sql'),
      ],
      'Tasks Initiatives'
    );

    // Migration: Add Tasks Notifications Schema
    await runMigrationIfNeeded(
      pool,
      'task_notifications_schema',
      [
        join(__dirname, '../migrations/task_notifications_schema.sql'),
        join(__dirname, '../../migrations/task_notifications_schema.sql'),
        join(process.cwd(), 'server/migrations/task_notifications_schema.sql'),
        join(process.cwd(), 'migrations/task_notifications_schema.sql'),
      ],
      'Tasks Notifications'
    );

    // Migration: Cleanup Tasks (redundant tables)
    await runMigrationIfNeeded(
      pool,
      'cleanup_tasks',
      [
        join(__dirname, '../migrations/cleanup_tasks.sql'),
        join(__dirname, '../../migrations/cleanup_tasks.sql'),
        join(process.cwd(), 'server/migrations/cleanup_tasks.sql'),
        join(process.cwd(), 'migrations/cleanup_tasks.sql'),
      ],
      'Tasks Cleanup'
    );

    // Migration: Add is_supplier column to tenants table
    await runMigrationIfNeeded(
      pool,
      'add-is-supplier-to-tenants',
      [
        join(__dirname, '../migrations/add-is-supplier-to-tenants.sql'),
        join(__dirname, '../../migrations/add-is-supplier-to-tenants.sql'),
        join(process.cwd(), 'server/migrations/add-is-supplier-to-tenants.sql'),
        join(process.cwd(), 'migrations/add-is-supplier-to-tenants.sql'),
      ],
      'Is supplier column'
    );

    // Migration: Add WhatsApp Business API Integration tables
    await runMigrationIfNeeded(
      pool,
      'add-whatsapp-integration',
      [
        join(__dirname, '../migrations/add-whatsapp-integration.sql'),
        join(__dirname, '../../migrations/add-whatsapp-integration.sql'),
        join(process.cwd(), 'server/migrations/add-whatsapp-integration.sql'),
        join(process.cwd(), 'migrations/add-whatsapp-integration.sql'),
      ],
      'WhatsApp Integration'
    );

    // Migration: Increase user restriction from 5 to 20 per organization
    await runMigrationIfNeeded(
      pool,
      'increase-max-users-to-20',
      [
        join(__dirname, '../migrations/increase-max-users-to-20.sql'),
        join(__dirname, '../../migrations/increase-max-users-to-20.sql'),
        join(process.cwd(), 'server/migrations/increase-max-users-to-20.sql'),
        join(process.cwd(), 'migrations/increase-max-users-to-20.sql'),
      ],
      'Increase max users to 20'
    );

    // Migration: Installment plan fields and status (installment_plans)
    await runMigrationIfNeeded(
      pool,
      'add-installment-plan-fields',
      [
        join(__dirname, '../migrations/add-installment-plan-fields.sql'),
        join(__dirname, '../../migrations/add-installment-plan-fields.sql'),
        join(process.cwd(), 'server/migrations/add-installment-plan-fields.sql'),
        join(process.cwd(), 'migrations/add-installment-plan-fields.sql'),
      ],
      'Installment plan fields'
    );

    // Migration: Sale Recognized status (installment_plans) — run after installment-plan-fields
    await runMigrationIfNeeded(
      pool,
      'add-sale-recognized-status',
      [
        join(__dirname, '../migrations/add-sale-recognized-status.sql'),
        join(__dirname, '../../migrations/add-sale-recognized-status.sql'),
        join(process.cwd(), 'server/migrations/add-sale-recognized-status.sql'),
        join(process.cwd(), 'migrations/add-sale-recognized-status.sql'),
      ],
      'Sale recognized status'
    );

    // Migration: installment_plan column on project_agreements
    await runMigrationIfNeeded(
      pool,
      'add-installment-plan-to-project-agreements',
      [
        join(__dirname, '../migrations/add-installment-plan-to-project-agreements.sql'),
        join(__dirname, '../../migrations/add-installment-plan-to-project-agreements.sql'),
        join(process.cwd(), 'server/migrations/add-installment-plan-to-project-agreements.sql'),
        join(process.cwd(), 'migrations/add-installment-plan-to-project-agreements.sql'),
      ],
      'Installment plan to project agreements'
    );

    // Migration: unit fields (type, area, floor)
    await runMigrationIfNeeded(
      pool,
      'add-unit-fields',
      [
        join(__dirname, '../migrations/add-unit-fields.sql'),
        join(__dirname, '../../migrations/add-unit-fields.sql'),
        join(process.cwd(), 'server/migrations/add-unit-fields.sql'),
        join(process.cwd(), 'migrations/add-unit-fields.sql'),
      ],
      'Unit fields (type, area, floor)'
    );


    // Migration: Biz Planet Marketplace (marketplace_ads, marketplace_categories)
    await runMigrationIfNeeded(
      pool,
      'add-marketplace-tables',
      [
        join(__dirname, '../migrations/add-marketplace-tables.sql'),
        join(__dirname, '../../migrations/add-marketplace-tables.sql'),
        join(process.cwd(), 'server/migrations/add-marketplace-tables.sql'),
        join(process.cwd(), 'migrations/add-marketplace-tables.sql'),
      ],
      'Marketplace tables for Biz Planet'
    );

    // Migration: Marketplace ad images (pictures in DB)
    await runMigrationIfNeeded(
      pool,
      'add-marketplace-ad-images',
      [
        join(__dirname, '../migrations/add-marketplace-ad-images.sql'),
        join(__dirname, '../../migrations/add-marketplace-ad-images.sql'),
        join(process.cwd(), 'server/migrations/add-marketplace-ad-images.sql'),
        join(process.cwd(), 'migrations/add-marketplace-ad-images.sql'),
      ],
      'Marketplace ad images table'
    );

    // Migration: Add views column to marketplace ads
    await runMigrationIfNeeded(
      pool,
      'add-views-to-marketplace-ads',
      [
        join(__dirname, '../migrations/add-views-to-marketplace-ads.sql'),
        join(__dirname, '../../migrations/add-views-to-marketplace-ads.sql'),
        join(process.cwd(), 'server/migrations/add-views-to-marketplace-ads.sql'),
        join(process.cwd(), 'migrations/add-views-to-marketplace-ads.sql'),
      ],
      'Views column to marketplace ads'
    );

    // Migration: Add likes column to marketplace ads
    await runMigrationIfNeeded(
      pool,
      'add-likes-to-marketplace-ads',
      [
        join(__dirname, '../migrations/add-likes-to-marketplace-ads.sql'),
        join(__dirname, '../../migrations/add-likes-to-marketplace-ads.sql'),
        join(process.cwd(), 'server/migrations/add-likes-to-marketplace-ads.sql'),
        join(process.cwd(), 'migrations/add-likes-to-marketplace-ads.sql'),
      ],
      'Likes column to marketplace ads'
    );

    // Migration: Shop/POS tables
    await runMigrationIfNeeded(
      pool,
      'add-shop-pos-tables',
      [
        join(__dirname, '../migrations/add-shop-pos-tables.sql'),
        join(__dirname, '../../migrations/add-shop-pos-tables.sql'),
        join(process.cwd(), 'server/migrations/add-shop-pos-tables.sql'),
        join(process.cwd(), 'migrations/add-shop-pos-tables.sql'),
      ],
      'Shop/POS tables'
    );

    // Migration: Shop policies
    await runMigrationIfNeeded(
      pool,
      'add-shop-policies',
      [
        join(__dirname, '../migrations/add-shop-policies.sql'),
        join(__dirname, '../../migrations/add-shop-policies.sql'),
        join(process.cwd(), 'server/migrations/add-shop-policies.sql'),
        join(process.cwd(), 'migrations/add-shop-policies.sql'),
      ],
      'Shop policies'
    );

    // Migration: Shop RLS policies
    await runMigrationIfNeeded(
      pool,
      'add-shop-rls-policies',
      [
        join(__dirname, '../migrations/add-shop-rls-policies.sql'),
        join(__dirname, '../../migrations/add-shop-rls-policies.sql'),
        join(process.cwd(), 'server/migrations/add-shop-rls-policies.sql'),
        join(process.cwd(), 'migrations/add-shop-rls-policies.sql'),
      ],
      'Shop RLS policies'
    );

    // Migration: Add module_key to payments table
    await runMigrationIfNeeded(
      pool,
      'add-module-key-to-payments',
      [
        join(__dirname, '../migrations/add-module-key-to-payments.sql'),
        join(__dirname, '../../migrations/add-module-key-to-payments.sql'),
        join(process.cwd(), 'server/migrations/add-module-key-to-payments.sql'),
        join(process.cwd(), 'migrations/add-module-key-to-payments.sql'),
      ],
      'Add module_key to payments'
    );

    // Migration: Add login_status to users table
    await runMigrationIfNeeded(
      pool,
      'add-login-status-to-users',
      [
        join(__dirname, '../migrations/add-login-status-to-users.sql'),
        join(__dirname, '../../migrations/add-login-status-to-users.sql'),
        join(process.cwd(), 'server/migrations/add-login-status-to-users.sql'),
        join(process.cwd(), 'migrations/add-login-status-to-users.sql'),
      ],
      'Add login_status to users'
    );

    // Migration: Add tenant_modules table
    await runMigrationIfNeeded(
      pool,
      'add-tenant-modules-table',
      [
        join(__dirname, '../migrations/add-tenant-modules-table.sql'),
        join(__dirname, '../../migrations/add-tenant-modules-table.sql'),
        join(process.cwd(), 'server/migrations/add-tenant-modules-table.sql'),
        join(process.cwd(), 'migrations/add-tenant-modules-table.sql'),
      ],
      'Add tenant_modules table'
    );

    // Migration: Add plan_amenities table
    await runMigrationIfNeeded(
      pool,
      'add-plan-amenities-table',
      [
        join(__dirname, '../migrations/add-plan-amenities-table.sql'),
        join(__dirname, '../../migrations/add-plan-amenities-table.sql'),
        join(process.cwd(), 'server/migrations/add-plan-amenities-table.sql'),
        join(process.cwd(), 'migrations/add-plan-amenities-table.sql'),
      ],
      'Add plan_amenities table'
    );

    // Migration: Add payment_tracking_columns to shop_sales
    await runMigrationIfNeeded(
      pool,
      'add-payment-tracking-columns',
      [
        join(__dirname, '../migrations/add-payment-tracking-columns.sql'),
        join(__dirname, '../../migrations/add-payment-tracking-columns.sql'),
        join(process.cwd(), 'server/migrations/add-payment-tracking-columns.sql'),
        join(process.cwd(), 'migrations/add-payment-tracking-columns.sql'),
      ],
      'Add payment tracking columns to shop_sales'
    );

    // Migration: Add installment plan approval fields
    await runMigrationIfNeeded(
      pool,
      'add-installment-plan-approval-fields',
      [
        join(__dirname, '../migrations/add-installment-plan-approval-fields.sql'),
        join(__dirname, '../../migrations/add-installment-plan-approval-fields.sql'),
        join(process.cwd(), 'server/migrations/add-installment-plan-approval-fields.sql'),
        join(process.cwd(), 'migrations/add-installment-plan-approval-fields.sql'),
      ],
      'Add installment plan approval fields'
    );

    // Migration: Add installment plan discount and category columns
    await runMigrationIfNeeded(
      pool,
      'add-installment-plan-discount-category-columns',
      [
        join(__dirname, '../migrations/add-installment-plan-discount-category-columns.sql'),
        join(__dirname, '../../migrations/add-installment-plan-discount-category-columns.sql'),
        join(process.cwd(), 'server/migrations/add-installment-plan-discount-category-columns.sql'),
        join(process.cwd(), 'migrations/add-installment-plan-discount-category-columns.sql'),
      ],
      'Add installment plan discount and category columns'
    );

    // Migration: Fix registered suppliers column names
    await runMigrationIfNeeded(
      pool,
      'fix-registered-suppliers-column-names',
      [
        join(__dirname, '../migrations/fix-registered-suppliers-column-names.sql'),
        join(__dirname, '../../migrations/fix-registered-suppliers-column-names.sql'),
        join(process.cwd(), 'server/migrations/fix-registered-suppliers-column-names.sql'),
        join(process.cwd(), 'migrations/fix-registered-suppliers-column-names.sql'),
      ],
      'Fix registered suppliers column names'
    );

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

