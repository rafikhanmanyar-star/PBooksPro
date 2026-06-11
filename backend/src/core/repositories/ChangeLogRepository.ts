import type pg from 'pg';
import { randomUUID } from 'crypto';
import { TenantRepository } from '../TenantRepository.js';

export type ChangeLogAction = 'create' | 'update' | 'delete';

export type ChangeLogRow = {
  id: string;
  tenant_id: string;
  entity_type: string;
  entity_id: string;
  action: ChangeLogAction;
  payload_json: unknown;
  version: number;
  changed_at: Date;
  changed_by: string | null;
};

export class ChangeLogRepository extends TenantRepository {
  constructor(tenantId: string, client?: pg.PoolClient) {
    super(tenantId, client);
  }

  async append(
    client: pg.PoolClient,
    input: {
      entityType: string;
      entityId: string;
      action: ChangeLogAction;
      payload?: unknown;
      version?: number;
      changedBy?: string | null;
    }
  ): Promise<string> {
    const id = randomUUID();
    await client.query(
      `INSERT INTO change_log (
         id, tenant_id, entity_type, entity_id, action, payload_json, version, changed_by
       ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)`,
      [
        id,
        this.tenantId,
        input.entityType,
        input.entityId,
        input.action,
        input.payload != null ? JSON.stringify(input.payload) : null,
        input.version ?? 1,
        input.changedBy ?? null,
      ]
    );
    return id;
  }

  async listSince(client: pg.PoolClient, since: Date): Promise<ChangeLogRow[]> {
    const r = await client.query<ChangeLogRow>(
      `SELECT id, tenant_id, entity_type, entity_id, action, payload_json, version, changed_at, changed_by
       FROM change_log
       WHERE tenant_id = $1 AND changed_at > $2
       ORDER BY changed_at ASC`,
      [this.tenantId, since]
    );
    return r.rows;
  }

  /** Phase 1 conflict resolution: last-write-wins by version + updated_at. */
  static async assertLwwVersion(
    client: pg.PoolClient,
    input: {
      tenantId: string;
      table: string;
      id: string;
      clientVersion: number;
    }
  ): Promise<{ serverVersion: number; updatedAt: string } | null> {
    const r = await client.query<{ version: number; updated_at: Date }>(
      `SELECT version, updated_at FROM ${input.table}
       WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL`,
      [input.tenantId, input.id]
    );
    const row = r.rows[0];
    if (!row) return null;
    if (input.clientVersion < row.version) {
      const err = new Error(
        `Conflict: server version ${row.version} is newer than client version ${input.clientVersion}`
      ) as Error & { code: string; serverVersion: number };
      err.code = 'SYNC_CONFLICT';
      err.serverVersion = row.version;
      throw err;
    }
    return { serverVersion: row.version, updatedAt: row.updated_at.toISOString() };
  }
}
