import type pg from 'pg';

export type TransactionLogRow = {
  id: string;
  tenant_id: string;
  timestamp: Date;
  action: string;
  entity_type: string;
  entity_id: string | null;
  description: string;
  user_id: string | null;
  user_label: string | null;
  data: unknown;
  version: number;
  created_at: Date;
  updated_at: Date;
};

export type TransactionLogFilters = {
  startDate?: string;
  endDate?: string;
  userId?: string;
  transactionId?: string;
  action?: string;
  limit?: number;
  offset?: number;
};

function parseJsonData(v: unknown): unknown {
  if (v == null) return undefined;
  if (typeof v === 'object') return v;
  if (typeof v === 'string' && v.trim()) {
    try {
      return JSON.parse(v);
    } catch {
      return v;
    }
  }
  return undefined;
}

export function rowToTransactionLogApi(row: TransactionLogRow): Record<string, unknown> {
  const data = parseJsonData(row.data);
  const ts =
    row.timestamp instanceof Date ? row.timestamp.toISOString() : String(row.timestamp);
  const createdAt =
    row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at;

  return {
    id: row.id,
    timestamp: ts,
    created_at: createdAt,
    action: row.action,
    entityType: row.entity_type,
    entity_type: row.entity_type,
    entityId: row.entity_id ?? undefined,
    entity_id: row.entity_id ?? undefined,
    description: row.description,
    userId: row.user_id ?? undefined,
    user_id: row.user_id ?? undefined,
    userLabel: row.user_label ?? undefined,
    user_label: row.user_label ?? undefined,
    user_name: row.user_label ?? undefined,
    data,
    new_values: row.action === 'DELETE' ? undefined : data,
    old_values: row.action === 'DELETE' ? data : undefined,
    version: row.version,
  };
}

const SELECT_COLS = `id, tenant_id, timestamp, action, entity_type, entity_id, description, user_id, user_label, data, version, created_at, updated_at`;

export async function listTransactionLogs(
  client: pg.PoolClient,
  tenantId: string,
  filters: TransactionLogFilters = {}
): Promise<TransactionLogRow[]> {
  const params: unknown[] = [tenantId];
  let q = `SELECT ${SELECT_COLS} FROM transaction_log WHERE tenant_id = $1`;

  if (filters.startDate) {
    params.push(filters.startDate);
    q += ` AND timestamp >= $${params.length}::timestamptz`;
  }
  if (filters.endDate) {
    params.push(filters.endDate);
    q += ` AND timestamp <= $${params.length}::timestamptz`;
  }
  if (filters.userId) {
    params.push(filters.userId);
    q += ` AND user_id = $${params.length}`;
  }
  if (filters.transactionId) {
    params.push(filters.transactionId);
    q += ` AND entity_id = $${params.length}`;
  }
  if (filters.action) {
    params.push(filters.action);
    q += ` AND action = $${params.length}`;
  }

  q += ' ORDER BY timestamp DESC, id ASC';

  const limit = Math.min(Math.max(filters.limit ?? 500, 1), 2000);
  const offset = Math.max(filters.offset ?? 0, 0);
  params.push(limit);
  q += ` LIMIT $${params.length}`;
  params.push(offset);
  q += ` OFFSET $${params.length}`;

  const r = await client.query<TransactionLogRow>(q, params);
  return r.rows;
}
