import type pg from 'pg';
import type {
  CollectionPerformanceRow,
  Customer360Detail,
  CustomerAgingBucket,
  CustomerLedgerRow,
  CustomerReportingFilters,
  CustomerReportingKpi,
  CustomerReportingSummary,
  DefaulterReportRow,
  InstallmentScheduleRow,
  PaginatedReportRows,
  ReceivableReportRow,
} from '../types/customerReportingTypes.js';

const AGING_LABELS: Record<CustomerAgingBucket['bucket'], string> = {
  current: 'Current',
  '1-30': '1-30 Days',
  '31-60': '31-60 Days',
  '61-90': '61-90 Days',
  '90+': '90+ Days',
};

type FilterSql = { sql: string; params: unknown[]; nextIdx: number };

function parseFilters(query: Record<string, unknown>): CustomerReportingFilters {
  const str = (k: string) => {
    const v = query[k];
    return typeof v === 'string' && v.trim() && v.trim() !== 'all' ? v.trim() : undefined;
  };
  const from = typeof query.from === 'string' ? query.from.slice(0, 10) : '';
  const to = typeof query.to === 'string' ? query.to.slice(0, 10) : '';
  return {
    from,
    to,
    projectId: str('projectId'),
    customerId: str('customerId'),
    unitId: str('unitId'),
    status: str('status'),
    salesAgentId: str('salesAgentId'),
  };
}

function buildAgreementFilterSql(filters: CustomerReportingFilters, startIdx: number): FilterSql {
  const parts: string[] = [];
  const params: unknown[] = [];
  let idx = startIdx;
  if (filters.projectId) {
    params.push(filters.projectId);
    parts.push(`pa.project_id = $${idx++}`);
  }
  if (filters.customerId) {
    params.push(filters.customerId);
    parts.push(`pa.client_id = $${idx++}`);
  }
  if (filters.status) {
    params.push(filters.status);
    parts.push(`pa.status = $${idx++}`);
  }
  if (filters.salesAgentId) {
    params.push(filters.salesAgentId);
    parts.push(`pa.rebate_broker_id = $${idx++}`);
  }
  if (filters.unitId) {
    parts.push(`EXISTS (
      SELECT 1 FROM project_agreement_units pau
      WHERE pau.agreement_id = pa.id AND pau.unit_id = $${idx}
    )`);
    params.push(filters.unitId);
    idx++;
  }
  return {
    sql: parts.length ? ` AND ${parts.join(' AND ')}` : '',
    params,
    nextIdx: idx,
  };
}

function buildInvoiceFilterSql(filters: CustomerReportingFilters, startIdx: number): FilterSql {
  const parts: string[] = [`i.invoice_type = 'Installment'`];
  const params: unknown[] = [];
  let idx = startIdx;
  if (filters.projectId) {
    params.push(filters.projectId);
    parts.push(`i.project_id = $${idx++}`);
  }
  if (filters.customerId) {
    params.push(filters.customerId);
    parts.push(`i.contact_id = $${idx++}`);
  }
  if (filters.unitId) {
    params.push(filters.unitId);
    parts.push(`i.unit_id = $${idx++}`);
  }
  if (filters.salesAgentId) {
    parts.push(`EXISTS (
      SELECT 1 FROM project_agreements pa2
      WHERE pa2.id = i.agreement_id AND pa2.tenant_id = i.tenant_id
        AND pa2.rebate_broker_id = $${idx} AND pa2.deleted_at IS NULL
    )`);
    params.push(filters.salesAgentId);
    idx++;
  }
  if (filters.status) {
    parts.push(`EXISTS (
      SELECT 1 FROM project_agreements pa2
      WHERE pa2.id = i.agreement_id AND pa2.tenant_id = i.tenant_id
        AND pa2.status = $${idx} AND pa2.deleted_at IS NULL
    )`);
    params.push(filters.status);
    idx++;
  }
  return {
    sql: parts.length ? ` AND ${parts.join(' AND ')}` : '',
    params,
    nextIdx: idx,
  };
}

const INSTALLMENT_INVOICE_WHERE = `
  i.tenant_id = $1 AND i.deleted_at IS NULL
  AND i.invoice_type = 'Installment'
  AND (i.description IS NULL OR i.description NOT LIKE '%VOIDED%')
  AND i.status <> 'Paid'
`;

