import type pg from 'pg';
import { randomUUID } from 'crypto';

const LOCK_TTL_MS = 10 * 60 * 1000;

export type RecordLockType = 'agreement' | 'invoice';

export type RecordLockRow = {
  id: string;
  tenant_id: string;
  record_type: string;
  record_id: string;
  locked_by: string;
  locked_by_name: string;
  locked_at: Date;
  expires_at: Date;
};

function normalizeRecordType(v: unknown): RecordLockType | null {
  const s = typeof v === 'string' ? v.trim().toLowerCase() : '';
  if (s === 'agreement' || s === 'invoice') return s;
  return null;
}

export function parseRecordType(v: unknown): RecordLockType | null {
  return normalizeRecordType(v);
}

async function getUserName(client: pg.PoolClient, tenantId: string, userId: string): Promise<string> {
  const r = await client.query<{ name: string }>(
    `SELECT name FROM users WHERE id = $1 AND tenant_id = $2`,
    [userId, tenantId]
  );
  return r.rows[0]?.name?.trim() || userId;
}

/** Remove expired locks (best-effort; queries also treat expiry as unlocked). */
export async function pruneExpiredLocks(client: pg.PoolClient, tenantId: string): Promise<void> {
  await client.query(`DELETE FROM record_locks WHERE tenant_id = $1 AND expires_at < NOW()`, [tenantId]);
}

export async function getActiveLock(
  client: pg.PoolClient,
  tenantId: string,
  recordType: RecordLockType,
  recordId: string
): Promise<RecordLockRow | null> {
  const r = await client.query<RecordLockRow>(
    `SELECT id, tenant_id, record_type, record_id, locked_by, locked_by_name, locked_at, expires_at
     FROM record_locks
     WHERE tenant_id = $1 AND record_type = $2 AND record_id = $3 AND expires_at >= NOW()`,
    [tenantId, recordType, recordId]
  );
  return r.rows[0] ?? null;
}

export type AcquireResult =
  | { locked: true; lockedBy: string; lockedByUserId: string }
  | { locked: false; success: true; expiresAt: string; lockedBy: string };

export async function acquireLock(
  client: pg.PoolClient,
  tenantId: string,
  userId: string,
  recordType: RecordLockType,
  recordId: string
): Promise<AcquireResult> {
  await pruneExpiredLocks(client, tenantId);
  const userName = await getUserName(client, tenantId, userId);
  const existing = await getActiveLock(client, tenantId, recordType, recordId);

  if (existing) {
    if (existing.locked_by === userId) {
      const exp = new Date(Date.now() + LOCK_TTL_MS);
      await client.query(
        `UPDATE record_locks SET locked_by_name = $4, expires_at = $5, locked_at = NOW()
         WHERE tenant_id = $1 AND record_type = $2 AND record_id = $3`,
        [tenantId, recordType, recordId, userName, exp]
      );
      return { locked: false, success: true, expiresAt: exp.toISOString(), lockedBy: userName };
    }
    return {
      locked: true,
      lockedBy: existing.locked_by_name,
      lockedByUserId: existing.locked_by,
    };
  }

  const id = randomUUID();
  const expiresAt = new Date(Date.now() + LOCK_TTL_MS);
  await client.query(
    `INSERT INTO record_locks (id, tenant_id, record_type, record_id, locked_by, locked_by_name, locked_at, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7)`,
    [id, tenantId, recordType, recordId, userId, userName, expiresAt]
  );
  return { locked: false, success: true, expiresAt: expiresAt.toISOString(), lockedBy: userName };
}

export async function refreshLock(
  client: pg.PoolClient,
  tenantId: string,
  userId: string,
  recordType: RecordLockType,
  recordId: string
): Promise<{ success: boolean; expiresAt?: string; lockedBy?: string }> {
  const userName = await getUserName(client, tenantId, userId);
  const exp = new Date(Date.now() + LOCK_TTL_MS);
  const r = await client.query(
    `UPDATE record_locks
     SET expires_at = $5, locked_by_name = $6, locked_at = NOW()
     WHERE tenant_id = $1 AND record_type = $2 AND record_id = $3 AND locked_by = $4`,
    [tenantId, recordType, recordId, userId, exp, userName]
  );
  if (r.rowCount === 0) return { success: false };
  return { success: true, expiresAt: exp.toISOString(), lockedBy: userName };
}

