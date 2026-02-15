import { Pool } from 'pg';
import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: resolve(__dirname, '../.env') });

async function checkUpdatedAt() {
    const shouldUseSSL = process.env.NODE_ENV === 'production' ||
        process.env.NODE_ENV === 'staging' ||
        (process.env.DATABASE_URL && process.env.DATABASE_URL.includes('.render.com'));

    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: shouldUseSSL ? { rejectUnauthorized: false } : false,
    });

    try {
        const tables = [
            'transactions', 'invoices', 'bills', 'contacts', 'accounts',
            'categories', 'vendors', 'rental_agreements', 'projects', 'documents'
        ];

        console.log('🔍 Checking updated_at column in tables...');

        for (const table of tables) {
            const res = await pool.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = $1 AND column_name = 'updated_at'
      `, [table]);

            if (res.rows.length === 0) {
                console.log(`❌ Table ${table} is MISSING updated_at`);
            } else {
                console.log(`✅ Table ${table} has updated_at`);
            }
        }

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await pool.end();
    }
}

checkUpdatedAt();
