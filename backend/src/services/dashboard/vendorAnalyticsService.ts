import type pg from 'pg';
import { parseDateOnly, toDateOnlyString } from './dashboardMetricsHelpers.js';
import type {
  VendorAnalyticsFilters,
  VendorAnalyticsResponse,
  VendorKpiValue,
} from './vendorAnalyticsTypes.js';

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

function vendorFilterSql(vendorId: string | undefined, baseParamCount: number): { sql: string; params: unknown[] } {
  if (!vendorId) return { sql: '', params: [] };
  return { sql: ` AND b.vendor_id = $${baseParamCount + 1}`, params: [vendorId] };
}

export async function getVendorAnalyticsJson(
  client: pg.PoolClient,
  tenantId: string,
  filters: VendorAnalyticsFilters
): Promise<VendorAnalyticsResponse> {
  const { from, to, vendorId } = filters;
  const year = parseDateOnly(to).getFullYear();
  const rangeFilter = vendorFilterSql(vendorId, 3);
  const baseFilter = vendorFilterSql(vendorId, 1);
  const rangeParams = [tenantId, from, to, ...rangeFilter.params];
  const baseParams = [tenantId, ...baseFilter.params];

  const [vendorCount, totalPayable, periodBills, quotationCount, activeVendors, topSpend, payableRows, statusR] =
    await Promise.all([
      client.query<{ c: string }>(
        `SELECT COUNT(*)::text AS c FROM vendors WHERE tenant_id = $1 AND deleted_at IS NULL`,
        [tenantId]
      ),
      client.query<{ total: string }>(
        `SELECT COALESCE(SUM(GREATEST(b.amount - COALESCE(b.paid_amount, 0), 0)), 0)::text AS total
         FROM bills b
         WHERE b.tenant_id = $1 AND b.deleted_at IS NULL AND b.status <> 'Paid'
         ${baseFilter.sql}`,
        baseParams
      ),
      client.query<{ billed: string; paid: string; count: string }>(
        `SELECT COALESCE(SUM(b.amount), 0)::text AS billed,
                COALESCE(SUM(b.paid_amount), 0)::text AS paid,
                COUNT(*)::text AS count
         FROM bills b
         WHERE b.tenant_id = $1 AND b.deleted_at IS NULL
           AND b.issue_date >= $2::date AND b.issue_date <= $3::date
           ${rangeFilter.sql}`,
        rangeParams
      ),
      client.query<{ c: string }>(
        `SELECT COUNT(*)::text AS c FROM quotations q
         WHERE q.tenant_id = $1 AND q.deleted_at IS NULL
           AND q.date >= $2::date AND q.date <= $3::date
           ${vendorId ? ' AND q.vendor_id = $4' : ''}`,
        vendorId ? [tenantId, from, to, vendorId] : [tenantId, from, to]
      ),
      client.query<{ c: string }>(
        `SELECT COUNT(DISTINCT b.vendor_id)::text AS c FROM bills b
         WHERE b.tenant_id = $1 AND b.deleted_at IS NULL AND b.vendor_id IS NOT NULL
           AND b.issue_date >= $2::date AND b.issue_date <= $3::date
           ${rangeFilter.sql}`,
        rangeParams
      ),
      client.query<{ vendor_id: string; vendor_name: string; total: string }>(
        `SELECT COALESCE(b.vendor_id, 'unknown') AS vendor_id,
                COALESCE(v.name, 'Unknown vendor') AS vendor_name,
                SUM(b.amount)::text AS total
         FROM bills b
         LEFT JOIN vendors v ON v.id = b.vendor_id AND v.tenant_id = b.tenant_id
         WHERE b.tenant_id = $1 AND b.deleted_at IS NULL
           AND b.issue_date >= $2::date AND b.issue_date <= $3::date
           ${rangeFilter.sql}
         GROUP BY b.vendor_id, v.name
         ORDER BY SUM(b.amount) DESC
         LIMIT 15`,
        rangeParams
      ),
      client.query<{ vendor_id: string; vendor_name: string; total: string }>(
        `SELECT COALESCE(b.vendor_id, 'unknown') AS vendor_id,
                COALESCE(v.name, 'Unknown vendor') AS vendor_name,
                SUM(GREATEST(b.amount - COALESCE(b.paid_amount, 0), 0))::text AS total
         FROM bills b
         LEFT JOIN vendors v ON v.id = b.vendor_id AND v.tenant_id = b.tenant_id
         WHERE b.tenant_id = $1 AND b.deleted_at IS NULL AND b.status <> 'Paid'
           ${baseFilter.sql}
         GROUP BY b.vendor_id, v.name
         HAVING SUM(GREATEST(b.amount - COALESCE(b.paid_amount, 0), 0)) > 0
         ORDER BY SUM(GREATEST(b.amount - COALESCE(b.paid_amount, 0), 0)) DESC
         LIMIT 15`,
        baseParams
      ),
      client.query<{ status: string; total: string }>(
        `SELECT
           CASE
             WHEN b.status = 'Paid' THEN 'Paid'
             WHEN COALESCE(b.paid_amount, 0) > 0 THEN 'Partial'
             ELSE 'Unpaid'
           END AS status,
           COUNT(*)::text AS total
         FROM bills b
         WHERE b.tenant_id = $1 AND b.deleted_at IS NULL
           AND b.issue_date >= $2::date AND b.issue_date <= $3::date
           ${rangeFilter.sql}
         GROUP BY 1`,
        rangeParams
      ),
    ]);

  const kpis: VendorKpiValue[] = [
    { id: 'vendorCount', label: 'Total Vendors', value: Number(vendorCount.rows[0]?.c ?? 0), format: 'count' },
    { id: 'totalPayable', label: 'Total Payable', value: Number(totalPayable.rows[0]?.total ?? 0), format: 'currency' },
    { id: 'billsInPeriod', label: 'Bills Issued', value: Number(periodBills.rows[0]?.billed ?? 0), format: 'currency' },
    { id: 'paidInPeriod', label: 'Bills Paid', value: Number(periodBills.rows[0]?.paid ?? 0), format: 'currency' },
    { id: 'billCount', label: 'Bill Count', value: Number(periodBills.rows[0]?.count ?? 0), format: 'count' },
    { id: 'activeVendors', label: 'Active Vendors', value: Number(activeVendors.rows[0]?.c ?? 0), format: 'count' },
    { id: 'quotationCount', label: 'Quotations', value: Number(quotationCount.rows[0]?.c ?? 0), format: 'count' },
  ];

  const spendTrend = await Promise.all(
    monthRangeForYear(year).map(async (m) => {
      const r = await client.query<{ total: string }>(
        `SELECT COALESCE(SUM(b.amount), 0)::text AS total FROM bills b
         WHERE b.tenant_id = $1 AND b.deleted_at IS NULL
           AND b.issue_date >= $2::date AND b.issue_date <= $3::date
           ${rangeFilter.sql}`,
        [tenantId, m.from, m.to, ...rangeFilter.params]
      );
      return { month: m.key, label: m.label, amount: Number(r.rows[0]?.total ?? 0) };
    })
  );

  return {
    filters,
    generatedAt: new Date().toISOString(),
    kpis,
    spendTrend,
    topVendorsBySpend: topSpend.rows.map((row) => ({
      vendorId: row.vendor_id,
      vendorName: row.vendor_name,
      amount: Number(row.total),
    })),
    payableByVendor: payableRows.rows.map((row) => ({
      vendorId: row.vendor_id,
      vendorName: row.vendor_name,
      outstanding: Number(row.total),
    })),
    billStatus: statusR.rows.map((row) => ({ name: row.status, value: Number(row.total) })),
  };
}
