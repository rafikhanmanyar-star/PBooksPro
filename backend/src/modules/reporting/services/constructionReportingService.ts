import type pg from 'pg';
import type {
  AgingBucket,
  BillScheduleRow,
  ConstructionReportingFilters,
  ConstructionReportingSummary,
  OverdueVendorRow,
  PaginatedReportRows,
  PayableReportRow,
  PaymentPerformanceRow,
  ReportingKpi,
  Vendor360Detail,
  VendorLedgerRow,
} from '../types/constructionReportingTypes.js';
import type { DataScopeEnforcementContext } from '../../../auth/tenantRepositoryScope.js';
import { mergeReportScopeIntoFilter } from '../query-builder/reportScopeSql.js';

const AGING_LABELS: Record<AgingBucket['bucket'], string> = {
  current: 'Current',
  '1-30': '1-30 Days',
  '31-60': '31-60 Days',
  '61-90': '61-90 Days',
  '90+': '90+ Days',
};

type FilterSql = { sql: string; params: unknown[]; nextIdx: number };

const BILL_WHERE = `
  b.tenant_id = $1 AND b.deleted_at IS NULL
  AND b.project_id IS NOT NULL AND b.project_id <> ''
  AND (b.description IS NULL OR b.description NOT LIKE '%VOIDED%')
  AND b.status <> 'Paid'
`;

export function parseConstructionFilters(query: Record<string, unknown>): ConstructionReportingFilters {
  const str = (k: string) => {
    const v = query[k];
    return typeof v === 'string' && v.trim() && v.trim() !== 'all' ? v.trim() : undefined;
  };
  return {
    from: typeof query.from === 'string' ? query.from.slice(0, 10) : '',
    to: typeof query.to === 'string' ? query.to.slice(0, 10) : '',
    projectId: str('projectId'),
    vendorId: str('vendorId'),
    contractId: str('contractId'),
    status: str('status'),
  };
}

function buildBillFilterSql(
  filters: ConstructionReportingFilters,
  startIdx: number,
  scopeCtx?: DataScopeEnforcementContext
): FilterSql {
  const parts: string[] = [];
  const params: unknown[] = [];
  let idx = startIdx;

  if (scopeCtx?.enabled) {
    idx = mergeReportScopeIntoFilter(scopeCtx, parts, params, { project: 'b.project_id' });
  }

  if (filters.projectId) {
    parts.push(`b.project_id = $${idx++}`);
    params.push(filters.projectId);
  }
  if (filters.vendorId) {
    parts.push(`b.vendor_id = $${idx++}`);
    params.push(filters.vendorId);
  }
  if (filters.contractId) {
    parts.push(`b.contract_id = $${idx++}`);
    params.push(filters.contractId);
  }
  if (filters.status) {
    parts.push(`EXISTS (
      SELECT 1 FROM contracts c2
      WHERE c2.id = b.contract_id AND c2.tenant_id = b.tenant_id
        AND c2.status = $${idx} AND c2.deleted_at IS NULL
    )`);
    params.push(filters.status);
    idx++;
  }
  return { sql: parts.length ? ` AND ${parts.join(' AND ')}` : '', params, nextIdx: idx };
}

function buildContractFilterSql(
  filters: ConstructionReportingFilters,
  startIdx: number,
  scopeCtx?: DataScopeEnforcementContext
): FilterSql {
  const parts: string[] = [];
  const params: unknown[] = [];
  let idx = startIdx;

  if (scopeCtx?.enabled) {
    idx = mergeReportScopeIntoFilter(scopeCtx, parts, params, { project: 'c.project_id' });
  }

  if (filters.projectId) {
    parts.push(`c.project_id = $${idx++}`);
    params.push(filters.projectId);
  }
  if (filters.vendorId) {
    parts.push(`c.vendor_id = $${idx++}`);
    params.push(filters.vendorId);
  }
  if (filters.contractId) {
    parts.push(`c.id = $${idx++}`);
    params.push(filters.contractId);
  }
  if (filters.status) {
    parts.push(`c.status = $${idx++}`);
    params.push(filters.status);
  }
  return { sql: parts.length ? ` AND ${parts.join(' AND ')}` : '', params, nextIdx: idx };
}

function paginate(page: number, pageSize: number) {
  const p = Math.max(1, page);
  const ps = Math.min(200, Math.max(1, pageSize));
  return { page: p, pageSize: ps, offset: (p - 1) * ps };
}

