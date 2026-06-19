import type pg from 'pg';

/**
 * Read-only sync diagnostics (A4.5). Does not modify sync queue or realtime hub.
 */
export type SyncDiagnosticsSnapshot = {
  generatedAt: string;
  queue: {
    pending: number;
    processing: number;
    completed24h: number;
    failed: number;
    retried24h: number;
  };
  recentFailed: Array<{
    id: string;
    tenantId: string;
    entityType: string;
    entityId: string;
    action: string;
    attempts: number;
    lastError: string | null;
    createdAt: string;
  }>;
  recentPending: Array<{
    id: string;
    tenantId: string;
    entityType: string;
    entityId: string;
    action: string;
    attempts: number;
    createdAt: string;
  }>;
  changeLog: {
    eventsLast24h: number;
  };
};

export async function getSyncDiagnostics(client: pg.PoolClient): Promise<SyncDiagnosticsSnapshot> {
  const counts = await client.query<{
    status: string;
    c: string;
  }>(
    `SELECT status, COUNT(*)::text AS c FROM sync_queue GROUP BY status`
  );

  const byStatus: Record<string, number> = {};
  for (const row of counts.rows) {
    byStatus[row.status] = Number(row.c);
  }

  const retried = await client.query<{ c: string }>(
    `SELECT COUNT(*)::text AS c FROM sync_queue
     WHERE attempts > 1 AND created_at > NOW() - INTERVAL '24 hours'`
  );

  const completed24h = await client.query<{ c: string }>(
    `SELECT COUNT(*)::text AS c FROM sync_queue
     WHERE status = 'completed' AND processed_at > NOW() - INTERVAL '24 hours'`
  );

  const failedRows = await client.query<{
    id: string;
    tenant_id: string;
    entity_type: string;
    entity_id: string;
    action: string;
    attempts: number;
    last_error: string | null;
    created_at: Date;
  }>(
    `SELECT id, tenant_id, entity_type, entity_id, action, attempts, last_error, created_at
     FROM sync_queue
     WHERE status = 'failed'
     ORDER BY created_at DESC
     LIMIT 25`
  );

  const pendingRows = await client.query<{
    id: string;
    tenant_id: string;
    entity_type: string;
    entity_id: string;
    action: string;
    attempts: number;
    created_at: Date;
  }>(
    `SELECT id, tenant_id, entity_type, entity_id, action, attempts, created_at
     FROM sync_queue
     WHERE status IN ('pending', 'processing')
     ORDER BY created_at ASC
     LIMIT 25`
  );

  const changeLogCount = await client.query<{ c: string }>(
    `SELECT COUNT(*)::text AS c FROM change_log
     WHERE changed_at > NOW() - INTERVAL '24 hours'`
  );

  return {
    generatedAt: new Date().toISOString(),
    queue: {
      pending: byStatus.pending ?? 0,
      processing: byStatus.processing ?? 0,
      completed24h: Number(completed24h.rows[0]?.c ?? 0),
      failed: byStatus.failed ?? 0,
      retried24h: Number(retried.rows[0]?.c ?? 0),
    },
    recentFailed: failedRows.rows.map((r) => ({
      id: r.id,
      tenantId: r.tenant_id,
      entityType: r.entity_type,
      entityId: r.entity_id,
      action: r.action,
      attempts: r.attempts,
      lastError: r.last_error,
      createdAt: r.created_at.toISOString(),
    })),
    recentPending: pendingRows.rows.map((r) => ({
      id: r.id,
      tenantId: r.tenant_id,
      entityType: r.entity_type,
      entityId: r.entity_id,
      action: r.action,
      attempts: r.attempts,
      createdAt: r.created_at.toISOString(),
    })),
    changeLog: {
      eventsLast24h: Number(changeLogCount.rows[0]?.c ?? 0),
    },
  };
}
