/**
 * Subscription event log (audit trail for billing lifecycle).
 */

import { randomUUID } from 'node:crypto';
import type pg from 'pg';

export type SubscriptionEventRow = {
  id: string;
  tenant_id: string | null;
  event_type: string;
  event_source: string;
  payload: Record<string, unknown>;
  created_at: string;
};

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

export async function logSubscriptionEvent(
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
  const { rows } = await client.query(`SELECT * FROM subscription_events WHERE id = $1`, [id]);
  const row = mapRow(rows[0]);

  try {
    const { handleSubscriptionEmailEvent } = await import('../emailAutomation/emailAutomationHooks.js');
    await handleSubscriptionEmailEvent(
      client,
      input.eventType,
      input.tenantId ?? null,
      input.payload ?? {}
    );
  } catch {
    /* email hooks must not break billing audit */
  }

  return row;
}

export async function listSubscriptionEvents(
  client: pg.PoolClient,
  tenantId: string,
  limit = 50
): Promise<SubscriptionEventRow[]> {
  const { rows } = await client.query(
    `SELECT * FROM subscription_events WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [tenantId, limit]
  );
  return rows.map(mapRow);
}
