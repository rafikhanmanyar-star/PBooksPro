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
        const result = await db.query('SELECT id, name FROM tenants');
        console.log(JSON.stringify(result, null, 2));
    } catch (e) {
        console.error(e);
    } finally {
        process.exit();
    }
}

run();
