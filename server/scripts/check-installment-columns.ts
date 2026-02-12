import { Pool } from 'pg';
import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, '../.env') });

async function checkColumns() {
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });

    const res = await pool.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'installment_plans'
    ORDER BY column_name;
  `);

    console.log('Columns in installment_plans:');
    res.rows.forEach(row => console.log(`- ${row.column_name} (${row.data_type})`));

    await pool.end();
}

checkColumns();
