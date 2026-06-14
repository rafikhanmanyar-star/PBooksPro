import type pg from 'pg';
import { parseDateOnly, toDateOnlyString } from './dashboardMetricsHelpers.js';
import type {
  AgreementStatusSlice,
  SellingAnalyticsFilters,
  SellingAnalyticsResponse,
  SellingKpiValue,
  TopProjectRow,
  UnitPipelineSlice,
} from './sellingAnalyticsTypes.js';

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

function projectFilterSql(
  column: string,
  projectId: string | undefined,
  baseParamCount: number
): { sql: string; params: unknown[] } {
  if (!projectId) return { sql: '', params: [] };
  return { sql: ` AND ${column} = $${baseParamCount + 1}`, params: [projectId] };
}

async function buildUnitPipeline(
  client: pg.PoolClient,
  tenantId: string,
  projectId?: string
): Promise<UnitPipelineSlice[]> {
  const params: unknown[] = [tenantId];
  const projectSql = projectFilterSql('u.project_id', projectId, params.length);
  params.push(...projectSql.params);

  const [available, sold, reserved] = await Promise.all([
    client.query<{ c: string }>(
      `SELECT COUNT(*)::text AS c FROM units u
       WHERE u.tenant_id = $1 AND u.deleted_at IS NULL AND u.status = 'available'${projectSql.sql}`,
      params
    ),
    client.query<{ c: string }>(
      `SELECT COUNT(*)::text AS c FROM units u
       WHERE u.tenant_id = $1 AND u.deleted_at IS NULL AND u.status = 'sold'${projectSql.sql}`,
      params
    ),
    client.query<{ c: string }>(
      `SELECT COUNT(DISTINCT pau.unit_id)::text AS c
       FROM project_agreement_units pau
       INNER JOIN project_agreements pa ON pa.id = pau.agreement_id AND pa.tenant_id = $1
       INNER JOIN units u ON u.id = pau.unit_id AND u.tenant_id = pa.tenant_id
       WHERE pa.deleted_at IS NULL
         AND pa.status NOT IN ('Cancelled', 'Completed')
         AND u.deleted_at IS NULL
         AND u.status <> 'sold'
         ${projectId ? ' AND pa.project_id = $2' : ''}`,
      projectId ? [tenantId, projectId] : [tenantId]
    ),
  ]);

  return [
    { name: 'Available', value: Number(available.rows[0]?.c ?? 0) },
    { name: 'Reserved', value: Number(reserved.rows[0]?.c ?? 0) },
    { name: 'Sold', value: Number(sold.rows[0]?.c ?? 0) },
  ];
}

