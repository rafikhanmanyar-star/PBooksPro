import pg from 'pg';

const { Pool, types } = pg;

// node-pg parses DATE (OID 1082) into JS Date using the server's local
// timezone, which shifts the calendar day when the server isn't UTC.
// Override to return the raw 'YYYY-MM-DD' string — no timezone ambiguity.
const PG_DATE_OID = 1082;
types.setTypeParser(PG_DATE_OID, (val: string) => val);

let pool: pg.Pool | null = null;

export function getPool(): pg.Pool {
  if (!pool) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error('DATABASE_URL is required for the API server');
    }
    pool = new Pool({ connectionString: url, max: 20 });
  }
  return pool;
}

export async function withTransaction<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const p = getPool();
  const client = await p.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}
