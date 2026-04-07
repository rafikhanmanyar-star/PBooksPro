/**
 * Pre-Migration Check Script
 * 
 * Validates the source database before migration to catch potential issues.
 * Checks database integrity, schema version, table structure, and compatibility.
 * 
 * Run: node scripts/check-pre-migration.cjs [--source "path/to/pbookspro.db"]
 */

const path = require('path');
const fs = require('fs');

// Paths: same as migration script
const BASE_DIR = process.env.PBOOKS_BASE_DIR || path.join(process.env.APPDATA || path.join(process.env.HOME || '', '.config'), 'pbooks-pro', 'pbookspro');
const SOURCE_DB = process.argv.includes('--source') 
  ? path.resolve(process.argv[process.argv.indexOf('--source') + 1])
  : path.resolve(BASE_DIR, 'pbookspro.db');
const SCHEMA_VERSION = 13;

const TENANT_TABLES = [
  'accounts', 'contacts', 'vendors', 'categories', 'projects', 'buildings',
  'properties', 'units', 'transactions', 'invoices', 'bills', 'budgets',
  'quotations', 'plan_amenities', 'installment_plans', 'documents',
  'rental_agreements', 'project_agreements', 'sales_returns', 'contracts',
  'recurring_invoice_templates', 'pm_cycle_allocations', 'users',
];

const CRITICAL_TABLES = ['users', 'accounts', 'contacts', 'transactions'];

let issues = [];
let warnings = [];
let checks = { passed: 0, failed: 0 };

function logCheck(name, passed, message) {
  if (passed) {
    console.log(`✅ ${name}: ${message}`);
    checks.passed++;
  } else {
    console.log(`❌ ${name}: ${message}`);
    checks.failed++;
    issues.push(`${name}: ${message}`);
  }
}

