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

/**
 * Architecture v2 — LWW check (optional) + audit_events + change_log (+ optional sync_queue).
 */
export async function completeEntityMutation(
  client: pg.PoolClient,
  input: VersionedMutationInput
): Promise<void> {
  if (input.table && input.clientVersion != null && input.entityId) {
    const conflict = await assertLwwVersion(client, {
      tenantId: input.tenantId,
      table: input.table,
      id: input.entityId,
      clientVersion: input.clientVersion,
    });
    if (!conflict) {
      const err = new Error('Record not found for version check') as Error & { code: string };
      err.code = 'NOT_FOUND';
      throw err;
    }
  }
  await recordDomainMutation(client, input);
}

export { recordDomainMutation } from './recordDomainMutation.js';
