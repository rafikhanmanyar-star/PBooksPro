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
        const tables = ['marketplace_categories', 'schema_migrations', 'admin_users'];
        for (const table of tables) {
            console.log(`\n--- TABLE: ${table} ---`);

            const columns = await pool.query(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = $1
      `, [table]);
            console.table(columns.rows);

            const constraints = await pool.query(`
        SELECT 
          tc.constraint_name, 
          tc.constraint_type, 
          kcu.column_name
        FROM 
          information_schema.table_constraints AS tc 
          JOIN information_schema.key_column_usage AS kcu
            ON tc.constraint_name = kcu.constraint_name
            AND tc.table_schema = kcu.table_schema
        WHERE tc.table_name = $1
      `, [table]);
            console.table(constraints.rows);
        }

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await pool.end();
    }
}

diagnose();
