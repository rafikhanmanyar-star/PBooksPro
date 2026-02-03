import { Pool } from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load env from server directory
dotenv.config({ path: join(__dirname, '../.env') });

async function fixMissingTables() {
    if (!process.env.DATABASE_URL) {
        console.error('DATABASE_URL environment variable is not set');
        process.exit(1);
    }

    const dbUrl = process.env.DATABASE_URL;
    const shouldUseSSL = process.env.NODE_ENV === 'production' ||
        process.env.NODE_ENV === 'staging' ||
        (dbUrl && dbUrl.includes('.render.com'));

    console.log('🔗 Connecting to database...');
    const pool = new Pool({
        connectionString: dbUrl,
        ssl: shouldUseSSL ? { rejectUnauthorized: false } : false,
    });

    try {
        console.log('🔧 Fixing missing tables...');

        // checking sales_returns
        console.log('Checking/Creating sales_returns table...');
        await pool.query(`
        CREATE TABLE IF NOT EXISTS sales_returns (
            id TEXT PRIMARY KEY,
            tenant_id TEXT NOT NULL,
            return_number TEXT NOT NULL,
            agreement_id TEXT NOT NULL,
            return_date DATE NOT NULL,
            reason TEXT NOT NULL,
            reason_notes TEXT,
            penalty_percentage DECIMAL(5, 2) NOT NULL DEFAULT 0,
            penalty_amount DECIMAL(15, 2) NOT NULL DEFAULT 0,
            refund_amount DECIMAL(15, 2) NOT NULL DEFAULT 0,
            status TEXT NOT NULL,
            processed_date TIMESTAMP,
            refunded_date TIMESTAMP,
            refund_bill_id TEXT,
            created_by TEXT,
            notes TEXT,
            created_at TIMESTAMP NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
            FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
            FOREIGN KEY (agreement_id) REFERENCES project_agreements(id) ON DELETE RESTRICT,
            FOREIGN KEY (refund_bill_id) REFERENCES bills(id) ON DELETE SET NULL,
            UNIQUE(tenant_id, return_number)
        );
    `);

        console.log('✅ Missing tables fixed successfully');

    } catch (error) {
        console.error('❌ Fix failed:', error);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

fixMissingTables();