export async function getConstructionReportingSummary(
  client: pg.PoolClient,
  tenantId: string,
  filters: ConstructionReportingFilters,
  scopeCtx?: DataScopeEnforcementContext
): Promise<ConstructionReportingSummary> {
  const billFilter = buildBillFilterSql(filters, 2, scopeCtx);
  const paidBillFilter = buildBillFilterSql(filters, 4, scopeCtx);

  const contractFilter = buildContractFilterSql(filters, 2, scopeCtx);

  const [vendorsR, payableR, paidR, overdueVendorsR, overdueBillsR, agingR] = await Promise.all([
    client.query<{ c: string }>(
      `SELECT COUNT(DISTINCT c.vendor_id)::text AS c FROM contracts c
       WHERE c.tenant_id = $1 AND c.deleted_at IS NULL AND c.status <> 'Cancelled'${contractFilter.sql}`,
      [tenantId, ...contractFilter.params]
    ),
    client.query<{ total: string }>(
      `SELECT COALESCE(SUM(GREATEST(b.amount - COALESCE(b.paid_amount, 0), 0)), 0)::text AS total
       FROM bills b WHERE ${BILL_WHERE}${billFilter.sql}`,
      [tenantId, ...billFilter.params]
    ),
    client.query<{ total: string }>(
      `SELECT COALESCE(SUM(b.paid_amount), 0)::text AS total FROM bills b
       WHERE b.tenant_id = $1 AND b.deleted_at IS NULL AND b.project_id IS NOT NULL
         AND b.issue_date >= $2::date AND b.issue_date <= $3::date${paidBillFilter.sql}`,
      [tenantId, filters.from, filters.to, ...paidBillFilter.params]
    ),
    client.query<{ c: string }>(
      `SELECT COUNT(DISTINCT b.vendor_id)::text AS c FROM bills b
       WHERE ${BILL_WHERE} AND b.due_date < CURRENT_DATE
         AND GREATEST(b.amount - COALESCE(b.paid_amount, 0), 0) > 0${billFilter.sql}`,
      [tenantId, ...billFilter.params]
    ),
    client.query<{ c: string }>(
      `SELECT COUNT(*)::text AS c FROM bills b
       WHERE ${BILL_WHERE} AND b.due_date < CURRENT_DATE
         AND GREATEST(b.amount - COALESCE(b.paid_amount, 0), 0) > 0${billFilter.sql}`,
      [tenantId, ...billFilter.params]
    ),
    client.query<{ bucket: string; amount: string; entities: string }>(
      `SELECT bucket, COALESCE(SUM(balance), 0)::text AS amount,
              COUNT(DISTINCT vendor_id)::text AS entities
       FROM (
         SELECT b.vendor_id,
           GREATEST(b.amount - COALESCE(b.paid_amount, 0), 0) AS balance,
           CASE
             WHEN b.due_date IS NULL OR b.due_date >= CURRENT_DATE THEN 'current'
             WHEN CURRENT_DATE - b.due_date BETWEEN 1 AND 30 THEN '1-30'
             WHEN CURRENT_DATE - b.due_date BETWEEN 31 AND 60 THEN '31-60'
             WHEN CURRENT_DATE - b.due_date BETWEEN 61 AND 90 THEN '61-90'
             ELSE '90+'
           END AS bucket
         FROM bills b WHERE ${BILL_WHERE}${billFilter.sql}
       ) sub GROUP BY bucket`,
      [tenantId, ...billFilter.params]
    ),
  ]);

  const kpis: ReportingKpi[] = [
    { id: 'totalVendors', label: 'Total Vendors', value: Number(vendorsR.rows[0]?.c ?? 0), format: 'count' },
    { id: 'outstandingPayable', label: 'Outstanding Payable', value: Number(payableR.rows[0]?.total ?? 0), format: 'currency' },
    { id: 'amountPaid', label: 'Amount Paid', value: Number(paidR.rows[0]?.total ?? 0), format: 'currency' },
    { id: 'overdueVendors', label: 'Overdue Vendors', value: Number(overdueVendorsR.rows[0]?.c ?? 0), format: 'count' },
    { id: 'overdueBills', label: 'Overdue Bills', value: Number(overdueBillsR.rows[0]?.c ?? 0), format: 'count' },
  ];

  const order: AgingBucket['bucket'][] = ['current', '1-30', '31-60', '61-90', '90+'];
  const map = new Map(agingR.rows.map((r) => [r.bucket as AgingBucket['bucket'], { amount: Number(r.amount), entityCount: Number(r.entities) }]));
  const aging: AgingBucket[] = order.map((bucket) => ({
    bucket, label: AGING_LABELS[bucket],
    amount: map.get(bucket)?.amount ?? 0, entityCount: map.get(bucket)?.entityCount ?? 0,
  }));

  return { filters, generatedAt: new Date().toISOString(), kpis, aging };
}

