
import { Pool } from 'pg';
import dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(process.cwd(), '.env') });

async function disableRLS() {
    let pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });

    try {
        await pool.query('SELECT 1');
    } catch (e) {
        pool = new Pool({
            connectionString: process.env.DATABASE_URL
        });
    }

    try {
        console.log('Disabling RLS on shop tables...');
        await pool.query('ALTER TABLE shop_branches DISABLE ROW LEVEL SECURITY');
        await pool.query('ALTER TABLE shop_terminals DISABLE ROW LEVEL SECURITY');
        await pool.query('ALTER TABLE shop_warehouses DISABLE ROW LEVEL SECURITY');
        await pool.query('ALTER TABLE shop_products DISABLE ROW LEVEL SECURITY');
        await pool.query('ALTER TABLE shop_inventory DISABLE ROW LEVEL SECURITY');
        await pool.query('ALTER TABLE shop_loyalty_members DISABLE ROW LEVEL SECURITY');
        await pool.query('ALTER TABLE shop_sales DISABLE ROW LEVEL SECURITY');
        await pool.query('ALTER TABLE shop_sale_items DISABLE ROW LEVEL SECURITY');
        await pool.query('ALTER TABLE shop_inventory_movements DISABLE ROW LEVEL SECURITY');
        await pool.query('ALTER TABLE shop_policies DISABLE ROW LEVEL SECURITY');
        console.log('✅ RLS disabled successfully for all shop tables.');
    } catch (err) {
        console.error('Error disabling RLS:', err);
    } finally {
        await pool.end();
    }
}

disableRLS();