export { parseFilters };

export async function getCustomerReportingSummary(
  client: pg.PoolClient,
  tenantId: string,
  filters: CustomerReportingFilters
): Promise<CustomerReportingSummary> {
  const invFilter = buildInvoiceFilterSql(filters, 2);
  const collectedInvFilter = buildInvoiceFilterSql(filters, 4);
  const agrFilter = buildAgreementFilterSql(filters, 2);

  const [customersR, receivableR, collectedR, defaultersR, overdueInstR, agingR] = await Promise.all([
    client.query<{ c: string }>(
      `SELECT COUNT(DISTINCT pa.client_id)::text AS c
       FROM project_agreements pa
       WHERE pa.tenant_id = $1 AND pa.deleted_at IS NULL
         AND pa.status <> 'Cancelled'${agrFilter.sql}`,
      [tenantId, ...agrFilter.params]
    ),
    client.query<{ total: string }>(
      `SELECT COALESCE(SUM(GREATEST(i.amount - COALESCE(i.paid_amount, 0), 0)), 0)::text AS total
       FROM invoices i
       WHERE ${INSTALLMENT_INVOICE_WHERE}${invFilter.sql}`,
      [tenantId, ...invFilter.params]
    ),
    client.query<{ total: string }>(
      `SELECT COALESCE(SUM(i.paid_amount), 0)::text AS total
       FROM invoices i
       WHERE i.tenant_id = $1 AND i.deleted_at IS NULL AND i.invoice_type = 'Installment'
         AND i.issue_date >= $2::date AND i.issue_date <= $3::date${collectedInvFilter.sql}`,
      [tenantId, filters.from, filters.to, ...collectedInvFilter.params]
    ),
    client.query<{ c: string }>(
      `SELECT COUNT(DISTINCT i.contact_id)::text AS c
       FROM invoices i
       WHERE ${INSTALLMENT_INVOICE_WHERE}
         AND i.due_date < CURRENT_DATE
         AND GREATEST(i.amount - COALESCE(i.paid_amount, 0), 0) > 0${invFilter.sql}`,
      [tenantId, ...invFilter.params]
    ),
    client.query<{ c: string }>(
      `SELECT COUNT(*)::text AS c
       FROM invoices i
       WHERE ${INSTALLMENT_INVOICE_WHERE}
         AND i.due_date < CURRENT_DATE
         AND GREATEST(i.amount - COALESCE(i.paid_amount, 0), 0) > 0${invFilter.sql}`,
      [tenantId, ...invFilter.params]
    ),
    client.query<{ bucket: string; amount: string; customers: string }>(
      `SELECT bucket,
              COALESCE(SUM(balance), 0)::text AS amount,
              COUNT(DISTINCT contact_id)::text AS customers
       FROM (
         SELECT
           i.contact_id,
           GREATEST(i.amount - COALESCE(i.paid_amount, 0), 0) AS balance,
           CASE
             WHEN i.due_date >= CURRENT_DATE THEN 'current'
             WHEN CURRENT_DATE - i.due_date BETWEEN 1 AND 30 THEN '1-30'
             WHEN CURRENT_DATE - i.due_date BETWEEN 31 AND 60 THEN '31-60'
             WHEN CURRENT_DATE - i.due_date BETWEEN 61 AND 90 THEN '61-90'
             ELSE '90+'
           END AS bucket
         FROM invoices i
         WHERE ${INSTALLMENT_INVOICE_WHERE}${invFilter.sql}
       ) sub
       GROUP BY bucket`,
      [tenantId, ...invFilter.params]
    ),
  ]);

  const kpis: CustomerReportingKpi[] = [
    { id: 'totalCustomers', label: 'Total Customers', value: Number(customersR.rows[0]?.c ?? 0), format: 'count' },
    { id: 'outstandingReceivable', label: 'Outstanding Receivable', value: Number(receivableR.rows[0]?.total ?? 0), format: 'currency' },
    { id: 'amountCollected', label: 'Amount Collected', value: Number(collectedR.rows[0]?.total ?? 0), format: 'currency' },
    { id: 'defaulterCustomers', label: 'Defaulter Customers', value: Number(defaultersR.rows[0]?.c ?? 0), format: 'count' },
    { id: 'overdueInstallments', label: 'Overdue Installments', value: Number(overdueInstR.rows[0]?.c ?? 0), format: 'count' },
  ];

  const agingOrder: CustomerAgingBucket['bucket'][] = ['current', '1-30', '31-60', '61-90', '90+'];
  const agingMap = new Map(
    agingR.rows.map((r) => [
      r.bucket as CustomerAgingBucket['bucket'],
      { amount: Number(r.amount), customerCount: Number(r.customers) },
    ])
  );
  const aging: CustomerAgingBucket[] = agingOrder.map((bucket) => ({
    bucket,
    label: AGING_LABELS[bucket],
    amount: agingMap.get(bucket)?.amount ?? 0,
    customerCount: agingMap.get(bucket)?.customerCount ?? 0,
  }));

  return { filters, generatedAt: new Date().toISOString(), kpis, aging };
}

