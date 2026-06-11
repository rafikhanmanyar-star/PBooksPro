import type pg from 'pg';
import { randomUUID } from 'crypto';
import { TenantRepository } from '../TenantRepository.js';

export class SyncQueueRepository extends TenantRepository {
  constructor(tenantId: string, client?: pg.PoolClient) {
    super(tenantId, client);
  }

  async enqueue(
    client: pg.PoolClient,
    input: {
      entityType: string;
      entityId: string;
      action: 'create' | 'update' | 'delete';
      payload: unknown;
      version?: number;
    }
  ): Promise<string> {
    const id = randomUUID();
    await client.query(
      `INSERT INTO sync_queue (
         id, tenant_id, entity_type, entity_id, action, payload_json, version, status
       ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, 'pending')`,
      [
        id,
        this.tenantId,
        input.entityType,
        input.entityId,
        input.action,
        JSON.stringify(input.payload),
        input.version ?? 1,
      ]
    );
    return id;
  }

  async listPending(client: pg.PoolClient, limit = 100): Promise<Record<string, unknown>[]> {
    const r = await client.query(
      `SELECT * FROM sync_queue
       WHERE tenant_id = $1 AND status = 'pending'
       ORDER BY created_at ASC
       LIMIT $2`,
      [this.tenantId, limit]
    );
    return r.rows as Record<string, unknown>[];
  }
}
