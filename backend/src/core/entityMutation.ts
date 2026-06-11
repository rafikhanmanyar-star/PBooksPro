import type pg from 'pg';
import { assertLwwVersion } from '../services/changeLogService.js';
import {
  recordDomainMutation,
  type DomainMutationInput,
} from './recordDomainMutation.js';

export type VersionedMutationInput = DomainMutationInput & {
  /** When set with clientVersion, enforces LWW before mutation side-effects. */
  table?: string;
  clientVersion?: number;
};

export function isSyncConflictError(e: unknown): e is Error & { code: 'SYNC_CONFLICT'; serverVersion?: number } {
  return e instanceof Error && (e as Error & { code?: string }).code === 'SYNC_CONFLICT';
}

/**
 * Architecture v2 — call **before** UPDATE/upsert when the client supplies `version`.
 * Rejects when client version is older than the server row (SYNC_CONFLICT).
 */
export async function assertEntityLwwBeforeWrite(
  client: pg.PoolClient,
  input: {
    tenantId: string;
    table: string;
    entityId: string;
    clientVersion: number;
  }
): Promise<void> {
  const result = await assertLwwVersion(client, {
    tenantId: input.tenantId,
    table: input.table,
    id: input.entityId,
    clientVersion: input.clientVersion,
  });
  if (!result) {
    const err = new Error('Record not found for version check') as Error & { code: string };
    err.code = 'NOT_FOUND';
    throw err;
  }
}

/** Returns `{ conflict: true }` when LWW rejects a stale client version. */
export async function checkEntityLwwConflict(
  client: pg.PoolClient,
  input: {
    tenantId: string;
    table: string;
    entityId: string;
    clientVersion: number | undefined;
  }
): Promise<{ conflict: boolean }> {
  if (input.clientVersion == null) return { conflict: false };
  try {
    await assertEntityLwwBeforeWrite(client, {
      tenantId: input.tenantId,
      table: input.table,
      entityId: input.entityId,
      clientVersion: input.clientVersion,
    });
    return { conflict: false };
  } catch (e) {
    if (isSyncConflictError(e)) return { conflict: true };
    throw e;
  }
}

/**
 * Post-mutation audit + change_log. LWW must be checked separately before the write.
 */
export async function completeEntityMutation(
  client: pg.PoolClient,
  input: VersionedMutationInput
): Promise<void> {
  await recordDomainMutation(client, input);
}

export { recordDomainMutation } from './recordDomainMutation.js';