function logWarning(message) {
  console.log(`⚠️  WARNING: ${message}`);
  warnings.push(message);
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

function main() {
  console.log('='.repeat(70));
  console.log('  Pre-Migration Database Check');
  console.log('='.repeat(70));
  console.log(`\nSource Database: ${SOURCE_DB}\n`);

  // Check 1: File exists
  if (!fs.existsSync(SOURCE_DB)) {
    console.error(`❌ Source database not found: ${SOURCE_DB}`);
    console.error('\nPlease ensure:');
    console.error('  1. The database file exists at the specified path');
    console.error('  2. Or use --source flag: node scripts/check-pre-migration.cjs --source "path/to/pbookspro.db"');
    process.exit(1);
  }
  logCheck('File Exists', true, 'Database file found');

  // Check 2: File size
  const stats = fs.statSync(SOURCE_DB);
  const fileSize = stats.size;
  logCheck('File Size', fileSize > 0, `Database size: ${formatBytes(fileSize)}`);
  
  if (fileSize === 0) {
    console.error('\n❌ Database file is empty! Cannot proceed with migration.');
    process.exit(1);
  }

  // Check 3: Can open with better-sqlite3
  let db;
  try {
    const Database = require('better-sqlite3');
    db = new Database(SOURCE_DB, { readonly: true });
    logCheck('Database Open', true, 'Successfully opened with better-sqlite3');
  } catch (error) {
    logCheck('Database Open', false, `Failed to open: ${error.message}`);
    console.error('\n❌ Cannot open database. Possible issues:');
    console.error('  1. Database file is corrupted');
    console.error('  2. Database is locked (close PBooks Pro app)');
    console.error('  3. better-sqlite3 native module issue (run: npm run rebuild:native)');
    process.exit(1);
  }

  // Check 4: Database integrity
  try {
    const integrity = db.pragma('integrity_check');
    const isOk = integrity.length > 0 && integrity[0].integrity_check === 'ok';
    logCheck('Database Integrity', isOk, isOk ? 'Database integrity check passed' : 'Database integrity check failed');
    
    if (!isOk) {
      console.error('\n❌ Database integrity check failed! Database may be corrupted.');
      console.error('   Consider restoring from backup before migration.');
    }
  } catch (error) {
    logWarning(`Integrity check error: ${error.message}`);
  }

  // Check 5: Schema version
  let currentSchemaVersion = 0;
  try {
    const metadataRows = db.prepare("SELECT value FROM metadata WHERE key = 'schema_version'").all();
    if (metadataRows.length > 0) {
      currentSchemaVersion = parseInt(metadataRows[0].value || '0', 10);
      logCheck('Schema Version', true, `Current version: ${currentSchemaVersion}, Target: ${SCHEMA_VERSION}`);
      
      if (currentSchemaVersion > SCHEMA_VERSION) {
        logWarning(`Database schema version (${currentSchemaVersion}) is newer than expected (${SCHEMA_VERSION}). This may cause issues.`);
      } else if (currentSchemaVersion < SCHEMA_VERSION) {
        logWarning(`Database schema version (${currentSchemaVersion}) is older than target (${SCHEMA_VERSION}). Migration will upgrade it automatically.`);
      }
    } else {
      logWarning('No schema_version found in metadata table. Database may be very old.');
      currentSchemaVersion = 0;
    }
  } catch (error) {
    logWarning(`Metadata table may not exist: ${error.message}`);
  }

  // Check 6: List all tables
  try {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
    const tableNames = tables.map(t => t.name);
    logCheck('Tables Found', tableNames.length > 0, `Found ${tableNames.length} tables`);
    
    if (tableNames.length === 0) {
      console.error('\n❌ No tables found in database! Cannot proceed.');
      db.close();
      process.exit(1);
    }
  } catch (error) {
    logCheck('Tables Found', false, `Error: ${error.message}`);
  }

  // Check 7: Critical tables exist
  for (const table of CRITICAL_TABLES) {
    try {
      const exists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?").get(table);
      logCheck(`Table: ${table}`, !!exists, exists ? 'Exists' : 'Missing');
    } catch (error) {
      logCheck(`Table: ${table}`, false, `Error checking: ${error.message}`);
    }
  }

  // Check 8: tenant_id columns
  let tablesWithTenantId = 0;
  let tablesWithoutTenantId = [];
  
  for (const table of TENANT_TABLES) {
    try {
      const cols = db.prepare(`PRAGMA table_info("${table}")`).all();
      const hasTenantId = cols.some(c => c.name === 'tenant_id');
      
      if (hasTenantId) {
        tablesWithTenantId++;
      } else {
        // Check if table exists first
        const tableExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?").get(table);
        if (tableExists) {
          tablesWithoutTenantId.push(table);
        }
      }
    } catch (error) {
      // Table may not exist, skip
    }
  }
  
  logCheck('Tenant ID Columns', tablesWithoutTenantId.length === 0, 
    `${tablesWithTenantId} tables have tenant_id, ${tablesWithoutTenantId.length} missing`);
  
  if (tablesWithoutTenantId.length > 0) {
    logWarning(`Tables without tenant_id column: ${tablesWithoutTenantId.join(', ')}`);
    logWarning('Migration script will handle this, but these tables may need schema updates.');
  }

  // Check 9: Row counts for key tables
  console.log('\n📊 Data Summary:');
  const keyTables = ['users', 'accounts', 'contacts', 'transactions', 'invoices', 'bills'];
  for (const table of keyTables) {
    try {
      const count = db.prepare(`SELECT COUNT(*) as count FROM "${table}"`).get();
      if (count) {
        console.log(`   ${table.padEnd(20)}: ${count.count} rows`);
      }
    } catch (error) {
      // Table may not exist
    }
  }

  // Check 10: WAL/SHM files
  const walFile = SOURCE_DB + '-wal';
  const shmFile = SOURCE_DB + '-shm';
  if (fs.existsSync(walFile) || fs.existsSync(shmFile)) {
    logWarning('WAL/SHM files detected. Database may be in use. Close PBooks Pro before migration.');
  }

  // Summary
  console.log('\n' + '='.repeat(70));
  console.log('  Check Summary');
  console.log('='.repeat(70));
  console.log(`✅ Passed: ${checks.passed}`);
  console.log(`❌ Failed: ${checks.failed}`);
  console.log(`⚠️  Warnings: ${warnings.length}`);
  
  if (issues.length > 0) {
    console.log('\n❌ Issues Found:');
    issues.forEach(issue => console.log(`   - ${issue}`));
  }
  
  if (warnings.length > 0) {
    console.log('\n⚠️  Warnings:');
    warnings.forEach(warning => console.log(`   - ${warning}`));
  }

  db.close();

  // Final recommendation
  console.log('\n' + '='.repeat(70));
  if (checks.failed === 0 && warnings.length === 0) {
    console.log('✅ All checks passed! Database is ready for migration.');
    console.log('\nNext step: Run migration script');
    console.log('   node scripts/migrate-pbookspro-to-rkbuilders.cjs');
  } else if (checks.failed === 0) {
    console.log('✅ Critical checks passed. Some warnings detected.');
    console.log('\n⚠️  Review warnings above, then proceed with migration.');
    console.log('   node scripts/migrate-pbookspro-to-rkbuilders.cjs');
  } else {
    console.log('❌ Critical issues found. Please fix them before migration.');
    console.log('\nRecommendations:');
    if (issues.some(i => i.includes('Integrity'))) {
      console.log('   1. Restore database from backup');
    }
    if (issues.some(i => i.includes('Open'))) {
      console.log('   1. Close PBooks Pro application');
      console.log('   2. Run: npm run rebuild:native');
    }
    process.exit(1);
  }
  console.log('='.repeat(70));
}

main();