export async function getPayableReport(
  client: pg.PoolClient,
  tenantId: string,
  filters: ConstructionReportingFilters,
  page: number,
  pageSize: number,
  scopeCtx?: DataScopeEnforcementContext
): Promise<PaginatedReportRows<PayableReportRow>> {
  const { page: p, pageSize: ps, offset } = paginate(page, pageSize);
  const contractFilter = buildContractFilterSql(filters, 2, scopeCtx);

  const countR = await client.query<{ c: string }>(
    `SELECT COUNT(*)::text AS c FROM contracts c
     WHERE c.tenant_id = $1 AND c.deleted_at IS NULL AND c.status <> 'Cancelled'${contractFilter.sql}`,
    [tenantId, ...contractFilter.params]
  );

  const rowsR = await client.query<{
    id: string; vendor_id: string; vendor_name: string; project_name: string;
    contract_name: string; contract_no: string; contract_amount: string;
    billed: string; paid: string; outstanding: string; overdue_amount: string; status: string;
  }>(
    `SELECT c.id, c.vendor_id, COALESCE(v.name, 'Unknown') AS vendor_name,
            COALESCE(proj.name, '') AS project_name, c.name AS contract_name,
            COALESCE(c.contract_number, '') AS contract_no,
            COALESCE(c.total_amount, 0)::text AS contract_amount,
            COALESCE(bill_sums.billed, 0)::text AS billed,
            COALESCE(bill_sums.paid, 0)::text AS paid,
            GREATEST(COALESCE(bill_sums.billed, 0) - COALESCE(bill_sums.paid, 0), 0)::text AS outstanding,
            COALESCE(od.overdue_amount, 0)::text AS overdue_amount, c.status
     FROM contracts c
     LEFT JOIN vendors v ON v.id = c.vendor_id AND v.tenant_id = c.tenant_id AND v.deleted_at IS NULL
     LEFT JOIN projects proj ON proj.id = c.project_id AND proj.tenant_id = c.tenant_id
     LEFT JOIN LATERAL (
       SELECT COALESCE(SUM(b.amount), 0) AS billed, COALESCE(SUM(b.paid_amount), 0) AS paid
       FROM bills b WHERE b.tenant_id = c.tenant_id AND b.deleted_at IS NULL AND b.contract_id = c.id
     ) bill_sums ON TRUE
     LEFT JOIN LATERAL (
       SELECT COALESCE(SUM(GREATEST(b.amount - COALESCE(b.paid_amount, 0), 0)), 0) AS overdue_amount
       FROM bills b WHERE b.tenant_id = c.tenant_id AND b.deleted_at IS NULL AND b.contract_id = c.id
         AND b.due_date < CURRENT_DATE AND b.status <> 'Paid'
     ) od ON TRUE
     WHERE c.tenant_id = $1 AND c.deleted_at IS NULL AND c.status <> 'Cancelled'${contractFilter.sql}
     ORDER BY GREATEST(COALESCE(bill_sums.billed, 0) - COALESCE(bill_sums.paid, 0), 0) DESC, vendor_name
     LIMIT $${contractFilter.nextIdx} OFFSET $${contractFilter.nextIdx + 1}`,
    [tenantId, ...contractFilter.params, ps, offset]
  );

  return {
    rows: rowsR.rows.map((r) => ({
      id: r.id, vendorId: r.vendor_id, vendorName: r.vendor_name, projectName: r.project_name,
      contractName: r.contract_name, contractNo: r.contract_no, contractAmount: Number(r.contract_amount),
      billed: Number(r.billed), paid: Number(r.paid), outstanding: Number(r.outstanding),
      overdueAmount: Number(r.overdue_amount), status: r.status,
    })),
    totalCount: Number(countR.rows[0]?.c ?? 0), page: p, pageSize: ps,
  };
}

