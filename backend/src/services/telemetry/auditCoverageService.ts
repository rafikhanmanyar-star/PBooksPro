import type pg from 'pg';

/** Expected audited mutation modules (compliance monitoring — read-only). */
const EXPECTED_AUDITED_MODULES = [
  'journal',
  'transactions',
  'invoices',
  'bills',
  'payroll',
  'accounts',
  'accounting_periods',
  'auth',
  'users',
  'rbac',
  'backups',
  'billing',
  'privacy',
] as const;

const EXPECTED_ACTIONS = ['create', 'edit', 'delete', 'post', 'reverse', 'approve'] as const;

export type AuditCoverageReport = {
  generatedAt: string;
  windowDays: number;
  eventsInWindow: number;
  byModule: Record<string, number>;
  byAction: Record<string, number>;
  gaps: Array<{ type: 'module' | 'action'; id: string; note: string }>;
  recentSamples: Array<{
    id: string;
    module: string;
    action: string;
    entityType: string | null;
    summary: string | null;
    occurredAt: string;
  }>;
};

export async function getAuditCoverageReport(
  client: pg.PoolClient,
  windowDays = 30
): Promise<AuditCoverageReport> {
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60_000);

  const [moduleRows, actionRows, totalRow, samples] = await Promise.all([
    client.query<{ module: string; c: string }>(
      `SELECT module, COUNT(*)::text AS c FROM audit_events
       WHERE occurred_at >= $1 GROUP BY module ORDER BY COUNT(*) DESC`,
      [since]
    ),
    client.query<{ action: string; c: string }>(
      `SELECT action, COUNT(*)::text AS c FROM audit_events
       WHERE occurred_at >= $1 GROUP BY action ORDER BY COUNT(*) DESC`,
      [since]
    ),
    client.query<{ c: string }>(
      `SELECT COUNT(*)::text AS c FROM audit_events WHERE occurred_at >= $1`,
      [since]
    ),
    client.query<{
      id: string;
      module: string;
      action: string;
      entity_type: string | null;
      summary: string | null;
      occurred_at: Date;
    }>(
      `SELECT id, module, action, entity_type, summary, occurred_at
       FROM audit_events
       WHERE occurred_at >= $1
       ORDER BY occurred_at DESC
       LIMIT 30`,
      [since]
    ),
  ]);

  const byModule: Record<string, number> = {};
  for (const r of moduleRows.rows) {
    byModule[r.module] = Number(r.c);
  }

  const byAction: Record<string, number> = {};
  for (const r of actionRows.rows) {
    byAction[r.action] = Number(r.c);
  }

  const gaps: AuditCoverageReport['gaps'] = [];
  for (const mod of EXPECTED_AUDITED_MODULES) {
    if (!byModule[mod]) {
      gaps.push({
        type: 'module',
        id: mod,
        note: `No audit events for module "${mod}" in the last ${windowDays} days (may be inactive tenant).`,
      });
    }
  }
  for (const action of EXPECTED_ACTIONS) {
    if (!byAction[action]) {
      gaps.push({
        type: 'action',
        id: action,
        note: `No "${action}" audit events in the last ${windowDays} days.`,
      });
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    windowDays,
    eventsInWindow: Number(totalRow.rows[0]?.c ?? 0),
    byModule,
    byAction,
    gaps,
    recentSamples: samples.rows.map((r) => ({
      id: r.id,
      module: r.module,
      action: r.action,
      entityType: r.entity_type,
      summary: r.summary,
      occurredAt: r.occurred_at.toISOString(),
    })),
  };
}
