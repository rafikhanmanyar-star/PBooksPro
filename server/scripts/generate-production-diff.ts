
import { Pool } from 'pg';
import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load env vars
dotenv.config({ path: resolve(__dirname, '../../.env') });
dotenv.config({ path: resolve(__dirname, '../.env') });

const shouldUseSSL = (url: string) =>
    process.env.NODE_ENV === 'production' ||
    process.env.NODE_ENV === 'staging' ||
    (url && url.includes('.render.com'));

interface ColumnDef {
    column_name: string;
    data_type: string;
    is_nullable: string;
    column_default: string | null;
    character_maximum_length: number | null;
    numeric_precision: number | null;
    numeric_scale: number | null;
    udt_name: string;
}

async function getTables(pool: Pool): Promise<string[]> {
    const r = await pool.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `);
    return r.rows.map((row: any) => row.table_name);
}

async function getColumnDefs(pool: Pool, table: string): Promise<ColumnDef[]> {
    const r = await pool.query(
        `
    SELECT 
      column_name, 
      data_type, 
      is_nullable, 
      column_default,
      character_maximum_length,
      numeric_precision,
      numeric_scale,
      udt_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = $1
    ORDER BY ordinal_position
  `,
        [table]
    );
    return r.rows;
}

function formatType(col: ColumnDef): string {
    // Simplify common types
    const type = col.data_type.toLowerCase();

    if (type === 'user-defined') {
        return col.udt_name; // handling enums or custom types
    }

    if (type === 'character varying') {
        return col.character_maximum_length
            ? `VARCHAR(${col.character_maximum_length})`
            : 'TEXT'; // Default to TEXT if no length often better in PG
    }

    if (type === 'numeric' || type === 'decimal') {
        if (col.numeric_precision) {
            return `DECIMAL(${col.numeric_precision}, ${col.numeric_scale || 0})`;
        }
        return 'DECIMAL';
    }

    if (type === 'timestamp without time zone') return 'TIMESTAMP';
    if (type === 'timestamp with time zone') return 'TIMESTAMPTZ';

    return type.toUpperCase();
}

function formatColumnDefinition(col: ColumnDef): string {
    let def = `    ${col.column_name} ${formatType(col)}`;

    if (col.is_nullable === 'NO') {
        def += ' NOT NULL';
    }

    if (col.column_default) {
        def += ` DEFAULT ${col.column_default}`;
    }

    return def;
}

async function main() {
    // Use source as local/staging and target as production
    const sourceUrl = process.env.DATABASE_URL || process.env.STAGING_DATABASE_URL;
    const targetUrl = process.env.PRODUCTION_DATABASE_URL;

    if (!sourceUrl || !targetUrl) {
        console.error('❌ Error: Both DATABASE_URL (or STAGING_DATABASE_URL) and PRODUCTION_DATABASE_URL must be set.');
        process.exit(1);
    }

    console.log(`🔌 Connecting to DBs...`);
    console.log(`   Source: ${sourceUrl.split('@')[1] || '...'}`); // Hide credentials
    console.log(`   Target: ${targetUrl.split('@')[1] || '...'}`);

    const sourcePool = new Pool({
        connectionString: sourceUrl,
        ssl: shouldUseSSL(sourceUrl) ? { rejectUnauthorized: false } : false,
    });

    const targetPool = new Pool({
        connectionString: targetUrl,
        ssl: shouldUseSSL(targetUrl) ? { rejectUnauthorized: false } : false,
    });

    const sqlStatements: string[] = [];
    sqlStatements.push('-- Auto-generated Diff Script');
    sqlStatements.push(`-- Date: ${new Date().toISOString()}`);
    sqlStatements.push('BEGIN;\n');

    try {
        const sourceTables = await getTables(sourcePool);
        const targetTables = await getTables(targetPool);
        const targetSet = new Set(targetTables);

        // 1. Missing Tables
        const missingTables = sourceTables.filter(t => !targetSet.has(t));
        if (missingTables.length > 0) {
            sqlStatements.push('-- MISSING TABLES');
            for (const table of missingTables) {
                console.log(`Found missing table: ${table}`);
                const cols = await getColumnDefs(sourcePool, table);

                // Basic Create Table
                let createSql = `CREATE TABLE IF NOT EXISTS ${table} (\n`;
                createSql += cols.map(c => formatColumnDefinition(c)).join(',\n');

                // Add primary key if simple 'id' check? 
                // Better to check constraints but keep simple for now.
                // If there's a column named 'id', users often make it PK. 
                // But let's verify constraints properly if we can? 
                // For now, simpler: just list columns. The migration likely contains keys.
                // We append a comment warning.
                createSql += '\n);\n';

                // Try to find PK
                const pkRes = await sourcePool.query(`
                SELECT c.column_name
                FROM information_schema.table_constraints tc 
                JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
                JOIN information_schema.columns c ON c.table_name = tc.table_name AND c.column_name = ccu.column_name
                WHERE constraint_type = 'PRIMARY KEY' AND tc.table_name = $1
            `, [table]);

                if (pkRes.rows.length > 0) {
                    const pkCol = pkRes.rows[0].column_name;
                    createSql = createSql.replace(');', `, PRIMARY KEY (${pkCol})\n);`);
                }

                sqlStatements.push(createSql);
                sqlStatements.push(`-- TODO: Check invalid foreign keys for ${table}`);
            }
        }

        // 2. Missing Columns
        const commonTables = sourceTables.filter(t => targetSet.has(t));
        if (commonTables.length > 0) {
            sqlStatements.push('\n-- MISSING COLUMNS');
        }

        for (const table of commonTables) {
            const sourceCols = await getColumnDefs(sourcePool, table);
            const targetCols = await getColumnDefs(targetPool, table);
            const targetColNames = new Set(targetCols.map(c => c.column_name));

            const missingCols = sourceCols.filter(c => !targetColNames.has(c.column_name));

            if (missingCols.length > 0) {
                console.log(`Table ${table} is missing ${missingCols.length} columns.`);
                sqlStatements.push(`\n-- Missing columns in ${table}`);
                for (const col of missingCols) {
                    const def = formatColumnDefinition(col).trim(); // remove indentation for alter
                    sqlStatements.push(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${def};`);
                }
            }
        }

        sqlStatements.push('\nCOMMIT;');

        const outputPath = resolve(__dirname, '../../generated_fix_schema.sql');
        fs.writeFileSync(outputPath, sqlStatements.join('\n\n'));
        console.log(`\n✅ Generated fix script at: ${outputPath}`);
        console.log('You can review this file and apply it to production.');

    } catch (err: any) {
        console.error('Error:', err.message);
    } finally {
        await sourcePool.end();
        await targetPool.end();
    }
}

main();