export async function releaseLock(
  client: pg.PoolClient,
  tenantId: string,
  userId: string,
  recordType: RecordLockType,
  recordId: string
): Promise<boolean> {
  const r = await client.query(
    `DELETE FROM record_locks
     WHERE tenant_id = $1 AND record_type = $2 AND record_id = $3 AND locked_by = $4`,
    [tenantId, recordType, recordId, userId]
  );
  return (r.rowCount ?? 0) > 0;
}

export type ForceResult = {
  expiresAt: string;
  previousHolderName: string | null;
  previousHolderId: string | null;
  lockedBy: string;
};

export async function forceLock(
  client: pg.PoolClient,
  tenantId: string,
  userId: string,
  recordType: RecordLockType,
  recordId: string
): Promise<ForceResult> {
  await pruneExpiredLocks(client, tenantId);
  const userName = await getUserName(client, tenantId, userId);
  const existing = await client.query<RecordLockRow>(
    `SELECT id, tenant_id, record_type, record_id, locked_by, locked_by_name, locked_at, expires_at
     FROM record_locks WHERE tenant_id = $1 AND record_type = $2 AND record_id = $3`,
    [tenantId, recordType, recordId]
  );
  const prev = existing.rows[0];
  const prevName = prev && prev.expires_at >= new Date() ? prev.locked_by_name : null;
  const prevId = prev && prev.expires_at >= new Date() ? prev.locked_by : null;

  const expiresAt = new Date(Date.now() + LOCK_TTL_MS);
  if (prev) {
    await client.query(
      `UPDATE record_locks SET locked_by = $4, locked_by_name = $5, locked_at = NOW(), expires_at = $6
       WHERE tenant_id = $1 AND record_type = $2 AND record_id = $3`,
      [tenantId, recordType, recordId, userId, userName, expiresAt]
    );
  } else {
    const id = randomUUID();
    await client.query(
      `INSERT INTO record_locks (id, tenant_id, record_type, record_id, locked_by, locked_by_name, locked_at, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7)`,
      [id, tenantId, recordType, recordId, userId, userName, expiresAt]
    );
  }

  return {
    expiresAt: expiresAt.toISOString(),
    previousHolderName: prevName,
    previousHolderId: prevId,
    lockedBy: userName,
  };
}

/**
 * Block save when another user holds a non-expired lock.
 * Returns null if save is allowed; otherwise an error message.
 */
export async function assertLockAllowsSave(
  client: pg.PoolClient,
  tenantId: string,
  recordType: RecordLockType,
  recordId: string,
  currentUserId: string
): Promise<string | null> {
  const row = await getActiveLock(client, tenantId, recordType, recordId);
  if (!row) return null;
  if (row.locked_by === currentUserId) return null;
  return 'Record modified by another user. Please refresh.';
}

export class LockGuardError extends Error {
  readonly code = 'LOCK_HELD' as const;
  constructor(message: string) {
    super(message);
    this.name = 'LockGuardError';
  }
}

/** Throws LockGuardError when another user holds an active lock. */
export async function enforceLockForSave(
  client: pg.PoolClient,
  tenantId: string,
  recordType: RecordLockType,
  recordId: string,
  currentUserId: string | null | undefined
): Promise<void> {
  if (!currentUserId) return;
  const msg = await assertLockAllowsSave(client, tenantId, recordType, recordId, currentUserId);
  if (msg) throw new LockGuardError(msg);
}

export async function logLockForceTakeover(
  client: pg.PoolClient,
  tenantId: string,
  actorUserId: string,
  actorName: string,
  recordType: RecordLockType,
  recordId: string,
  previousUserId: string | null,
  previousName: string | null
): Promise<void> {
  const id = randomUUID();
  const msg = `User ${actorName} forcefully took over lock from ${previousName ?? previousUserId ?? 'unknown'}`;
  await client.query(
    `INSERT INTO accounting_audit_log (id, tenant_id, entity_type, entity_id, action, user_id, old_value, new_value)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      id,
      tenantId,
      'record_lock',
      `${recordType}:${recordId}`,
      'force_takeover',
      actorUserId,
      previousName ?? previousUserId ?? '',
      msg,
    ]
  );
}
