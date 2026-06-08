/**
 * Full PostgreSQL backup via pg_dump (shared by manual routes and scheduler).
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

export function isDatabaseBackupRestoreEnabled(): boolean {
  const ex = process.env.ENABLE_DB_BACKUP_RESTORE?.trim().toLowerCase();
  if (ex === 'false' || ex === '0' || ex === 'no') return false;
  if (ex === 'true' || ex === '1' || ex === 'yes') return true;
  const url = process.env.DATABASE_URL || '';
  return (
    /127\.0\.0\.1/i.test(url) ||
    /localhost/i.test(url) ||
    /\[::1\]/i.test(url)
  );
}

export function isPgBackupAvailable(): boolean {
  return !!process.env.DATABASE_URL && isDatabaseBackupRestoreEnabled();
}

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

export async function runPgDumpToFile(outFile: string): Promise<void> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    throw new Error('DATABASE_URL is not configured.');
  }
  await fs.mkdir(path.dirname(outFile), { recursive: true });
  const { code, stderr } = await runCommand(
    'pg_dump',
    ['-Fc', '--no-owner', '--no-acl', '-f', outFile, '-d', dbUrl],
    'pg_dump'
  );
  if (code !== 0) {
    try {
      await fs.unlink(outFile);
    } catch {
      /* ignore */
    }
    const msg = stderr.trim() || `pg_dump exited with code ${code}`;
    if (msg.includes('ENOENT') || msg.toLowerCase().includes('spawn')) {
      throw new Error('pg_dump was not found. Install PostgreSQL client tools and ensure pg_dump is on PATH.');
    }
    throw new Error(msg);
  }
}

export type FullPgBackupResult = {
  path: string;
  sizeBytes: number;
};

export async function runFullPgBackupToDirectory(
  storageDir: string,
  filePrefix: string
): Promise<FullPgBackupResult> {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const fileName = `${filePrefix}-${stamp}.dump`;
  const outFile = path.join(storageDir, fileName);
  await runPgDumpToFile(outFile);
  const stat = await fs.stat(outFile);
  return { path: outFile, sizeBytes: stat.size };
}
