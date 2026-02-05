import { getDatabaseService } from '../services/databaseService.js';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

const db = getDatabaseService();

async function run() {
    try {
        const sqlPath = path.join(__dirname, '../migrations/make-system-independent.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');
        console.log('🚀 Running migration: make-system-independent.sql');
        await db.query(sql);
        console.log('✅ Migration successful!');
    } catch (e) {
        console.error('❌ Migration failed:', e);
    } finally {
        process.exit();
    }
}

run();
