import { Pool } from 'pg';
import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: resolve(__dirname, '../.env') });

async function diagnose() {
    const shouldUseSSL = process.env.NODE_ENV === 'production' ||
        process.env.NODE_ENV === 'staging' ||
        (process.env.DATABASE_URL && process.env.DATABASE_URL.includes('.render.com'));

    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: shouldUseSSL ? { rejectUnauthorized: false } : false,
    });

    try {
        console.log('🔍 Checking constraints...');
        const result = await pool.query(`
      SELECT 
        tc.table_name, 
        tc.constraint_name, 
        tc.constraint_type, 
        kcu.column_name
      FROM 
        information_schema.table_constraints AS tc 
        JOIN information_schema.key_column_usage AS kcu
          ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
      WHERE tc.table_schema = 'public'
      ORDER BY tc.table_name;
    `);

        console.table(result.rows);

        // Check specific tables
        const tables = ['admin_users', 'schema_migrations', 'marketplace_categories'];
        for (const table of tables) {
            const res = await pool.query(`SELECT table_name FROM information_schema.tables WHERE table_name = $1`, [table]);
            if (res.rows.length === 0) {
                console.log(`❌ Table ${table} NOT FOUND`);
            } else {
                console.log(`✅ Table ${table} exists`);
                const constraints = await pool.query(`
          SELECT conname, contype 
          FROM pg_constraint 
          WHERE conrelid = $1::regclass
        `, [table]);
                console.log(`   Constraints for ${table}:`, constraints.rows);
            }
        }

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await pool.end();
    }
}

diagnose();
