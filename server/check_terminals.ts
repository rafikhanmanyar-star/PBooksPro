
import { Pool } from 'pg';
import dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(process.cwd(), '.env') });

async function checkTerminals() {
    let pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });

    try {
        await pool.query('SELECT 1');
    } catch (e) {
        console.warn('SSL connection failed, trying without SSL...');
        await pool.end();
        pool = new Pool({
            connectionString: process.env.DATABASE_URL
        });
    }

    try {
        const rlsStatus = await pool.query(`
            SELECT tablename, rowsecurity 
            FROM pg_tables 
            WHERE tablename LIKE 'shop_%' OR tablename = 'users'
        `);
        console.log('RLS Status:', JSON.stringify(rlsStatus.rows, null, 2));

        const policies = await pool.query(`
            SELECT * FROM pg_policies WHERE tablename = 'shop_terminals'
        `);
        console.log('Policies for shop_terminals:', JSON.stringify(policies.rows, null, 2));

        const currentUser = await pool.query('SELECT current_user');
        console.log('Current DB User:', currentUser.rows[0].current_user);

        const branches = await pool.query('SELECT id, name, tenant_id FROM shop_branches');
        console.log('Branches Data:', JSON.stringify(branches.rows, null, 2));

        const terminals = await pool.query('SELECT id, name, tenant_id, branch_id FROM shop_terminals');
        console.log('Terminals Data:', JSON.stringify(terminals.rows, null, 2));

    } catch (err) {
        console.error('Error during diagnostic:', err);
    } finally {
        await pool.end();
    }
}

checkTerminals();
