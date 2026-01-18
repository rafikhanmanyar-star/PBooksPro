/**
 * Verify Rental Agreements Migration Status
 * 
 * This script checks if the rental_agreements table has been properly migrated
 * with org_id and contact_id columns, along with their constraints and indexes.
 */

import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

interface MigrationStatus {
  tableExists: boolean;
  hasOrgId: boolean;
  hasContactId: boolean;
  hasTenantId: boolean;
  orgIdConstraints: {
    unique: boolean;
    foreignKey: boolean;
    index: boolean;
  };
  contactIdConstraints: {
    foreignKey: boolean;
    index: boolean;
  };
  rowCount: number;
  nullOrgIds: number;
  nullContactIds: number;
  invalidContactIds: number;
}

async function verifyMigration(): Promise<void> {
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
    console.log('🔍 Verifying rental_agreements migration status...\n');

    // Check if table exists
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'rental_agreements'
      )
    `);
    const tableExists = tableCheck.rows[0].exists;

    if (!tableExists) {
      console.log('❌ rental_agreements table does not exist');
      await pool.end();
      process.exit(1);
    }

    console.log('✅ rental_agreements table exists\n');

    // Get all columns
    const columns = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'rental_agreements'
      ORDER BY ordinal_position
    `);

    const columnNames = columns.rows.map(row => row.column_name);
    const hasOrgId = columnNames.includes('org_id');
    const hasContactId = columnNames.includes('contact_id');
    const hasTenantId = columnNames.includes('tenant_id');

    console.log('📋 Column Status:');
    console.log(`   org_id: ${hasOrgId ? '✅ EXISTS' : '❌ MISSING'}`);
    console.log(`   contact_id: ${hasContactId ? '✅ EXISTS' : '❌ MISSING'}`);
    console.log(`   tenant_id: ${hasTenantId ? '⚠️  EXISTS (legacy)' : '✅ NOT FOUND (expected)'}\n`);

    // Check constraints
    const constraints = await pool.query(`
      SELECT constraint_name, constraint_type
      FROM information_schema.table_constraints
      WHERE table_name = 'rental_agreements'
    `);

    const constraintNames = constraints.rows.map(row => row.constraint_name);
    const hasOrgIdUnique = constraintNames.includes('rental_agreements_org_id_agreement_number_key');
    const hasOrgIdFk = constraintNames.includes('rental_agreements_org_id_fkey');
    const hasContactIdFk = constraintNames.includes('rental_agreements_contact_id_fkey');

    console.log('🔗 Constraint Status:');
    console.log(`   org_id unique (org_id, agreement_number): ${hasOrgIdUnique ? '✅ EXISTS' : '❌ MISSING'}`);
    console.log(`   org_id foreign key: ${hasOrgIdFk ? '✅ EXISTS' : '❌ MISSING'}`);
    console.log(`   contact_id foreign key: ${hasContactIdFk ? '✅ EXISTS' : '❌ MISSING'}\n`);

    // Check indexes
    const indexes = await pool.query(`
      SELECT indexname
      FROM pg_indexes
      WHERE tablename = 'rental_agreements'
    `);

    const indexNames = indexes.rows.map(row => row.indexname);
    const hasOrgIdIndex = indexNames.includes('idx_rental_agreements_org_id');
    const hasContactIdIndex = indexNames.includes('idx_rental_agreements_contact_id');

    console.log('📊 Index Status:');
    console.log(`   idx_rental_agreements_org_id: ${hasOrgIdIndex ? '✅ EXISTS' : '❌ MISSING'}`);
    console.log(`   idx_rental_agreements_contact_id: ${hasContactIdIndex ? '✅ EXISTS' : '❌ MISSING'}\n`);

    // Check data integrity
    const rowCount = await pool.query('SELECT COUNT(*) as count FROM rental_agreements');
    const totalRows = parseInt(rowCount.rows[0].count);

    let nullOrgIds = 0;
    let nullContactIds = 0;
    let invalidContactIds = 0;

    if (hasOrgId) {
      const nullOrgIdCheck = await pool.query('SELECT COUNT(*) as count FROM rental_agreements WHERE org_id IS NULL');
      nullOrgIds = parseInt(nullOrgIdCheck.rows[0].count);
    }

    if (hasContactId) {
      const nullContactIdCheck = await pool.query('SELECT COUNT(*) as count FROM rental_agreements WHERE contact_id IS NULL');
      nullContactIds = parseInt(nullContactIdCheck.rows[0].count);

      // Check for invalid foreign key references
      const invalidFkCheck = await pool.query(`
        SELECT COUNT(*) as count
        FROM rental_agreements ra
        LEFT JOIN contacts c ON ra.contact_id = c.id
        WHERE ra.contact_id IS NOT NULL AND c.id IS NULL
      `);
      invalidContactIds = parseInt(invalidFkCheck.rows[0].count);
    }

    console.log('📊 Data Integrity:');
    console.log(`   Total rental agreements: ${totalRows}`);
    if (hasOrgId) {
      console.log(`   NULL org_id values: ${nullOrgIds} ${nullOrgIds > 0 ? '⚠️' : '✅'}`);
    }
    if (hasContactId) {
      console.log(`   NULL contact_id values: ${nullContactIds} ${nullContactIds > 0 ? '⚠️' : '✅'}`);
      console.log(`   Invalid contact_id references: ${invalidContactIds} ${invalidContactIds > 0 ? '❌' : '✅'}`);
    }
    console.log('');

    // Summary
    const status: MigrationStatus = {
      tableExists: true,
      hasOrgId,
      hasContactId,
      hasTenantId,
      orgIdConstraints: {
        unique: hasOrgIdUnique,
        foreignKey: hasOrgIdFk,
        index: hasOrgIdIndex,
      },
      contactIdConstraints: {
        foreignKey: hasContactIdFk,
        index: hasContactIdIndex,
      },
      rowCount: totalRows,
      nullOrgIds,
      nullContactIds,
      invalidContactIds,
    };

    console.log('📋 Migration Status Summary:');
    console.log('━'.repeat(50));

    const allGood = hasOrgId && hasContactId && 
                   hasOrgIdUnique && hasOrgIdFk && hasOrgIdIndex &&
                   hasContactIdFk && hasContactIdIndex &&
                   !hasTenantId &&
                   nullOrgIds === 0 && nullContactIds === 0 && invalidContactIds === 0;

    if (allGood) {
      console.log('✅ ALL MIGRATIONS COMPLETED SUCCESSFULLY');
      console.log('   - org_id column exists with all constraints and indexes');
      console.log('   - contact_id column exists with all constraints and indexes');
      console.log('   - No legacy tenant_id column');
      console.log('   - All data integrity checks passed');
    } else {
      console.log('⚠️  MIGRATION INCOMPLETE OR ISSUES DETECTED');
      
      if (!hasOrgId) {
        console.log('   ❌ org_id column is missing - run add-org-id-to-rental-agreements.sql');
      }
      if (!hasContactId) {
        console.log('   ❌ contact_id column is missing - run add-contact-id-to-rental-agreements.sql');
      }
      if (hasTenantId) {
        console.log('   ⚠️  tenant_id column still exists (should be removed or ignored)');
      }
      if (!hasOrgIdUnique || !hasOrgIdFk || !hasOrgIdIndex) {
        console.log('   ❌ org_id constraints/indexes are missing');
      }
      if (!hasContactIdFk || !hasContactIdIndex) {
        console.log('   ❌ contact_id constraints/indexes are missing');
      }
      if (nullOrgIds > 0 || nullContactIds > 0) {
        console.log('   ⚠️  NULL values detected - may need data backfill');
      }
      if (invalidContactIds > 0) {
        console.log('   ❌ Invalid foreign key references detected');
      }
    }

    console.log('━'.repeat(50));

    await pool.end();

    // Exit with error code if migration is incomplete
    if (!allGood) {
      process.exit(1);
    }
  } catch (error: any) {
    console.error('❌ Error verifying migration:', error.message);
    console.error('Error details:', {
      code: error.code,
      detail: error.detail,
      hint: error.hint
    });
    await pool.end();
    process.exit(1);
  }
}

// Run verification if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  verifyMigration()
    .then(() => {
      console.log('\n✅ Verification completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Verification failed:', error);
      process.exit(1);
    });
}

export { verifyMigration };