export async function getOverdueVendorsReport(
  client: pg.PoolClient,
  tenantId: string,
  filters: ConstructionReportingFilters,
  page: number,
  pageSize: number,
  scopeCtx?: DataScopeEnforcementContext
): Promise<PaginatedReportRows<OverdueVendorRow>> {
  const { page: p, pageSize: ps, offset } = paginate(page, pageSize);
  const billFilter = buildBillFilterSql(filters, 2, scopeCtx);

  const countR = await client.query<{ c: string }>(
    `SELECT COUNT(DISTINCT b.vendor_id)::text AS c FROM bills b
     WHERE ${BILL_WHERE} AND b.due_date < CURRENT_DATE
       AND GREATEST(b.amount - COALESCE(b.paid_amount, 0), 0) > 0${billFilter.sql}`,
    [tenantId, ...billFilter.params]
  );

  const rowsR = await client.query<{
    vendor_id: string; vendor_name: string; project_name: string;
    overdue_bills: string; overdue_amount: string; oldest_due: string; days_past_due: string;
  }>(
    `SELECT b.vendor_id, COALESCE(v.name, 'Unknown') AS vendor_name,
            COALESCE(string_agg(DISTINCT proj.name, ', '), '') AS project_name,
            COUNT(*)::text AS overdue_bills,
            SUM(GREATEST(b.amount - COALESCE(b.paid_amount, 0), 0))::text AS overdue_amount,
            MIN(b.due_date)::text AS oldest_due, MAX(CURRENT_DATE - b.due_date)::text AS days_past_due
     FROM bills b
     LEFT JOIN vendors v ON v.id = b.vendor_id AND v.tenant_id = b.tenant_id
     LEFT JOIN projects proj ON proj.id = b.project_id AND proj.tenant_id = b.tenant_id
     WHERE ${BILL_WHERE} AND b.due_date < CURRENT_DATE
       AND GREATEST(b.amount - COALESCE(b.paid_amount, 0), 0) > 0${billFilter.sql}
     GROUP BY b.vendor_id, v.name
     ORDER BY overdue_amount DESC
     LIMIT $${billFilter.nextIdx} OFFSET $${billFilter.nextIdx + 1}`,
    [tenantId, ...billFilter.params, ps, offset]
  );

  return {
    rows: rowsR.rows.map((r, idx) => ({
      id: `${r.vendor_id}-${idx}`, vendorId: r.vendor_id, vendorName: r.vendor_name,
      projectName: r.project_name, overdueBills: Number(r.overdue_bills),
      overdueAmount: Number(r.overdue_amount), oldestDueDate: r.oldest_due ?? '',
      daysPastDue: Number(r.days_past_due),
    })),
    totalCount: Number(countR.rows[0]?.c ?? 0), page: p, pageSize: ps,
  };
}

export async function getBillSchedule(
  client: pg.PoolClient,
  tenantId: string,
  filters: ConstructionReportingFilters,
  page: number,
  pageSize: number,
  scopeCtx?: DataScopeEnforcementContext
): Promise<PaginatedReportRows<BillScheduleRow>> {
  const { page: p, pageSize: ps, offset } = paginate(page, pageSize);
  const billFilter = buildBillFilterSql(filters, 4, scopeCtx);

  const countR = await client.query<{ c: string }>(
    `SELECT COUNT(*)::text AS c FROM bills b
     WHERE b.tenant_id = $1 AND b.deleted_at IS NULL AND b.project_id IS NOT NULL
       AND b.due_date >= $2::date AND b.due_date <= $3::date${billFilter.sql}`,
    [tenantId, filters.from, filters.to, ...billFilter.params]
  );

  const rowsR = await client.query<{
    id: string; vendor_id: string; vendor_name: string; project_name: string;
    bill_number: string; due_date: string; amount: string; paid_amount: string; balance: string; status: string;
  }>(
    `SELECT b.id, COALESCE(b.vendor_id, '') AS vendor_id, COALESCE(v.name, 'Unknown') AS vendor_name,
            COALESCE(proj.name, '') AS project_name, COALESCE(b.bill_number, '') AS bill_number,
            b.due_date::text, b.amount::text, COALESCE(b.paid_amount, 0)::text AS paid_amount,
            GREATEST(b.amount - COALESCE(b.paid_amount, 0), 0)::text AS balance, b.status
     FROM bills b
     LEFT JOIN vendors v ON v.id = b.vendor_id AND v.tenant_id = b.tenant_id
     LEFT JOIN projects proj ON proj.id = b.project_id AND proj.tenant_id = b.tenant_id
     WHERE b.tenant_id = $1 AND b.deleted_at IS NULL AND b.project_id IS NOT NULL
       AND b.due_date >= $2::date AND b.due_date <= $3::date${billFilter.sql}
     ORDER BY b.due_date, vendor_name
     LIMIT $${billFilter.nextIdx} OFFSET $${billFilter.nextIdx + 1}`,
    [tenantId, filters.from, filters.to, ...billFilter.params, ps, offset]
  );

  return {
    rows: rowsR.rows.map((r) => ({
      id: r.id, vendorId: r.vendor_id, vendorName: r.vendor_name, projectName: r.project_name,
      billNumber: r.bill_number, dueDate: r.due_date ?? '', amount: Number(r.amount),
      paidAmount: Number(r.paid_amount), balance: Number(r.balance), status: r.status,
    })),
    totalCount: Number(countR.rows[0]?.c ?? 0), page: p, pageSize: ps,
  };
}

