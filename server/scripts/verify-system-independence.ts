import { getDatabaseService } from '../services/databaseService.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

const db = getDatabaseService();

async function run() {
    try {
        const result = await db.query('SELECT id, name, tenant_id FROM accounts WHERE is_permanent = TRUE');
        console.log('System Accounts in DB:');
        console.log(JSON.stringify(result, null, 2));

        const catResult = await db.query('SELECT id, name, tenant_id FROM categories WHERE is_permanent = TRUE LIMIT 10');
        console.log('\nSystem Categories (first 10) in DB:');
        console.log(JSON.stringify(catResult, null, 2));
    } catch (e) {
        console.error(e);
    } finally {
        process.exit();
    }
}

run();
