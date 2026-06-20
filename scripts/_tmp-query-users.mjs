import dotenv from 'dotenv';
import pg from 'pg';
import { resolve } from 'node:path';
dotenv.config({ path: resolve('.env.staging') });
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const r = await pool.query(
  `SELECT username, email, id FROM users WHERE tenant_id = 'test-company' ORDER BY username`
);
console.log(r.rows);
await pool.end();
