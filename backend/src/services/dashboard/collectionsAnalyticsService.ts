import type pg from 'pg';
import { parseDateOnly, toDateOnlyString } from './dashboardMetricsHelpers.js';
import type {
  CollectionsAnalyticsFilters,
  CollectionsAnalyticsResponse,
  CollectionsKpiValue,
} from './collectionsAnalyticsTypes.js';

function monthRangeForYear(year: number) {
  const months: { key: string; label: string; from: string; to: string }[] = [];
  for (let m = 0; m < 12; m++) {
    const start = new Date(year, m, 1);
    const end = new Date(year, m + 1, 0);
    months.push({
      key: `${year}-${String(m + 1).padStart(2, '0')}`,
      label: start.toLocaleString('en-US', { month: 'short' }),
      from: toDateOnlyString(start),
      to: toDateOnlyString(end),
    });
  }
  return months;
}

function invoiceFilterSql(
  filters: CollectionsAnalyticsFilters,
  baseParamCount: number
): { sql: string; params: unknown[] } {
  const parts: string[] = [];
  const params: unknown[] = [];
  let idx = baseParamCount;
  const scope = filters.scope ?? 'all';
  if (scope === 'project') {
    parts.push(`i.invoice_type = 'Installment'`);
  } else if (scope === 'rental') {
    parts.push(`i.invoice_type IN ('Rental', 'Security Deposit', 'Service Charge')`);
  }
  if (filters.projectId) {
    params.push(filters.projectId);
    idx += 1;
    parts.push(`i.project_id = $${idx}`);
  }
  if (filters.propertyId) {
    params.push(filters.propertyId);
    idx += 1;
    parts.push(`i.property_id = $${idx}`);
  }
  return { sql: parts.length ? ` AND ${parts.join(' AND ')}` : '', params };
}

