/**
 * Generate SQL migration to sync staging database with production
 * This script compares production and staging, then generates ALTER/CREATE statements
 */

import { Pool } from 'pg';
import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { writeFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: resolve(__dirname, '../.env') });

interface ColumnInfo {
  columnName: string;
  dataType: string;
  isNullable: string;
  columnDefault: string | null;
  characterMaximumLength: number | null;
}

async function getTables(pool: Pool): Promise<string[]> {
  const result = await pool.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `);
  return result.rows.map(row => row.table_name);
}

async function getTableColumns(pool: Pool, tableName: string): Promise<ColumnInfo[]> {
  const result = await pool.query(`
    SELECT 
      column_name,
      data_type,
      is_nullable,
      column_default,
      character_maximum_length
    FROM information_schema.columns
    WHERE table_schema = 'public' 
    AND table_name = $1
    ORDER BY ordinal_position
  `, [tableName]);
  
  return result.rows.map(row => ({
    columnName: row.column_name,
    dataType: row.data_type,
    isNullable: row.is_nullable,
    columnDefault: row.column_default,
    characterMaximumLength: row.character_maximum_length
  }));
}

function generateColumnType(col: ColumnInfo): string {
  let type = col.dataType.toUpperCase();
  
  // Handle character types with length
  if (col.characterMaximumLength) {
    if (type.includes('CHARACTER') || type.includes('CHAR') || type.includes('VARCHAR')) {
      type = `VARCHAR(${col.characterMaximumLength})`;
    }
  }
  
  // Map common types
  if (type === 'CHARACTER VARYING') {
    type = col.characterMaximumLength ? `VARCHAR(${col.characterMaximumLength})` : 'TEXT';
  }
  
  return type;
}

async function getTableDefinition(pool: Pool, tableName: string): Promise<string> {
  // Get all columns with full details
  const columns = await getTableColumns(pool, tableName);
  
  // Get primary key
  const pkResult = await pool.query(`
    SELECT kcu.column_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
    WHERE tc.constraint_type = 'PRIMARY KEY'
    AND tc.table_name = $1
    AND tc.table_schema = 'public'
    ORDER BY kcu.ordinal_position
  `, [tableName]);
  
  const primaryKeys = pkResult.rows.map(row => row.column_name);
  
  
  // Get foreign keys
  const fkResult = await pool.query(`
    SELECT
      kcu.column_name,
      ccu.table_name AS foreign_table_name,
      ccu.column_name AS foreign_column_name,
      rc.delete_rule
    FROM information_schema.table_constraints AS tc
    JOIN information_schema.key_column_usage AS kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage AS ccu
      ON ccu.constraint_name = tc.constraint_name
      AND ccu.table_schema = tc.table_schema
    JOIN information_schema.referential_constraints AS rc
      ON rc.constraint_name = tc.constraint_name
    WHERE tc.constraint_type = 'FOREIGN KEY'
    AND tc.table_name = $1
    AND tc.table_schema = 'public'
  `, [tableName]);
  
  // Get unique constraints
  const uniqueResult = await pool.query(`
    SELECT
      kcu.column_name,
      tc.constraint_name
    FROM information_schema.table_constraints AS tc
    JOIN information_schema.key_column_usage AS kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
    WHERE tc.constraint_type = 'UNIQUE'
    AND tc.table_name = $1
    AND tc.table_schema = 'public'
    AND tc.constraint_name NOT LIKE '%_pkey'
  `, [tableName]);
  
  // Get check constraints (excluding NOT NULL checks which are redundant)
  const checkResult = await pool.query(`
    SELECT
      constraint_name,
      check_clause
    FROM information_schema.check_constraints
    WHERE constraint_name IN (
      SELECT constraint_name
      FROM information_schema.table_constraints
      WHERE table_name = $1
      AND table_schema = 'public'
      AND constraint_type = 'CHECK'
    )
    AND check_clause NOT LIKE '%IS NOT NULL%'
  `, [tableName]);
  
  // Build column definitions
  const columnDefs: string[] = [];
  for (const col of columns) {
    let def = `    ${col.columnName} `;
    
    // Data type
    const type = generateColumnType(col);
    def += type;
    
    // Nullable
    if (col.isNullable === 'NO') {
      def += ' NOT NULL';
    }
    
    // Default
    if (col.columnDefault) {
      def += ` DEFAULT ${col.columnDefault}`;
    }
    
    columnDefs.push(def);
  }
  
  // Build CREATE TABLE statement
  let createSQL = `CREATE TABLE IF NOT EXISTS ${tableName} (\n`;
  createSQL += columnDefs.join(',\n');
  
  // Add primary key
  if (primaryKeys.length > 0) {
    createSQL += `,\n    PRIMARY KEY (${primaryKeys.join(', ')})`;
  }
  
  createSQL += '\n);\n';
  
  // Add foreign keys
  for (const fk of fkResult.rows) {
    const deleteRule = fk.delete_rule === 'CASCADE' ? 'ON DELETE CASCADE' :
                      fk.delete_rule === 'SET NULL' ? 'ON DELETE SET NULL' :
                      fk.delete_rule === 'RESTRICT' ? 'ON DELETE RESTRICT' : '';
    const constraintName = `${tableName}_${fk.column_name}_fkey`;
    createSQL += `\nDO $$\nBEGIN\n`;
    createSQL += `  IF NOT EXISTS (\n`;
    createSQL += `    SELECT 1 FROM pg_constraint WHERE conname = '${constraintName}'\n`;
    createSQL += `  ) THEN\n`;
    createSQL += `    ALTER TABLE ${tableName} ADD CONSTRAINT ${constraintName} `;
    createSQL += `FOREIGN KEY (${fk.column_name}) REFERENCES ${fk.foreign_table_name}(${fk.foreign_column_name}) ${deleteRule};\n`;
    createSQL += `  END IF;\n`;
    createSQL += `END $$;\n`;
  }
  
  // Add unique constraints (excluding primary key)
  const uniqueGroups = new Map<string, string[]>();
  for (const uq of uniqueResult.rows) {
    if (!uniqueGroups.has(uq.constraint_name)) {
      uniqueGroups.set(uq.constraint_name, []);
    }
    uniqueGroups.get(uq.constraint_name)!.push(uq.column_name);
  }
  
  for (const [constraintName, cols] of uniqueGroups) {
    createSQL += `\nDO $$\nBEGIN\n`;
    createSQL += `  IF NOT EXISTS (\n`;
    createSQL += `    SELECT 1 FROM pg_constraint WHERE conname = '${constraintName}'\n`;
    createSQL += `  ) THEN\n`;
    createSQL += `    ALTER TABLE ${tableName} ADD CONSTRAINT ${constraintName} UNIQUE (${cols.join(', ')});\n`;
    createSQL += `  END IF;\n`;
    createSQL += `END $$;\n`;
  }
  
  // Add check constraints (excluding NOT NULL checks)
  const seenCheckConstraints = new Set<string>();
  for (const check of checkResult.rows) {
    // Skip duplicate constraints with same name
    if (seenCheckConstraints.has(check.constraint_name)) {
      continue;
    }
    seenCheckConstraints.add(check.constraint_name);
    
    createSQL += `\nDO $$\nBEGIN\n`;
    createSQL += `  IF NOT EXISTS (\n`;
    createSQL += `    SELECT 1 FROM pg_constraint WHERE conname = '${check.constraint_name}'\n`;
    createSQL += `  ) THEN\n`;
    createSQL += `    ALTER TABLE ${tableName} ADD CONSTRAINT ${check.constraint_name} CHECK (${check.check_clause});\n`;
    createSQL += `  END IF;\n`;
    createSQL += `END $$;\n`;
  }
  
  // Get indexes (excluding those created by constraints)
  const indexResult = await pool.query(`
    SELECT
      i.indexname,
      i.indexdef
    FROM pg_indexes i
    WHERE i.tablename = $1
    AND i.schemaname = 'public'
    AND i.indexname NOT LIKE '%_pkey'
    AND NOT EXISTS (
      SELECT 1
      FROM pg_constraint c
      WHERE c.conname = i.indexname
    )
  `, [tableName]);
  
  for (const idx of indexResult.rows) {
    // Convert CREATE INDEX to CREATE INDEX IF NOT EXISTS
    const indexDef = idx.indexdef.replace('CREATE INDEX', 'CREATE INDEX IF NOT EXISTS');
    createSQL += `\n${indexDef};\n`;
  }
  
  return createSQL;
}

function generateAlterTableSQL(
  tableName: string,
  missingColumns: ColumnInfo[]
): string[] {
  const statements: string[] = [];
  
  // Add missing columns
  for (const col of missingColumns) {
    const type = generateColumnType(col);
    const nullable = col.isNullable === 'YES' ? '' : ' NOT NULL';
    let defaultValue = '';
    
    if (col.columnDefault) {
      // Handle different default value formats
      if (col.columnDefault.includes('nextval') || col.columnDefault.includes('now()')) {
        defaultValue = ` DEFAULT ${col.columnDefault}`;
      } else if (col.columnDefault.startsWith("'") && col.columnDefault.endsWith("'")) {
        defaultValue = ` DEFAULT ${col.columnDefault}`;
      } else {
        defaultValue = ` DEFAULT ${col.columnDefault}`;
      }
    } else if (col.isNullable === 'NO' && !col.columnDefault) {
      // Required column without default - might need manual handling
      statements.push(`-- WARNING: Column ${col.columnName} in ${tableName} is NOT NULL without default`);
      statements.push(`-- You may need to provide a default value or update existing rows first`);
    }
    
    statements.push(
      `ALTER TABLE ${tableName} ADD COLUMN IF NOT EXISTS ${col.columnName} ${type}${nullable}${defaultValue};`
    );
  }
  
  return statements;
}

async function generateMigrationSQL() {
  const stagingUrl = process.env.STAGING_DATABASE_URL || process.env.DATABASE_URL;
  const prodUrl = process.env.PRODUCTION_DATABASE_URL;
  
  if (!stagingUrl) {
    console.error('❌ STAGING_DATABASE_URL or DATABASE_URL environment variable is not set');
    process.exit(1);
  }
  
  if (!prodUrl) {
    console.error('❌ PRODUCTION_DATABASE_URL environment variable is not set');
    console.log('\n💡 Set PRODUCTION_DATABASE_URL in your .env file');
    process.exit(1);
  }
  
  console.log('🔍 Connecting to databases...\n');
  
  const stagingPool = new Pool({
    connectionString: stagingUrl,
    ssl: { rejectUnauthorized: false }
  });
  
  const prodPool = new Pool({
    connectionString: prodUrl,
    ssl: { rejectUnauthorized: false }
  });
  
  try {
    await stagingPool.query('SELECT 1');
    await prodPool.query('SELECT 1');
    console.log('✅ Connected to both databases\n');
    
    // Get table information
    console.log('📊 Gathering table information...\n');
    const stagingTables = await getTables(stagingPool);
    const prodTables = await getTables(prodPool);
    
    console.log(`📋 Staging: ${stagingTables.length} tables`);
    console.log(`📋 Production: ${prodTables.length} tables\n`);
    
    const migrationSQL: string[] = [];
    migrationSQL.push('-- Migration Script: Sync Staging Database to Match Production');
    migrationSQL.push('-- Generated automatically - Review before running!');
    migrationSQL.push(`-- Date: ${new Date().toISOString()}`);
    migrationSQL.push('');
    migrationSQL.push('BEGIN;');
    migrationSQL.push('');
    
    // Find missing tables in staging
    const missingTables = prodTables.filter(t => !stagingTables.includes(t));
    if (missingTables.length > 0) {
      migrationSQL.push('-- ============================================================================');
      migrationSQL.push('-- MISSING TABLES - Creating these tables');
      migrationSQL.push('-- ============================================================================');
      migrationSQL.push('');
      
      console.log(`📝 Generating CREATE TABLE statements for ${missingTables.length} missing table(s)...`);
      
      for (const tableName of missingTables) {
        try {
          console.log(`   Generating definition for: ${tableName}`);
          const tableDef = await getTableDefinition(prodPool, tableName);
          migrationSQL.push(`-- Table: ${tableName}`);
          migrationSQL.push(tableDef);
          migrationSQL.push('');
        } catch (error: any) {
          console.error(`   ⚠️  Error generating definition for ${tableName}:`, error.message);
          migrationSQL.push(`-- ERROR: Could not generate definition for ${tableName}`);
          migrationSQL.push(`-- Please create this table manually from postgresql-schema.sql`);
          migrationSQL.push('');
        }
      }
    }
    
    // Compare columns in existing tables
    migrationSQL.push('-- ============================================================================');
    migrationSQL.push('-- MISSING COLUMNS - Add these columns to staging tables');
    migrationSQL.push('-- ============================================================================');
    migrationSQL.push('');
    
    let hasChanges = false;
    let totalMissingColumns = 0;
    
    for (const tableName of prodTables) {
      if (!stagingTables.includes(tableName)) {
        continue; // Skip tables that don't exist in staging
      }
      
      const stagingCols = await getTableColumns(stagingPool, tableName);
      const prodCols = await getTableColumns(prodPool, tableName);
      
      const stagingMap = new Map(stagingCols.map(col => [col.columnName, col]));
      
      const missingColumns: ColumnInfo[] = [];
      
      // Find missing columns
      for (const prodCol of prodCols) {
        if (!stagingMap.has(prodCol.columnName)) {
          missingColumns.push(prodCol);
        }
      }
      
      if (missingColumns.length > 0) {
        hasChanges = true;
        totalMissingColumns += missingColumns.length;
        migrationSQL.push(`-- Table: ${tableName} (${missingColumns.length} missing column(s))`);
        const alterStatements = generateAlterTableSQL(tableName, missingColumns);
        migrationSQL.push(...alterStatements);
        migrationSQL.push('');
      }
    }
    
    if (!hasChanges && missingTables.length === 0) {
      migrationSQL.push('-- No changes needed! Databases are already in sync.');
    }
    
    migrationSQL.push('COMMIT;');
    migrationSQL.push('');
    migrationSQL.push('-- ============================================================================');
    migrationSQL.push('-- Migration complete!');
    migrationSQL.push('-- ============================================================================');
    
    // Write to file
    const outputFile = resolve(__dirname, '../migrations/sync-staging-to-production.sql');
    writeFileSync(outputFile, migrationSQL.join('\n'));
    
    console.log('='.repeat(80));
    console.log('📝 MIGRATION SQL GENERATED');
    console.log('='.repeat(80));
    console.log(`\n✅ Migration script saved to: ${outputFile}\n`);
    
    if (missingTables.length > 0) {
      console.log(`✅ Generated CREATE TABLE statements for ${missingTables.length} missing table(s):`);
      missingTables.forEach(table => console.log(`   - ${table}`));
      console.log('');
    }
    
    if (hasChanges) {
      console.log(`✅ Generated SQL to add ${totalMissingColumns} missing column(s)`);
      console.log('💡 Review the migration file before running it!\n');
    } else if (missingTables.length === 0) {
      console.log('✅ No changes needed - databases are in sync!\n');
    }
    
    console.log('📋 Next steps:');
    console.log('   1. Review the generated SQL file');
    console.log('   2. Backup your staging database');
    console.log('   3. Run the migration on staging database');
    console.log('   4. Verify the changes\n');
    
  } catch (error: any) {
    console.error('❌ Error generating migration:', error.message);
    if (error.code === 'ENOTFOUND') {
      console.error('\n💡 Check your database URLs - hostname might be incorrect');
    } else if (error.code === '28P01') {
      console.error('\n💡 Authentication failed - check username and password');
    }
    process.exit(1);
  } finally {
    await stagingPool.end();
    await prodPool.end();
  }
}

generateMigrationSQL()
  .then(() => {
    console.log('✅ Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Failed:', error);
    process.exit(1);
  });