export async function getSellingAnalyticsJson(
  client: pg.PoolClient,
  tenantId: string,
  filters: SellingAnalyticsFilters
): Promise<SellingAnalyticsResponse> {
  const { from, to, projectId } = filters;
  const year = parseDateOnly(to).getFullYear();

  const paFilter = projectFilterSql('pa.project_id', projectId, 3);
  const paBaseParams: unknown[] = [tenantId, from, to, ...paFilter.params];
  const paScope = paFilter.sql;

  const paAllFilter = projectFilterSql('pa.project_id', projectId, 1);
  const paAllParams: unknown[] = [tenantId, ...paAllFilter.params];
  const paAllScope = paAllFilter.sql;

  const invFilter = projectFilterSql('pa.project_id', projectId, 3);
  const invBaseParams: unknown[] = [tenantId, from, to, ...invFilter.params];
  const invScope = invFilter.sql;

  const invAllFilter = projectFilterSql('pa.project_id', projectId, 1);
  const invAllParams: unknown[] = [tenantId, ...invAllFilter.params];
  const invAllScope = invAllFilter.sql;

  const ipFilter = projectFilterSql('ip.project_id', projectId, 3);
  const ipBaseParams: unknown[] = [tenantId, from, to, ...ipFilter.params];
  const ipScope = ipFilter.sql;

  const unitParams: unknown[] = [tenantId];
  const unitProjectSql = projectFilterSql('u.project_id', projectId, unitParams.length);
  unitParams.push(...unitProjectSql.params);

  const [
    periodSales,
    agreementCount,
    unitsSold,
    unitsAvailable,
    periodCollections,
    receivable,
    marketingPlans,
    salesReturns,
    agreementStatusR,
    topProjectsR,
    unitPipeline,
  ] = await Promise.all([
    client.query<{ total: string }>(
      `SELECT COALESCE(SUM(pa.selling_price), 0)::text AS total
       FROM project_agreements pa
       WHERE pa.tenant_id = $1 AND pa.deleted_at IS NULL
         AND pa.status <> 'Cancelled'
         AND pa.issue_date >= $2::date AND pa.issue_date <= $3::date
         ${paScope}`,
      paBaseParams
    ),
    client.query<{ c: string }>(
      `SELECT COUNT(*)::text AS c
       FROM project_agreements pa
       WHERE pa.tenant_id = $1 AND pa.deleted_at IS NULL
         AND pa.status <> 'Cancelled'
         AND pa.issue_date >= $2::date AND pa.issue_date <= $3::date
         ${paScope}`,
      paBaseParams
    ),
    client.query<{ c: string }>(
      `SELECT COUNT(*)::text AS c FROM units u
       WHERE u.tenant_id = $1 AND u.deleted_at IS NULL AND u.status = 'sold'
         ${unitProjectSql.sql}`,
      unitParams
    ),
    client.query<{ c: string }>(
      `SELECT COUNT(*)::text AS c FROM units u
       WHERE u.tenant_id = $1 AND u.deleted_at IS NULL AND u.status = 'available'
         ${unitProjectSql.sql}`,
      unitParams
    ),
    client.query<{ collected: string; invoiced: string }>(
      `SELECT COALESCE(SUM(i.paid_amount), 0)::text AS collected,
              COALESCE(SUM(i.amount), 0)::text AS invoiced
       FROM invoices i
       LEFT JOIN project_agreements pa ON pa.id = i.agreement_id AND pa.tenant_id = i.tenant_id
       WHERE i.tenant_id = $1 AND i.deleted_at IS NULL
         AND i.agreement_id IS NOT NULL
         AND (i.description IS NULL OR i.description NOT LIKE '%VOIDED%')
         AND (pa.status IS NULL OR pa.status <> 'Cancelled')
         AND i.issue_date >= $2::date AND i.issue_date <= $3::date
         ${invScope}`,
      invBaseParams
    ),
    client.query<{ total: string }>(
      `SELECT COALESCE(SUM(GREATEST(i.amount - COALESCE(i.paid_amount, 0), 0)), 0)::text AS total
       FROM invoices i
       LEFT JOIN project_agreements pa ON pa.id = i.agreement_id AND pa.tenant_id = i.tenant_id
       WHERE i.tenant_id = $1 AND i.deleted_at IS NULL AND i.status <> 'Paid'
         AND i.agreement_id IS NOT NULL
         AND (i.description IS NULL OR i.description NOT LIKE '%VOIDED%')
         AND (pa.status IS NULL OR pa.status <> 'Cancelled')
         ${invAllScope}`,
      invAllParams
    ),
    client.query<{ c: string }>(
      `SELECT COUNT(*)::text AS c
       FROM installment_plans ip
       WHERE ip.tenant_id = $1 AND ip.deleted_at IS NULL
         AND ip.created_at >= $2::date AND ip.created_at <= ($3::date + INTERVAL '1 day')
         ${ipScope}`,
      ipBaseParams
    ),
    client.query<{ c: string; refunds: string }>(
      `SELECT COUNT(*)::text AS c, COALESCE(SUM(sr.refund_amount), 0)::text AS refunds
       FROM sales_returns sr
       INNER JOIN project_agreements pa ON pa.id = sr.agreement_id AND pa.tenant_id = sr.tenant_id
       WHERE sr.tenant_id = $1 AND sr.deleted_at IS NULL
         AND sr.return_date >= $2::date AND sr.return_date <= $3::date
         ${paScope}`,
      paBaseParams
    ),
    client.query<{ status: string; c: string }>(
      `SELECT COALESCE(pa.status, 'Unknown') AS status, COUNT(*)::text AS c
       FROM project_agreements pa
       WHERE pa.tenant_id = $1 AND pa.deleted_at IS NULL
         ${paAllScope}
       GROUP BY pa.status
       ORDER BY COUNT(*) DESC`,
      paAllParams
    ),
    projectId
      ? Promise.resolve({ rows: [] as { project_id: string; project_name: string; total: string }[] })
      : client.query<{ project_id: string; project_name: string; total: string }>(
          `SELECT pa.project_id,
                  COALESCE(p.name, 'Unknown') AS project_name,
                  SUM(pa.selling_price)::text AS total
           FROM project_agreements pa
           LEFT JOIN projects p ON p.id = pa.project_id AND p.tenant_id = pa.tenant_id
           WHERE pa.tenant_id = $1 AND pa.deleted_at IS NULL
             AND pa.status <> 'Cancelled'
             AND pa.issue_date >= $2::date AND pa.issue_date <= $3::date
           GROUP BY pa.project_id, p.name
           ORDER BY SUM(pa.selling_price) DESC
           LIMIT 10`,
          [tenantId, from, to]
        ),
    buildUnitPipeline(client, tenantId, projectId),
  ]);

  const collected = Number(periodCollections.rows[0]?.collected ?? 0);
  const invoiced = Number(periodCollections.rows[0]?.invoiced ?? 0);
  const collectionRate = invoiced > 0 ? (collected / invoiced) * 100 : 0;

  const kpis: SellingKpiValue[] = [
    {
      id: 'totalSalesValue',
      label: 'Sales Value (period)',
      value: Number(periodSales.rows[0]?.total ?? 0),
      format: 'currency',
    },
    {
      id: 'agreementsSigned',
      label: 'Agreements Signed',
      value: Number(agreementCount.rows[0]?.c ?? 0),
      format: 'count',
    },
    { id: 'unitsSold', label: 'Units Sold', value: Number(unitsSold.rows[0]?.c ?? 0), format: 'count' },
    {
      id: 'unitsAvailable',
      label: 'Units Available',
      value: Number(unitsAvailable.rows[0]?.c ?? 0),
      format: 'count',
    },
    { id: 'collectedInPeriod', label: 'Collected (period)', value: collected, format: 'currency' },
    {
      id: 'outstandingReceivable',
      label: 'Outstanding Receivable',
      value: Number(receivable.rows[0]?.total ?? 0),
      format: 'currency',
    },
    {
      id: 'collectionRate',
      label: 'Collection Rate',
      value: collectionRate,
      format: 'percent',
    },
    {
      id: 'marketingPlans',
      label: 'Marketing Plans',
      value: Number(marketingPlans.rows[0]?.c ?? 0),
      format: 'count',
    },
    {
      id: 'salesReturns',
      label: 'Sales Returns',
      value: Number(salesReturns.rows[0]?.c ?? 0),
      format: 'count',
    },
  ];

  const months = monthRangeForYear(year);
  const salesTrend = await Promise.all(
    months.map(async (m) => {
      const r = await client.query<{ sales: string; collected: string; invoiced: string }>(
        `SELECT
           (SELECT COALESCE(SUM(pa.selling_price), 0)::text
            FROM project_agreements pa
            WHERE pa.tenant_id = $1 AND pa.deleted_at IS NULL
              AND pa.status <> 'Cancelled'
              AND pa.issue_date >= $2::date AND pa.issue_date <= $3::date
              ${paScope}) AS sales,
           (SELECT COALESCE(SUM(i.paid_amount), 0)::text
            FROM invoices i
            LEFT JOIN project_agreements pa ON pa.id = i.agreement_id AND pa.tenant_id = i.tenant_id
            WHERE i.tenant_id = $1 AND i.deleted_at IS NULL
              AND i.agreement_id IS NOT NULL
              AND (pa.status IS NULL OR pa.status <> 'Cancelled')
              AND i.issue_date >= $2::date AND i.issue_date <= $3::date
              ${invScope}) AS collected,
           (SELECT COALESCE(SUM(i.amount), 0)::text
            FROM invoices i
            LEFT JOIN project_agreements pa ON pa.id = i.agreement_id AND pa.tenant_id = i.tenant_id
            WHERE i.tenant_id = $1 AND i.deleted_at IS NULL
              AND i.agreement_id IS NOT NULL
              AND (pa.status IS NULL OR pa.status <> 'Cancelled')
              AND i.issue_date >= $2::date AND i.issue_date <= $3::date
              ${invScope}) AS invoiced`,
        [tenantId, m.from, m.to, ...paFilter.params]
      );
      return {
        month: m.key,
        label: m.label,
        salesValue: Number(r.rows[0]?.sales ?? 0),
        collected: Number(r.rows[0]?.collected ?? 0),
        invoiced: Number(r.rows[0]?.invoiced ?? 0),
      };
    })
  );

  const collectionTrend = salesTrend.map((p) => ({
    month: p.month,
    label: p.label,
    invoiced: p.invoiced,
    collected: p.collected,
  }));

  const agreementStatus: AgreementStatusSlice[] = agreementStatusR.rows.map((row) => ({
    name: row.status,
    value: Number(row.c),
  }));

  const topProjects: TopProjectRow[] = topProjectsR.rows.map((row) => ({
    projectId: row.project_id,
    projectName: row.project_name,
    salesValue: Number(row.total),
  }));

  return {
    filters,
    generatedAt: new Date().toISOString(),
    kpis,
    salesTrend,
    unitPipeline,
    agreementStatus,
    collectionTrend,
    topProjects,
  };
}
