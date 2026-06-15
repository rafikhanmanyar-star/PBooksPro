import type pg from 'pg';
import { randomUUID } from 'crypto';
import { RecordLockRepository } from '../repositories/RecordLockRepository.js';

const LOCK_TTL_MS = 10 * 60 * 1000;

export type RecordLockType = 'agreement' | 'invoice' | 'bill' | 'rental' | 'payroll';

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
  if (
    s === 'agreement' ||
    s === 'invoice' ||
    s === 'bill' ||
    s === 'rental' ||
    s === 'rental_agreement' ||
    s === 'payroll' ||
    s === 'payroll_run'
  ) {
    if (s === 'rental_agreement') return 'rental';
    if (s === 'payroll_run') return 'payroll';
    return s as RecordLockType;
  }
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
  await new RecordLockRepository(tenantId).pruneExpired(client);
}

export async function getActiveLock(
  client: pg.PoolClient,
  tenantId: string,
  recordType: RecordLockType,
  recordId: string
): Promise<RecordLockRow | null> {
  return new RecordLockRepository(tenantId).getActive(client, recordType, recordId);
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
  const repo = new RecordLockRepository(tenantId);
  await repo.pruneExpired(client);
  const userName = await getUserName(client, tenantId, userId);
  const existing = await repo.getActive(client, recordType, recordId);

  if (existing) {
    if (existing.locked_by === userId) {
      const exp = new Date(Date.now() + LOCK_TTL_MS);
      await repo.refreshHolder(client, recordType, recordId, userName, exp);
      return { locked: false, success: true, expiresAt: exp.toISOString(), lockedBy: userName };
    }
    return {
      locked: true,
      lockedBy: existing.locked_by_name,
      lockedByUserId: existing.locked_by,
    };
  }

  const expiresAt = new Date(Date.now() + LOCK_TTL_MS);
  await repo.insertLock(client, randomUUID(), recordType, recordId, userId, userName, expiresAt);
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
  const ok = await new RecordLockRepository(tenantId).refreshOwned(
    client,
    recordType,
    recordId,
    userId,
    userName,
    exp
  );
  if (!ok) return { success: false };
  return { success: true, expiresAt: exp.toISOString(), lockedBy: userName };
}

export async function releaseLock(
  client: pg.PoolClient,
  tenantId: string,
  userId: string,
  recordType: RecordLockType,
  recordId: string
): Promise<boolean> {
  return new RecordLockRepository(tenantId).releaseOwned(client, recordType, recordId, userId);
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
  const repo = new RecordLockRepository(tenantId);
  await repo.pruneExpired(client);
  const userName = await getUserName(client, tenantId, userId);
  const prev = await repo.getByRecord(client, recordType, recordId);
  const prevName = prev && prev.expires_at >= new Date() ? prev.locked_by_name : null;
  const prevId = prev && prev.expires_at >= new Date() ? prev.locked_by : null;

  const expiresAt = new Date(Date.now() + LOCK_TTL_MS);
  if (prev) {
    await repo.forceTakeover(client, recordType, recordId, userId, userName, expiresAt);
  } else {
    await repo.insertLock(client, randomUUID(), recordType, recordId, userId, userName, expiresAt);
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
  const msg = `User ${actorName} forcefully took over lock from ${previousName ?? previousUserId ?? 'unknown'}`;
  await new RecordLockRepository(tenantId).insertForceTakeoverAudit(
    client,
    randomUUID(),
    actorUserId,
    recordType,
    recordId,
    previousName ?? previousUserId ?? '',
    msg
  );
}
