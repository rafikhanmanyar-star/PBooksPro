import type pg from 'pg';
import { SyncQueueRepository } from '../../../core/repositories/SyncQueueRepository.js';

export async function enqueueSyncMutation(
  client: pg.PoolClient,
  input: {
    tenantId: string;
    entityType: string;
    entityId: string;
    action: 'create' | 'update' | 'delete';
    payload: unknown;
    version?: number;
  }
): Promise<string> {
  return new SyncQueueRepository(input.tenantId).enqueue(client, input);
}

export async function listPendingSyncQueue(
  client: pg.PoolClient,
  tenantId: string,
  limit = 100
): Promise<Record<string, unknown>[]> {
  return new SyncQueueRepository(tenantId).listPending(client, limit);
}