export async function getCollectionsAnalyticsJson(
  client: pg.PoolClient,
  tenantId: string,
  filters: CollectionsAnalyticsFilters
): Promise<CollectionsAnalyticsResponse> {
  const { from, to } = filters;
  const year = parseDateOnly(to).getFullYear();
  const invFilterBase = invoiceFilterSql(filters, 1);
  const invFilterRange = invoiceFilterSql(filters, 3);
  const invSqlBase = invFilterBase.sql;
  const invSqlRange = invFilterRange.sql;

  const [receivable, periodStats, overdue, invoiceCount, agingR, typeR, debtorsR] = await Promise.all([
    client.query<{ total: string }>(
      `SELECT COALESCE(SUM(GREATEST(i.amount - COALESCE(i.paid_amount, 0), 0)), 0)::text AS total
       FROM invoices i
       LEFT JOIN project_agreements pa ON pa.id = i.agreement_id AND pa.tenant_id = i.tenant_id
       WHERE i.tenant_id = $1 AND i.deleted_at IS NULL AND i.status <> 'Paid'
         AND (i.description IS NULL OR i.description NOT LIKE '%VOIDED%')
         AND (i.agreement_id IS NULL OR pa.status IS NULL OR pa.status <> 'Cancelled')
         ${invSqlBase}`,
      [tenantId, ...invFilterBase.params]
    ),
    client.query<{ due: string; collected: string }>(
      `SELECT COALESCE(SUM(i.amount), 0)::text AS due,
              COALESCE(SUM(i.paid_amount), 0)::text AS collected
       FROM invoices i
       WHERE i.tenant_id = $1 AND i.deleted_at IS NULL
         AND i.issue_date >= $2::date AND i.issue_date <= $3::date
         ${invSqlRange}`,
      [tenantId, from, to, ...invFilterRange.params]
    ),
    client.query<{ total: string }>(
      `SELECT COALESCE(SUM(GREATEST(i.amount - COALESCE(i.paid_amount, 0), 0)), 0)::text AS total
       FROM invoices i
       WHERE i.tenant_id = $1 AND i.deleted_at IS NULL AND i.status <> 'Paid'
         AND i.due_date < CURRENT_DATE
         ${invSqlBase}`,
      [tenantId, ...invFilterBase.params]
    ),
    client.query<{ c: string }>(
      `SELECT COUNT(*)::text AS c FROM invoices i
       WHERE i.tenant_id = $1 AND i.deleted_at IS NULL
         AND i.issue_date >= $2::date AND i.issue_date <= $3::date
         ${invSqlRange}`,
      [tenantId, from, to, ...invFilterRange.params]
    ),
    client.query<{ bucket: string; total: string }>(
      `SELECT bucket, COALESCE(SUM(balance), 0)::text AS total FROM (
         SELECT
           CASE
             WHEN i.due_date >= CURRENT_DATE THEN 'Current'
             WHEN CURRENT_DATE - i.due_date <= 30 THEN '30 Days'
             WHEN CURRENT_DATE - i.due_date <= 60 THEN '60 Days'
             WHEN CURRENT_DATE - i.due_date <= 90 THEN '90 Days'
             ELSE '120+ Days'
           END AS bucket,
           GREATEST(i.amount - COALESCE(i.paid_amount, 0), 0) AS balance
         FROM invoices i
         LEFT JOIN project_agreements pa ON pa.id = i.agreement_id AND pa.tenant_id = i.tenant_id
         WHERE i.tenant_id = $1 AND i.deleted_at IS NULL AND i.status <> 'Paid'
           AND (i.description IS NULL OR i.description NOT LIKE '%VOIDED%')
           AND (i.agreement_id IS NULL OR pa.status IS NULL OR pa.status <> 'Cancelled')
           ${invSqlBase}
       ) sub
       GROUP BY bucket`,
      [tenantId, ...invFilterBase.params]
    ),
    client.query<{ type_label: string; total: string }>(
      `SELECT COALESCE(i.invoice_type, 'Other') AS type_label,
              COALESCE(SUM(i.paid_amount), 0)::text AS total
       FROM invoices i
       WHERE i.tenant_id = $1 AND i.deleted_at IS NULL
         AND i.issue_date >= $2::date AND i.issue_date <= $3::date
         ${invSqlRange}
       GROUP BY i.invoice_type
       ORDER BY SUM(i.paid_amount) DESC`,
      [tenantId, from, to, ...invFilterRange.params]
    ),
    client.query<{ contact_id: string; contact_name: string; total: string }>(
      `SELECT COALESCE(i.contact_id, 'unknown') AS contact_id,
              COALESCE(c.name, 'Unknown') AS contact_name,
              SUM(GREATEST(i.amount - COALESCE(i.paid_amount, 0), 0))::text AS total
       FROM invoices i
       LEFT JOIN contacts c ON c.id = i.contact_id AND c.tenant_id = i.tenant_id
       WHERE i.tenant_id = $1 AND i.deleted_at IS NULL AND i.status <> 'Paid'
         ${invSqlBase}
       GROUP BY i.contact_id, c.name
       HAVING SUM(GREATEST(i.amount - COALESCE(i.paid_amount, 0), 0)) > 0
       ORDER BY SUM(GREATEST(i.amount - COALESCE(i.paid_amount, 0), 0)) DESC
       LIMIT 15`,
      [tenantId, ...invFilterBase.params]
    ),
  ]);

  const due = Number(periodStats.rows[0]?.due ?? 0);
  const collected = Number(periodStats.rows[0]?.collected ?? 0);
  const collectionRate = due > 0 ? (collected / due) * 100 : 0;

  const kpis: CollectionsKpiValue[] = [
    { id: 'totalReceivable', label: 'Total Receivable', value: Number(receivable.rows[0]?.total ?? 0), format: 'currency' },
    { id: 'collectedInPeriod', label: 'Collected (period)', value: collected, format: 'currency' },
    { id: 'collectionRate', label: 'Collection Rate', value: collectionRate, format: 'percent' },
    { id: 'overdueAmount', label: 'Overdue Amount', value: Number(overdue.rows[0]?.total ?? 0), format: 'currency' },
    { id: 'invoiceCount', label: 'Invoices (period)', value: Number(invoiceCount.rows[0]?.c ?? 0), format: 'count' },
    { id: 'periodDue', label: 'Invoiced (period)', value: due, format: 'currency' },
  ];

  const collectionsPerformance = await Promise.all(
    monthRangeForYear(year).map(async (m) => {
      const r = await client.query<{ due: string; collected: string }>(
        `SELECT COALESCE(SUM(i.amount), 0)::text AS due,
                COALESCE(SUM(i.paid_amount), 0)::text AS collected
         FROM invoices i
         WHERE i.tenant_id = $1 AND i.deleted_at IS NULL
           AND i.issue_date >= $2::date AND i.issue_date <= $3::date
           ${invSqlRange}`,
        [tenantId, m.from, m.to, ...invFilterRange.params]
      );
      const mDue = Number(r.rows[0]?.due ?? 0);
      const mCollected = Number(r.rows[0]?.collected ?? 0);
      return {
        month: m.key,
        label: m.label,
        due: mDue,
        collected: mCollected,
        outstanding: Math.max(0, mDue - mCollected),
      };
    })
  );

  const agingOrder = ['Current', '30 Days', '60 Days', '90 Days', '120+ Days'];
  const agingMap = new Map(agingR.rows.map((row) => [row.bucket, Number(row.total)]));
  const receivablesAging = agingOrder.map((label) => ({ label, value: agingMap.get(label) ?? 0 }));

  return {
    filters,
    generatedAt: new Date().toISOString(),
    kpis,
    collectionsPerformance,
    receivablesAging,
    invoiceTypeBreakdown: typeR.rows.map((row) => ({
      name: row.type_label,
      value: Number(row.total),
    })),
    topDebtors: debtorsR.rows.map((row) => ({
      contactId: row.contact_id,
      contactName: row.contact_name,
      outstanding: Number(row.total),
    })),
  };
}
