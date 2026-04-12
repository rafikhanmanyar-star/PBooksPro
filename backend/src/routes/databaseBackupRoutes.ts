/**
 * Full PostgreSQL database backup (pg_dump) and restore (pg_restore).
 * Admin-only. Off by default on remote hosts unless ENABLE_DB_BACKUP_RESTORE=true.
 *
 * Requires PostgreSQL client tools (pg_dump, pg_restore) on the server PATH.
 */

import type { NextFunction, Response } from 'express';
import { Router } from 'express';
import { spawn } from 'node:child_process';
import { createReadStream, createWriteStream } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import pg from 'pg';
import type { AuthedRequest } from '../middleware/authMiddleware.js';
import { requireOrgUserAdmin } from '../middleware/authMiddleware.js';
import { closePool } from '../db/pool.js';
import { sendFailure, sendSuccess, handleRouteError } from '../utils/apiResponse.js';

export const databaseBackupRouter = Router();

function isDatabaseBackupRestoreEnabled(): boolean {
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

function requireBackupEnabled(_req: AuthedRequest, res: Response, next: NextFunction): void {
  if (!process.env.DATABASE_URL) {
    sendFailure(res, 503, 'DB_NOT_CONFIGURED', 'DATABASE_URL is not configured on the server.');
    return;
  }
  if (!isDatabaseBackupRestoreEnabled()) {
    sendFailure(
      res,
      403,
      'BACKUP_DISABLED',
      'Database backup/restore is disabled for this server. Set ENABLE_DB_BACKUP_RESTORE=true in the API server environment, or use a localhost PostgreSQL URL.'
    );
    return;
  }
  next();
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

async function runPgDumpToFile(outFile: string): Promise<void> {
  const dbUrl = process.env.DATABASE_URL!;
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
    throw new Error(stderr.trim() || `pg_dump exited with code ${code}`);
  }
}

async function terminateOtherDbSessions(connectionString: string): Promise<void> {
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

async function runPgRestore(dumpPath: string): Promise<void> {
  const dbUrl = process.env.DATABASE_URL!;
  const { code, stderr } = await runCommand(
    'pg_restore',
    ['--clean', '--if-exists', '--no-owner', '--no-acl', '-d', dbUrl, dumpPath],
    'pg_restore'
  );
  // pg_restore: 0 = ok, 1 = warnings, 2 = errors
  if (code === 2 || code === null) {
    throw new Error(stderr.trim() || `pg_restore exited with code ${code}`);
  }
}

/** Any admin: whether backup API is allowed (for Settings UI). */
databaseBackupRouter.get('/database/backup/capabilities', requireOrgUserAdmin, (_req: AuthedRequest, res) => {
  const hasUrl = !!process.env.DATABASE_URL;
  const enabled = hasUrl && isDatabaseBackupRestoreEnabled();
  sendSuccess(res, {
    backupRestoreEnabled: enabled,
    format: 'custom',
    fileExtension: '.dump',
    hint: enabled
      ? 'Backup downloads a pg_dump custom-format file. Restore replaces the entire PostgreSQL database used by this API server.'
      : hasUrl
        ? 'Set ENABLE_DB_BACKUP_RESTORE=true in the API server environment to allow backup/restore when not using localhost.'
        : 'DATABASE_URL is not set on the API server.',
  });
});

databaseBackupRouter.get(
  '/database/backup',
  requireOrgUserAdmin,
  requireBackupEnabled,
  async (_req: AuthedRequest, res: Response) => {
    const tmp = path.join(os.tmpdir(), `pbooks-backup-${Date.now()}.dump`);
    try {
      await runPgDumpToFile(tmp);
      const stat = await fs.stat(tmp);
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const filename = `pbooks-full-backup-${stamp}.dump`;
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Length', String(stat.size));

      await pipeline(createReadStream(tmp), res);
    } catch (e) {
      if (!res.headersSent) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes('ENOENT') || msg.toLowerCase().includes('spawn')) {
          sendFailure(
            res,
            503,
            'PG_TOOLS_MISSING',
            'pg_dump was not found. Install PostgreSQL client tools and ensure pg_dump is on the server PATH.'
          );
        } else {
          handleRouteError(res, e, { route: 'GET /database/backup' });
        }
      }
    } finally {
      try {
        await fs.unlink(tmp);
      } catch {
        /* ignore */
      }
    }
  }
);

databaseBackupRouter.post(
  '/database/restore',
  requireOrgUserAdmin,
  requireBackupEnabled,
  async (req: AuthedRequest, res: Response) => {
    const tmp = path.join(os.tmpdir(), `pbooks-restore-${Date.now()}.dump`);
    try {
      await pipeline(req, createWriteStream(tmp));

      const st = await fs.stat(tmp);
      if (st.size < 64) {
        sendFailure(res, 400, 'INVALID_FILE', 'Backup file is empty or too small.');
        return;
      }

      const dbUrl = process.env.DATABASE_URL!;

      await closePool();
      try {
        await terminateOtherDbSessions(dbUrl);
      } catch (e) {
        console.warn('[database/restore] terminateOtherDbSessions:', e);
      }

      await runPgRestore(tmp);

      sendSuccess(res, {
        ok: true,
        message: 'Database restored. Reload the application to reconnect.',
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('ENOENT') || msg.toLowerCase().includes('spawn')) {
        sendFailure(
          res,
          503,
          'PG_TOOLS_MISSING',
          'pg_restore was not found. Install PostgreSQL client tools and ensure pg_restore is on the server PATH.'
        );
        return;
      }
      handleRouteError(res, e, { route: 'POST /database/restore' });
    } finally {
      try {
        await fs.unlink(tmp);
      } catch {
        /* ignore */
      }
    }
  }
);
