import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import type { SubscriptionEventRow } from '../../../services/billing/subscriptionEventService.js';

function mapRow(row: pg.QueryResultRow): SubscriptionEventRow {
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    event_type: row.event_type,
    event_source: row.event_source,
    payload:
      row.payload && typeof row.payload === 'object'
        ? (row.payload as Record<string, unknown>)
        : {},
    created_at: row.created_at,
  };
}

export class SubscriptionEventRepository {
  async insert(
    client: pg.PoolClient,
    input: {
      tenantId?: string | null;
      eventType: string;
      eventSource?: string;
      payload?: Record<string, unknown>;
    }
  ): Promise<SubscriptionEventRow> {
    const id = randomUUID();
    await client.query(
      `INSERT INTO subscription_events (id, tenant_id, event_type, event_source, payload)
       VALUES ($1, $2, $3, $4, $5::jsonb)`,
      [
        id,
        input.tenantId ?? null,
        input.eventType,
        input.eventSource ?? 'system',
        JSON.stringify(input.payload ?? {}),
      ]
    );
    const r = await client.query(`SELECT * FROM subscription_events WHERE id = $1`, [id]);
    return mapRow(r.rows[0]!);
  }

  async listForTenant(
    client: pg.PoolClient,
    tenantId: string,
    limit: number
  ): Promise<SubscriptionEventRow[]> {
    const r = await client.query(
      `SELECT * FROM subscription_events WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT $2`,
      [tenantId, limit]
    );
    return r.rows.map(mapRow);
  }
}
