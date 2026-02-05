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
        const query = `
            SELECT 
                tc.table_name, 
                kcu.column_name, 
                ccu.table_name AS foreign_table_name, 
                ccu.column_name AS foreign_column_name 
            FROM 
                information_schema.table_constraints AS tc 
                JOIN information_schema.key_column_usage AS kcu 
                  ON tc.constraint_name = kcu.constraint_name 
                JOIN information_schema.constraint_column_usage AS ccu 
                  ON ccu.constraint_name = tc.constraint_name 
            WHERE 
                tc.constraint_type = 'FOREIGN KEY' 
                AND ccu.table_name IN ('accounts', 'categories')
        `;
        const result = await db.query(query);
        console.log(JSON.stringify(result, null, 2));
    } catch (e) {
        console.error(e);
    } finally {
        process.exit();
    }
}

run();
