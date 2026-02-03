import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

async function testPayrollFlow() {
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.DATABASE_URL?.includes('.render.com') ? { rejectUnauthorized: false } : false,
    });

    try {
        console.log('🧪 Testing Payroll Flow...\n');

        // Get a tenant ID
        const tenantResult = await pool.query('SELECT id FROM tenants LIMIT 1');
        if (tenantResult.rows.length === 0) {
            console.log('❌ No tenants found. Please create a tenant first.');
            return;
        }
        const tenantId = tenantResult.rows[0].id;
        console.log(`✅ Using tenant: ${tenantId}\n`);

        // Check employees
        const employeesResult = await pool.query(
            'SELECT id, name, status FROM payroll_employees WHERE tenant_id = $1',
            [tenantId]
        );
        console.log(`📋 Employees (${employeesResult.rows.length}):`);
        employeesResult.rows.forEach(emp => {
            console.log(`   - ${emp.name} (${emp.status})`);
        });
        console.log();

        // Check payroll runs
        const runsResult = await pool.query(
            'SELECT id, month, year, status, employee_count, total_amount FROM payroll_runs WHERE tenant_id = $1 ORDER BY created_at DESC',
            [tenantId]
        );
        console.log(`📅 Payroll Runs (${runsResult.rows.length}):`);
        runsResult.rows.forEach(run => {
            console.log(`   - ${run.month} ${run.year}: ${run.status} (${run.employee_count} employees, $${run.total_amount || 0})`);
        });
        console.log();

        // Check payslips for each run
        for (const run of runsResult.rows) {
            const payslipsResult = await pool.query(
                `SELECT p.id, p.net_pay, p.is_paid, e.name as employee_name
         FROM payslips p
         JOIN payroll_employees e ON p.employee_id = e.id
         WHERE p.payroll_run_id = $1 AND p.tenant_id = $2`,
                [run.id, tenantId]
            );

            console.log(`💰 Payslips for ${run.month} ${run.year} (${payslipsResult.rows.length}):`);
            if (payslipsResult.rows.length > 0) {
                payslipsResult.rows.forEach(slip => {
                    console.log(`   - ${slip.employee_name}: $${slip.net_pay} ${slip.is_paid ? '✅ PAID' : '⏳ UNPAID'}`);
                });
            } else {
                console.log('   ⚠️  No payslips generated yet');
            }
            console.log();
        }

        // Summary
        console.log('📊 Summary:');
        console.log(`   - Total Employees: ${employeesResult.rows.length}`);
        console.log(`   - Total Payroll Runs: ${runsResult.rows.length}`);

        const totalPayslipsResult = await pool.query(
            'SELECT COUNT(*) FROM payslips WHERE tenant_id = $1',
            [tenantId]
        );
        console.log(`   - Total Payslips: ${totalPayslipsResult.rows[0].count}`);

        console.log('\n✅ Payroll system is operational!');

    } catch (error: any) {
        console.error('❌ Error:', error.message);
        console.error(error.stack);
    } finally {
        await pool.end();
    }
}

testPayrollFlow();