function paginate(page: number, pageSize: number) {
  const p = Math.max(1, page);
  const ps = Math.min(200, Math.max(1, pageSize));
  return { page: p, pageSize: ps, offset: (p - 1) * ps };
}

export async function getReceivableReport(
  client: pg.PoolClient,
  tenantId: string,
  filters: CustomerReportingFilters,
  page: number,
  pageSize: number
): Promise<PaginatedReportRows<ReceivableReportRow>> {
  const { page: p, pageSize: ps, offset } = paginate(page, pageSize);
  const agrFilter = buildAgreementFilterSql(filters, 2);

  const countR = await client.query<{ c: string }>(
    `SELECT COUNT(*)::text AS c FROM project_agreements pa
     WHERE pa.tenant_id = $1 AND pa.deleted_at IS NULL AND pa.status <> 'Cancelled'${agrFilter.sql}`,
    [tenantId, ...agrFilter.params]
  );
  const totalCount = Number(countR.rows[0]?.c ?? 0);

  const rowsR = await client.query<{
    id: string;
    customer_id: string;
    customer_name: string;
    project_name: string;
    unit_names: string;
    agreement_no: string;
    selling_price: string;
    invoiced: string;
    collected: string;
    outstanding: string;
    overdue_amount: string;
    status: string;
  }>(
    `SELECT pa.id,
            pa.client_id AS customer_id,
            COALESCE(c.name, 'Unknown') AS customer_name,
            COALESCE(proj.name, '') AS project_name,
            COALESCE(uagg.unit_numbers, '') AS unit_names,
            COALESCE(pa.agreement_number, '') AS agreement_no,
            COALESCE(pa.selling_price, 0)::text AS selling_price,
            COALESCE(inv_sums.invoice_amount_total, 0)::text AS invoiced,
            COALESCE(inv_sums.invoice_paid_total, 0)::text AS collected,
            GREATEST(COALESCE(inv_sums.invoice_amount_total, 0) - COALESCE(inv_sums.invoice_paid_total, 0), 0)::text AS outstanding,
            COALESCE(od.overdue_amount, 0)::text AS overdue_amount,
            pa.status
     FROM project_agreements pa
     LEFT JOIN contacts c ON c.id = pa.client_id AND c.tenant_id = pa.tenant_id AND c.deleted_at IS NULL
     LEFT JOIN projects proj ON proj.id = pa.project_id AND proj.tenant_id = pa.tenant_id AND proj.deleted_at IS NULL
     LEFT JOIN LATERAL (
       SELECT string_agg(u.unit_number, ', ' ORDER BY u.unit_number) AS unit_numbers
       FROM project_agreement_units pau
       JOIN units u ON u.id = pau.unit_id AND u.tenant_id = pa.tenant_id AND u.deleted_at IS NULL
       WHERE pau.agreement_id = pa.id
     ) uagg ON TRUE
     LEFT JOIN LATERAL (
       SELECT COALESCE(SUM(inv.amount), 0) AS invoice_amount_total,
              COALESCE(SUM(inv.paid_amount), 0) AS invoice_paid_total
       FROM invoices inv
       WHERE inv.tenant_id = pa.tenant_id AND inv.deleted_at IS NULL
         AND inv.agreement_id = pa.id AND inv.invoice_type = 'Installment'
     ) inv_sums ON TRUE
     LEFT JOIN LATERAL (
       SELECT COALESCE(SUM(GREATEST(inv.amount - COALESCE(inv.paid_amount, 0), 0)), 0) AS overdue_amount
       FROM invoices inv
       WHERE inv.tenant_id = pa.tenant_id AND inv.deleted_at IS NULL
         AND inv.agreement_id = pa.id AND inv.invoice_type = 'Installment'
         AND inv.due_date < CURRENT_DATE AND inv.status <> 'Paid'
     ) od ON TRUE
     WHERE pa.tenant_id = $1 AND pa.deleted_at IS NULL AND pa.status <> 'Cancelled'${agrFilter.sql}
     ORDER BY GREATEST(COALESCE(inv_sums.invoice_amount_total, 0) - COALESCE(inv_sums.invoice_paid_total, 0), 0) DESC,
              customer_name
     LIMIT $${agrFilter.nextIdx} OFFSET $${agrFilter.nextIdx + 1}`,
    [tenantId, ...agrFilter.params, ps, offset]
  );

  return {
    rows: rowsR.rows.map((r) => ({
      id: r.id,
      customerId: r.customer_id,
      customerName: r.customer_name,
      projectName: r.project_name,
      unitNames: r.unit_names,
      agreementNo: r.agreement_no,
      sellingPrice: Number(r.selling_price),
      invoiced: Number(r.invoiced),
      collected: Number(r.collected),
      outstanding: Number(r.outstanding),
      overdueAmount: Number(r.overdue_amount),
      status: r.status,
    })),
    totalCount,
    page: p,
    pageSize: ps,
  };
}

