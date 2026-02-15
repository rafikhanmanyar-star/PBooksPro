import { Pool } from 'pg';
import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: resolve(__dirname, '../.env') });

async function checkDocuments() {
    const shouldUseSSL = process.env.NODE_ENV === 'production' ||
        process.env.NODE_ENV === 'staging' ||
        (process.env.DATABASE_URL && process.env.DATABASE_URL.includes('.render.com'));

    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: shouldUseSSL ? { rejectUnauthorized: false } : false,
    });

    try {
        const res = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_name = 'documents'
    `);

        if (res.rows.length === 0) {
            console.log('❌ Table documents NOT FOUND');
        } else {
            console.log('✅ Table documents exists');
            const cols = await pool.query(`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = 'documents'
      `);
            console.table(cols.rows);
        }

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await pool.end();
    }
}

checkDocuments();