export async function getPaymentPerformance(
  client: pg.PoolClient,
  tenantId: string,
  filters: ConstructionReportingFilters,
  scopeCtx?: DataScopeEnforcementContext
): Promise<PaymentPerformanceRow[]> {
  const billFilter = buildBillFilterSql(filters, 4, scopeCtx);
  const year = new Date(filters.to).getFullYear();
  const months: PaymentPerformanceRow[] = [];

  for (let m = 0; m < 12; m++) {
    const start = new Date(year, m, 1);
    const end = new Date(year, m + 1, 0);
    const from = start.toISOString().slice(0, 10);
    const to = end.toISOString().slice(0, 10);
    const r = await client.query<{ billed: string; paid: string }>(
      `SELECT COALESCE(SUM(b.amount), 0)::text AS billed, COALESCE(SUM(b.paid_amount), 0)::text AS paid
       FROM bills b
       WHERE b.tenant_id = $1 AND b.deleted_at IS NULL AND b.project_id IS NOT NULL
         AND b.issue_date >= $2::date AND b.issue_date <= $3::date${billFilter.sql}`,
      [tenantId, from, to, ...billFilter.params]
    );
    const billed = Number(r.rows[0]?.billed ?? 0);
    const paid = Number(r.rows[0]?.paid ?? 0);
    months.push({
      id: `${year}-${m + 1}`, period: `${year}-${String(m + 1).padStart(2, '0')}`,
      label: start.toLocaleString('en-US', { month: 'short' }),
      billed, paid, outstanding: Math.max(0, billed - paid),
      paymentRate: billed > 0 ? (paid / billed) * 100 : 0,
    });
  }
  return months;
}

export async function getVendorLedgerPaginated(
  client: pg.PoolClient,
  tenantId: string,
  filters: ConstructionReportingFilters,
  page: number,
  pageSize: number
): Promise<PaginatedReportRows<VendorLedgerRow>> {
  const { getVendorLedgerReportJson } = await import('../../../services/vendorLedgerReportService.js');
  const payload = await getVendorLedgerReportJson(client, tenantId, {
    startDate: filters.from,
    endDate: filters.to,
    vendorId: filters.vendorId,
    sortDirection: 'desc',
    context: 'Project',
  });

  type LedgerRow = {
    id: string; date: string; vendorName: string; particulars: string;
    billAmount?: number; paidAmount?: number; bill?: number; paid?: number;
    balance: number; vendorId?: string; projectName?: string;
  };

  let rows = (payload.rows as LedgerRow[]).map((r) => ({
    id: r.id, date: r.date, vendorId: r.vendorId ?? filters.vendorId ?? '',
    vendorName: r.vendorName ?? 'Unknown', projectName: r.projectName ?? '',
    particulars: r.particulars,
    bill: r.bill ?? r.billAmount ?? 0,
    paid: r.paid ?? r.paidAmount ?? 0,
    balance: r.balance,
  }));

  if (filters.projectId) {
    const projR = await client.query<{ name: string }>(
      `SELECT name FROM projects WHERE id = $1 AND tenant_id = $2`, [filters.projectId, tenantId]
    );
    const pname = projR.rows[0]?.name;
    if (pname) rows = rows.filter((r) => r.projectName === pname);
  }

  const { page: p, pageSize: ps, offset } = paginate(page, pageSize);
  return { rows: rows.slice(offset, offset + ps), totalCount: rows.length, page: p, pageSize: ps };
}