export async function getDefaultersReport(
  client: pg.PoolClient,
  tenantId: string,
  filters: CustomerReportingFilters,
  page: number,
  pageSize: number
): Promise<PaginatedReportRows<DefaulterReportRow>> {
  const { page: p, pageSize: ps, offset } = paginate(page, pageSize);
  const invFilter = buildInvoiceFilterSql(filters, 2);

  const countR = await client.query<{ c: string }>(
    `SELECT COUNT(DISTINCT i.contact_id)::text AS c
     FROM invoices i
     WHERE ${INSTALLMENT_INVOICE_WHERE}
       AND i.due_date < CURRENT_DATE
       AND GREATEST(i.amount - COALESCE(i.paid_amount, 0), 0) > 0${invFilter.sql}`,
    [tenantId, ...invFilter.params]
  );
  const totalCount = Number(countR.rows[0]?.c ?? 0);

  const rowsR = await client.query<{
    customer_id: string;
    customer_name: string;
    project_name: string;
    unit_names: string;
    overdue_installments: string;
    overdue_amount: string;
    oldest_due: string;
    days_past_due: string;
  }>(
    `SELECT i.contact_id AS customer_id,
            COALESCE(c.name, 'Unknown') AS customer_name,
            COALESCE(proj.name, '') AS project_name,
            COALESCE(string_agg(DISTINCT u.unit_number, ', '), '') AS unit_names,
            COUNT(*)::text AS overdue_installments,
            SUM(GREATEST(i.amount - COALESCE(i.paid_amount, 0), 0))::text AS overdue_amount,
            MIN(i.due_date)::text AS oldest_due,
            MAX(CURRENT_DATE - i.due_date)::text AS days_past_due
     FROM invoices i
     LEFT JOIN contacts c ON c.id = i.contact_id AND c.tenant_id = i.tenant_id
     LEFT JOIN projects proj ON proj.id = i.project_id AND proj.tenant_id = i.tenant_id
     LEFT JOIN units u ON u.id = i.unit_id AND u.tenant_id = i.tenant_id
     WHERE ${INSTALLMENT_INVOICE_WHERE}
       AND i.due_date < CURRENT_DATE
       AND GREATEST(i.amount - COALESCE(i.paid_amount, 0), 0) > 0${invFilter.sql}
     GROUP BY i.contact_id, c.name, proj.name
     ORDER BY overdue_amount DESC
     LIMIT $${invFilter.nextIdx} OFFSET $${invFilter.nextIdx + 1}`,
    [tenantId, ...invFilter.params, ps, offset]
  );

  return {
    rows: rowsR.rows.map((r, idx) => ({
      id: `${r.customer_id}-${idx}`,
      customerId: r.customer_id,
      customerName: r.customer_name,
      projectName: r.project_name,
      unitNames: r.unit_names,
      overdueInstallments: Number(r.overdue_installments),
      overdueAmount: Number(r.overdue_amount),
      oldestDueDate: r.oldest_due,
      daysPastDue: Number(r.days_past_due),
    })),
    totalCount,
    page: p,
    pageSize: ps,
  };
}

