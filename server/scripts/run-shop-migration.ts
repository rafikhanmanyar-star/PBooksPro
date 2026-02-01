import { Pool } from 'pg';
import dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load env from server directory
dotenv.config({ path: join(__dirname, '../.env') });

async function runShopMigration() {
    if (!process.env.DATABASE_URL) {
        console.error('DATABASE_URL environment variable is not set in .env file');
        process.exit(1);
    }

    const dbUrl = process.env.DATABASE_URL;
    // Enable SSL for production, staging, and any Render database URLs
    const shouldUseSSL = process.env.NODE_ENV === 'production' ||
        process.env.NODE_ENV === 'staging' ||
        (dbUrl && dbUrl.includes('.render.com'));

    console.log('🔗 Connecting to database...');
    const pool = new Pool({
        connectionString: dbUrl,
        ssl: shouldUseSSL ? { rejectUnauthorized: false } : false,
    });

    try {
        console.log('🔄 Starting Shop & POS migration...');

        // Read migration file
        const migrationPath = join(__dirname, '../migrations/add-shop-pos-tables.sql');
        console.log(`📋 Reading schema from: ${migrationPath}`);
        const schemaSQL = readFileSync(migrationPath, 'utf8');

        // Execute schema
        await pool.query(schemaSQL);
        console.log('✅ Shop & POS tables created/verified');

    } catch (error) {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

runShopMigration();
