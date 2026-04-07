/**
 * Run SQL migrations from database/migrations (project root).
 * Usage: DATABASE_URL=... npm run migrate --prefix backend
 */
import './loadEnv.js';
import { readFileSync, readdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { getPool } from './db/pool.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..', '..');
const migrationsDir = join(projectRoot, 'database', 'migrations');

async function main() {
  const pool = getPool();
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const file of files) {
    const sqlPath = join(migrationsDir, file);
    const sql = readFileSync(sqlPath, 'utf-8');
    await pool.query(sql);
    console.log('Migration applied:', sqlPath);
  }
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