export async function getInstallmentSchedule(
  client: pg.PoolClient,
  tenantId: string,
  filters: CustomerReportingFilters,
  page: number,
  pageSize: number
): Promise<PaginatedReportRows<InstallmentScheduleRow>> {
  const { page: p, pageSize: ps, offset } = paginate(page, pageSize);
  const invFilter = buildInvoiceFilterSql(filters, 4);

  const countR = await client.query<{ c: string }>(
    `SELECT COUNT(*)::text AS c FROM invoices i
     WHERE i.tenant_id = $1 AND i.deleted_at IS NULL AND i.invoice_type = 'Installment'
       AND i.due_date >= $2::date AND i.due_date <= $3::date${invFilter.sql}`,
    [tenantId, filters.from, filters.to, ...invFilter.params]
  );
  const totalCount = Number(countR.rows[0]?.c ?? 0);

  const rowsR = await client.query<{
    id: string;
    customer_id: string;
    customer_name: string;
    project_name: string;
    unit_name: string;
    invoice_number: string;
    due_date: string;
    amount: string;
    paid_amount: string;
    balance: string;
    status: string;
  }>(
    `SELECT i.id,
            COALESCE(i.contact_id, '') AS customer_id,
            COALESCE(c.name, 'Unknown') AS customer_name,
            COALESCE(proj.name, '') AS project_name,
            COALESCE(u.unit_number, '') AS unit_name,
            COALESCE(i.invoice_number, '') AS invoice_number,
            i.due_date::text,
            i.amount::text,
            COALESCE(i.paid_amount, 0)::text AS paid_amount,
            GREATEST(i.amount - COALESCE(i.paid_amount, 0), 0)::text AS balance,
            i.status
     FROM invoices i
     LEFT JOIN contacts c ON c.id = i.contact_id AND c.tenant_id = i.tenant_id
     LEFT JOIN projects proj ON proj.id = i.project_id AND proj.tenant_id = i.tenant_id
     LEFT JOIN units u ON u.id = i.unit_id AND u.tenant_id = i.tenant_id
     WHERE i.tenant_id = $1 AND i.deleted_at IS NULL AND i.invoice_type = 'Installment'
       AND i.due_date >= $2::date AND i.due_date <= $3::date${invFilter.sql}
     ORDER BY i.due_date, customer_name
     LIMIT $${invFilter.nextIdx} OFFSET $${invFilter.nextIdx + 1}`,
    [tenantId, filters.from, filters.to, ...invFilter.params, ps, offset]
  );

  return {
    rows: rowsR.rows.map((r) => ({
      id: r.id,
      customerId: r.customer_id,
      customerName: r.customer_name,
      projectName: r.project_name,
      unitName: r.unit_name,
      invoiceNumber: r.invoice_number,
      dueDate: r.due_date,
      amount: Number(r.amount),
      paidAmount: Number(r.paid_amount),
      balance: Number(r.balance),
      status: r.status,
    })),
    totalCount,
    page: p,
    pageSize: ps,
  };
}

