import { spawn } from 'node:child_process';
import pg from 'pg';
import { closePool } from '../../../db/pool.js';

function runCommand(
  command: string,
  args: string[],
  logLabel: string
): Promise<{ code: number | null; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stderr = '';
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on('error', (err) => {
      reject(err);
    });
    child.on('close', (code) => {
      if (stderr.trim()) {
        console.error(`[${logLabel}]`, stderr.trim());
      }
      resolve({ code, stderr });
    });
  });
}

export async function terminateOtherDbSessions(connectionString: string): Promise<void> {
  const c = new pg.Client({ connectionString });
  await c.connect();
  try {
    await c.query(
      `SELECT pg_terminate_backend(pid)
       FROM pg_stat_activity
       WHERE datname = current_database()
         AND pid <> pg_backend_pid()
         AND backend_type = 'client backend'`
    );
  } finally {
    await c.end();
  }
}

export async function runPgRestoreFromFile(dumpPath: string): Promise<void> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    throw new Error('DATABASE_URL is not configured.');
  }

  await closePool();
  try {
    await terminateOtherDbSessions(dbUrl);
  } catch (e) {
    console.warn('[pgRestore] terminateOtherDbSessions:', e);
  }

  const { code, stderr } = await runCommand(
    'pg_restore',
    ['--clean', '--if-exists', '--no-owner', '--no-acl', '-d', dbUrl, dumpPath],
    'pg_restore'
  );
  if (code === 2 || code === null) {
    const msg = stderr.trim() || `pg_restore exited with code ${code}`;
    if (msg.includes('ENOENT') || msg.toLowerCase().includes('spawn')) {
      throw new Error('pg_restore was not found. Install PostgreSQL client tools.');
    }
    throw new Error(msg);
  }
}
