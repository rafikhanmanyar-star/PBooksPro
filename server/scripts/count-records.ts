
import { Pool } from 'pg';
import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: resolve(__dirname, '../.env') });

async function countRecords() {
    if (!process.env.DATABASE_URL) {
        console.error('DATABASE_URL not set');
        process.exit(1);
    }

    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false },
    });

    try {
        const tables = [
            'transactions',
            'contacts',
            'invoices',
            'bills',
            'payroll_employees',
            'payslips',
            'inventory_batches',
            'quotations',
            'project_agreements'
        ];

        console.log('Record counts per table:');
        for (const table of tables) {
            const result = await pool.query(`SELECT COUNT(*) as count FROM ${table}`);
            console.log(`${table.padEnd(20)}: ${result.rows[0].count}`);
        }

        // Also check top tenants by record count
        console.log('\nTop 5 tenants by total record count (transactions + payroll_employees + payslips):');
        const tenantCounts = await pool.query(`
      SELECT tenant_id, COUNT(*) as total
      FROM (
        SELECT tenant_id FROM transactions
        UNION ALL
        SELECT tenant_id FROM payroll_employees
        UNION ALL
        SELECT tenant_id FROM payslips
      ) combined
      GROUP BY tenant_id
      ORDER BY total DESC
      LIMIT 5
    `);

        tenantCounts.rows.forEach(row => {
            console.log(`Tenant: ${row.tenant_id.padEnd(36)} | Total Records: ${row.total}`);
        });

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await pool.end();
    }
}

countRecords();