export async function getCollectionPerformance(
  client: pg.PoolClient,
  tenantId: string,
  filters: CustomerReportingFilters
): Promise<CollectionPerformanceRow[]> {
  const invFilter = buildInvoiceFilterSql(filters, 4);
  const year = new Date(filters.to).getFullYear();
  const months: CollectionPerformanceRow[] = [];

  for (let m = 0; m < 12; m++) {
    const start = new Date(year, m, 1);
    const end = new Date(year, m + 1, 0);
    const from = start.toISOString().slice(0, 10);
    const to = end.toISOString().slice(0, 10);
    const label = start.toLocaleString('en-US', { month: 'short' });

    const r = await client.query<{ due: string; collected: string }>(
      `SELECT COALESCE(SUM(i.amount), 0)::text AS due,
              COALESCE(SUM(i.paid_amount), 0)::text AS collected
       FROM invoices i
       WHERE i.tenant_id = $1 AND i.deleted_at IS NULL AND i.invoice_type = 'Installment'
         AND i.issue_date >= $2::date AND i.issue_date <= $3::date${invFilter.sql}`,
      [tenantId, from, to, ...invFilter.params]
    );
    const due = Number(r.rows[0]?.due ?? 0);
    const collected = Number(r.rows[0]?.collected ?? 0);
    const outstanding = Math.max(0, due - collected);
    months.push({
      id: `${year}-${m + 1}`,
      period: `${year}-${String(m + 1).padStart(2, '0')}`,
      label,
      due,
      collected,
      outstanding,
      collectionRate: due > 0 ? (collected / due) * 100 : 0,
    });
  }

  return months.filter((row) => {
    const monthStart = `${row.period}-01`;
    return monthStart >= filters.from.slice(0, 7) + '-01' || row.period.startsWith(String(year));
  });
}

export async function getCustomerLedgerPaginated(
  client: pg.PoolClient,
  tenantId: string,
  filters: CustomerReportingFilters,
  page: number,
  pageSize: number
): Promise<PaginatedReportRows<CustomerLedgerRow>> {
  const { getClientLedgerReportJson } = await import('../../../services/clientLedgerReportService.js');
  const selection =
    filters.unitId
      ? { selectionKind: 'unit' as const, unitId: filters.unitId }
      : filters.customerId
        ? { selectionKind: 'owner' as const, ownerId: filters.customerId }
        : { selectionKind: 'all' as const };

  const payload = await getClientLedgerReportJson(client, tenantId, {
    startDate: filters.from,
    endDate: filters.to,
    ...selection,
    sortKey: 'date',
    sortDirection: 'desc',
  });

  type LedgerRow = {
    id: string;
    date: string;
    ownerName: string;
    unitName: string;
    projectName: string;
    particulars: string;
    debit: number;
    credit: number;
    balance: number;
  };
  let rows = (payload.rows as LedgerRow[]).map((r) => ({
    id: r.id,
    date: r.date,
    customerId: '',
    customerName: r.ownerName,
    unitName: r.unitName,
    projectName: r.projectName,
    particulars: r.particulars,
    debit: r.debit,
    credit: r.credit,
    balance: r.balance,
  }));

  if (filters.projectId) {
    const projR = await client.query<{ name: string }>(
      `SELECT name FROM projects WHERE id = $1 AND tenant_id = $2`,
      [filters.projectId, tenantId]
    );
    const pname = projR.rows[0]?.name;
    if (pname) rows = rows.filter((r) => r.projectName === pname);
  }

  const totalCount = rows.length;
  const { page: p, pageSize: ps, offset } = paginate(page, pageSize);
  return {
    rows: rows.slice(offset, offset + ps),
    totalCount,
    page: p,
    pageSize: ps,
  };
}

