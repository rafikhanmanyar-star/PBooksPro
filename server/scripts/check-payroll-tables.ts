import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

async function checkPayrollTables() {
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.DATABASE_URL?.includes('.render.com') ? { rejectUnauthorized: false } : false,
    });

    try {
        console.log('🔍 Checking payroll tables...\n');

        // Check if tables exist
        const tables = ['payroll_departments', 'payroll_grades', 'payroll_employees', 'payroll_runs', 'payslips', 'payroll_salary_components'];

        for (const table of tables) {
            const result = await pool.query(
                `SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = $1
        )`,
                [table]
            );

            const exists = result.rows[0].exists;
            console.log(`${exists ? '✅' : '❌'} ${table}: ${exists ? 'EXISTS' : 'MISSING'}`);

            if (exists) {
                // Count rows
                const countResult = await pool.query(`SELECT COUNT(*) FROM ${table}`);
                console.log(`   → ${countResult.rows[0].count} rows\n`);
            }
        }

        // Check payslips table structure
        console.log('\n📋 Payslips table columns:');
        const columns = await pool.query(
            `SELECT column_name, data_type, is_nullable 
       FROM information_schema.columns 
       WHERE table_name = 'payslips' 
       ORDER BY ordinal_position`
        );

        if (columns.rows.length > 0) {
            columns.rows.forEach(col => {
                console.log(`   - ${col.column_name}: ${col.data_type} ${col.is_nullable === 'NO' ? 'NOT NULL' : ''}`);
            });
        } else {
            console.log('   ⚠️  Table does not exist or has no columns');
        }

    } catch (error: any) {
        console.error('❌ Error:', error.message);
    } finally {
        await pool.end();
    }
}

checkPayrollTables();