export async function getVendor360(
  client: pg.PoolClient,
  tenantId: string,
  vendorId: string
): Promise<Vendor360Detail | null> {
  const vendorR = await client.query<{
    id: string; name: string; contact_no: string | null; company_name: string | null;
    address: string | null; description: string | null;
  }>(
    `SELECT id, name, contact_no, company_name, address, description
     FROM vendors WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
    [vendorId, tenantId]
  );
  const vendor = vendorR.rows[0];
  if (!vendor) return null;

  const contractsR = await client.query<{
    contract_id: string; contract_name: string; project_name: string;
    contract_no: string; status: string; total_amount: string;
  }>(
    `SELECT c.id AS contract_id, c.name AS contract_name, COALESCE(proj.name, '') AS project_name,
            COALESCE(c.contract_number, '') AS contract_no, c.status,
            COALESCE(c.total_amount, 0)::text AS total_amount
     FROM contracts c
     LEFT JOIN projects proj ON proj.id = c.project_id AND proj.tenant_id = c.tenant_id
     WHERE c.tenant_id = $1 AND c.vendor_id = $2 AND c.deleted_at IS NULL
     ORDER BY proj.name, c.name`,
    [tenantId, vendorId]
  );

  const finR = await client.query<{
    contract_value: string; billed: string; paid: string; outstanding: string; overdue: string;
  }>(
    `SELECT COALESCE(SUM(c.total_amount), 0)::text AS contract_value,
            COALESCE(SUM(b.amount), 0)::text AS billed,
            COALESCE(SUM(b.paid_amount), 0)::text AS paid,
            COALESCE(SUM(GREATEST(b.amount - COALESCE(b.paid_amount, 0), 0)), 0)::text AS outstanding,
            COALESCE(SUM(CASE WHEN b.due_date < CURRENT_DATE AND b.status <> 'Paid'
              THEN GREATEST(b.amount - COALESCE(b.paid_amount, 0), 0) ELSE 0 END), 0)::text AS overdue
     FROM contracts c
     LEFT JOIN bills b ON b.contract_id = c.id AND b.tenant_id = c.tenant_id AND b.deleted_at IS NULL
     WHERE c.tenant_id = $1 AND c.vendor_id = $2 AND c.deleted_at IS NULL`,
    [tenantId, vendorId]
  );
  const fin = finR.rows[0];

  const paymentsR = await client.query<{
    id: string; date: string; amount: string; description: string | null; bill_number: string | null;
  }>(
    `SELECT t.id, t.date::text, t.amount::text, t.description, b.bill_number
     FROM transactions t
     LEFT JOIN bills b ON b.id = t.bill_id AND b.tenant_id = t.tenant_id
     WHERE t.tenant_id = $1 AND t.vendor_id = $2 AND t.deleted_at IS NULL AND t.type = 'Expense'
     ORDER BY t.date DESC LIMIT 50`,
    [tenantId, vendorId]
  );

  const docsR = await client.query<{ id: string; name: string; type: string; file_name: string; created_at: string }>(
    `SELECT id, name, type, file_name, created_at::text FROM documents
     WHERE tenant_id = $1 AND entity_id = $2 AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 20`,
    [tenantId, vendorId]
  );

  const notes: string[] = [];
  if (vendor.description?.trim()) notes.push(vendor.description.trim());
  const contractNotesR = await client.query<{ description: string | null }>(
    `SELECT description FROM contracts
     WHERE tenant_id = $1 AND vendor_id = $2 AND deleted_at IS NULL
       AND description IS NOT NULL AND TRIM(description) <> ''`,
    [tenantId, vendorId]
  );
  for (const row of contractNotesR.rows) {
    if (row.description?.trim()) notes.push(row.description.trim());
  }

  return {
    profile: {
      vendorId: vendor.id, name: vendor.name,
      contactNo: vendor.contact_no ?? undefined, companyName: vendor.company_name ?? undefined,
      address: vendor.address ?? undefined, description: vendor.description ?? undefined,
    },
    contracts: contractsR.rows.map((c) => ({
      contractId: c.contract_id, contractName: c.contract_name, projectName: c.project_name,
      contractNo: c.contract_no, status: c.status, totalAmount: Number(c.total_amount),
    })),
    financial: {
      contractValue: Number(fin?.contract_value ?? 0), billed: Number(fin?.billed ?? 0),
      paid: Number(fin?.paid ?? 0), outstanding: Number(fin?.outstanding ?? 0),
      overdueAmount: Number(fin?.overdue ?? 0),
    },
    payments: paymentsR.rows.map((p) => ({
      id: p.id, date: p.date, amount: Number(p.amount), description: p.description ?? '',
      billNumber: p.bill_number ?? undefined,
    })),
    notes,
    documents: docsR.rows.map((d) => ({
      id: d.id, name: d.name, type: d.type, fileName: d.file_name, createdAt: d.created_at,
    })),
  };
}