export async function getCustomer360(
  client: pg.PoolClient,
  tenantId: string,
  contactId: string
): Promise<Customer360Detail | null> {
  const contactR = await client.query<{
    id: string;
    name: string;
    contact_no: string | null;
    company_name: string | null;
    address: string | null;
    description: string | null;
  }>(
    `SELECT id, name, contact_no, company_name, address, description
     FROM contacts WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
    [contactId, tenantId]
  );
  const contact = contactR.rows[0];
  if (!contact) return null;

  const unitsR = await client.query<{
    unit_id: string;
    unit_name: string;
    project_name: string;
    agreement_no: string;
    status: string;
    selling_price: string;
  }>(
    `SELECT u.id AS unit_id,
            COALESCE(u.unit_number, u.name, '') AS unit_name,
            COALESCE(proj.name, '') AS project_name,
            COALESCE(pa.agreement_number, '') AS agreement_no,
            pa.status,
            COALESCE(pa.selling_price, 0)::text AS selling_price
     FROM project_agreements pa
     JOIN project_agreement_units pau ON pau.agreement_id = pa.id
     JOIN units u ON u.id = pau.unit_id AND u.tenant_id = pa.tenant_id
     LEFT JOIN projects proj ON proj.id = pa.project_id AND proj.tenant_id = pa.tenant_id
     WHERE pa.tenant_id = $1 AND pa.client_id = $2 AND pa.deleted_at IS NULL
     ORDER BY proj.name, unit_name`,
    [tenantId, contactId]
  );

  const finR = await client.query<{
    selling_price: string;
    invoiced: string;
    collected: string;
    outstanding: string;
    overdue: string;
  }>(
    `SELECT COALESCE(SUM(pa.selling_price), 0)::text AS selling_price,
            COALESCE(SUM(inv.amount), 0)::text AS invoiced,
            COALESCE(SUM(inv.paid_amount), 0)::text AS collected,
            COALESCE(SUM(GREATEST(inv.amount - COALESCE(inv.paid_amount, 0), 0)), 0)::text AS outstanding,
            COALESCE(SUM(CASE WHEN inv.due_date < CURRENT_DATE AND inv.status <> 'Paid'
              THEN GREATEST(inv.amount - COALESCE(inv.paid_amount, 0), 0) ELSE 0 END), 0)::text AS overdue
     FROM project_agreements pa
     LEFT JOIN invoices inv ON inv.agreement_id = pa.id AND inv.tenant_id = pa.tenant_id
       AND inv.deleted_at IS NULL AND inv.invoice_type = 'Installment'
     WHERE pa.tenant_id = $1 AND pa.client_id = $2 AND pa.deleted_at IS NULL`,
    [tenantId, contactId]
  );
  const fin = finR.rows[0];

  const paymentsR = await client.query<{
    id: string;
    date: string;
    amount: string;
    description: string | null;
    invoice_number: string | null;
  }>(
    `SELECT t.id, t.date::text, t.amount::text, t.description,
            inv.invoice_number
     FROM transactions t
     LEFT JOIN invoices inv ON inv.id = t.invoice_id AND inv.tenant_id = t.tenant_id
     WHERE t.tenant_id = $1 AND t.contact_id = $2 AND t.deleted_at IS NULL
       AND t.type IN ('Income', 'Receipt')
     ORDER BY t.date DESC
     LIMIT 50`,
    [tenantId, contactId]
  );

  const docsR = await client.query<{
    id: string;
    name: string;
    type: string;
    file_name: string;
    created_at: string;
  }>(
    `SELECT id, name, type, file_name, created_at::text
     FROM documents
     WHERE tenant_id = $1 AND entity_id = $2 AND deleted_at IS NULL
     ORDER BY created_at DESC
     LIMIT 20`,
    [tenantId, contactId]
  );

  const notes: string[] = [];
  if (contact.description?.trim()) notes.push(contact.description.trim());

  const agrNotesR = await client.query<{ description: string | null }>(
    `SELECT description FROM project_agreements
     WHERE tenant_id = $1 AND client_id = $2 AND deleted_at IS NULL
       AND description IS NOT NULL AND TRIM(description) <> ''`,
    [tenantId, contactId]
  );
  for (const row of agrNotesR.rows) {
    if (row.description?.trim()) notes.push(row.description.trim());
  }

  return {
    profile: {
      contactId: contact.id,
      name: contact.name,
      contactNo: contact.contact_no ?? undefined,
      companyName: contact.company_name ?? undefined,
      address: contact.address ?? undefined,
      description: contact.description ?? undefined,
    },
    units: unitsR.rows.map((u) => ({
      unitId: u.unit_id,
      unitName: u.unit_name,
      projectName: u.project_name,
      agreementNo: u.agreement_no,
      status: u.status,
      sellingPrice: Number(u.selling_price),
    })),
    financial: {
      sellingPrice: Number(fin?.selling_price ?? 0),
      invoiced: Number(fin?.invoiced ?? 0),
      collected: Number(fin?.collected ?? 0),
      outstanding: Number(fin?.outstanding ?? 0),
      overdueAmount: Number(fin?.overdue ?? 0),
    },
    payments: paymentsR.rows.map((p) => ({
      id: p.id,
      date: p.date,
      amount: Number(p.amount),
      description: p.description ?? '',
      invoiceNumber: p.invoice_number ?? undefined,
    })),
    notes,
    documents: docsR.rows.map((d) => ({
      id: d.id,
      name: d.name,
      type: d.type,
      fileName: d.file_name,
      createdAt: d.created_at,
    })),
  };
}
