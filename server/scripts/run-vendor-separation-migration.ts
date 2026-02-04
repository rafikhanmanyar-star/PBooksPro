import { getDatabaseService } from '../services/databaseService.js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config();

async function runMigration() {
    const db = getDatabaseService();
    const migrations = [
        '../migrations/separate-vendors.sql',
        '../migrations/cleanup-vendors.sql'
    ];

    for (const mig of migrations) {
        const migrationPath = join(__dirname, mig);
        const sql = fs.readFileSync(migrationPath, 'utf8');

        console.log(`🚀 Running migration: ${mig}...`);
        try {
            await db.query(sql);
            console.log(`✅ ${mig} successful!`);
        } catch (error) {
            console.error(`❌ ${mig} failed:`, error);
            // Don't exit if separate-vendors already ran
        }
    }
}

runMigration();
