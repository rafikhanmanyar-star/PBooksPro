import type pg from 'pg';
import type {
  AgingBucket,
  CollectionPerformanceRow,
  PaginatedReportRows,
  RentalReceivableRow,
  RentalReportingFilters,
  RentalReportingSummary,
  RentScheduleRow,
  ReportingKpi,
  Tenant360Detail,
  TenantDefaulterRow,
  TenantLedgerRow,
} from '../types/rentalReportingTypes.js';

const AGING_LABELS: Record<AgingBucket['bucket'], string> = {
  current: 'Current',
  '1-30': '1-30 Days',
  '31-60': '31-60 Days',
  '61-90': '61-90 Days',
  '90+': '90+ Days',
};

type FilterSql = { sql: string; params: unknown[]; nextIdx: number };

const RENTAL_INVOICE_WHERE = `
  i.tenant_id = $1 AND i.deleted_at IS NULL
  AND i.invoice_type IN ('Rental', 'Security Deposit')
  AND (i.description IS NULL OR i.description NOT LIKE '%VOIDED%')
  AND i.status <> 'Paid'
`;

export function parseRentalFilters(query: Record<string, unknown>): RentalReportingFilters {
  const str = (k: string) => {
    const v = query[k];
    return typeof v === 'string' && v.trim() && v.trim() !== 'all' ? v.trim() : undefined;
  };
  return {
    from: typeof query.from === 'string' ? query.from.slice(0, 10) : '',
    to: typeof query.to === 'string' ? query.to.slice(0, 10) : '',
    buildingId: str('buildingId'),
    propertyId: str('propertyId'),
    tenantId: str('tenantId'),
    status: str('status'),
    ownerId: str('ownerId'),
    brokerId: str('brokerId'),
  };
}

function buildAgreementFilterSql(filters: RentalReportingFilters, startIdx: number): FilterSql {
  const parts: string[] = [];
  const params: unknown[] = [];
  let idx = startIdx;
  if (filters.propertyId) {
    parts.push(`ra.property_id = $${idx++}`);
    params.push(filters.propertyId);
  }
  if (filters.tenantId) {
    parts.push(`ra.contact_id = $${idx++}`);
    params.push(filters.tenantId);
  }
  if (filters.status) {
    parts.push(`ra.status = $${idx++}`);
    params.push(filters.status);
  }
  if (filters.ownerId) {
    parts.push(`ra.owner_id = $${idx++}`);
    params.push(filters.ownerId);
  }
  if (filters.brokerId) {
    parts.push(`ra.broker_id = $${idx++}`);
    params.push(filters.brokerId);
  }
  if (filters.buildingId) {
    parts.push(`EXISTS (
      SELECT 1 FROM properties p
      WHERE p.id = ra.property_id AND p.tenant_id = ra.tenant_id
        AND p.building_id = $${idx} AND p.deleted_at IS NULL
    )`);
    params.push(filters.buildingId);
    idx++;
  }
  return { sql: parts.length ? ` AND ${parts.join(' AND ')}` : '', params, nextIdx: idx };
}

function buildInvoiceFilterSql(filters: RentalReportingFilters, startIdx: number): FilterSql {
  const parts: string[] = [`i.invoice_type IN ('Rental', 'Security Deposit')`];
  const params: unknown[] = [];
  let idx = startIdx;
  if (filters.propertyId) {
    parts.push(`i.property_id = $${idx++}`);
    params.push(filters.propertyId);
  }
  if (filters.tenantId) {
    parts.push(`i.contact_id = $${idx++}`);
    params.push(filters.tenantId);
  }
  if (filters.buildingId) {
    parts.push(`EXISTS (
      SELECT 1 FROM properties p
      WHERE p.id = i.property_id AND p.tenant_id = i.tenant_id
        AND p.building_id = $${idx} AND p.deleted_at IS NULL
    )`);
    params.push(filters.buildingId);
    idx++;
  }
  if (filters.status || filters.ownerId || filters.brokerId) {
    parts.push(`EXISTS (
      SELECT 1 FROM rental_agreements ra2
      WHERE ra2.id = i.agreement_id AND ra2.tenant_id = i.tenant_id AND ra2.deleted_at IS NULL
        ${filters.status ? `AND ra2.status = $${idx++}` : ''}
        ${filters.ownerId ? `AND ra2.owner_id = $${idx++}` : ''}
        ${filters.brokerId ? `AND ra2.broker_id = $${idx++}` : ''}
    )`);
    if (filters.status) params.push(filters.status);
    if (filters.ownerId) params.push(filters.ownerId);
    if (filters.brokerId) params.push(filters.brokerId);
  }
  return { sql: parts.length ? ` AND ${parts.join(' AND ')}` : '', params, nextIdx: idx };
}

function paginate(page: number, pageSize: number) {
  const p = Math.max(1, page);
  const ps = Math.min(200, Math.max(1, pageSize));
  return { page: p, pageSize: ps, offset: (p - 1) * ps };
}

export async function getRentalReportingSummary(
  client: pg.PoolClient,
  tenantId: string,
  filters: RentalReportingFilters
): Promise<RentalReportingSummary> {
  const invFilter = buildInvoiceFilterSql(filters, 2);
  const collectedInvFilter = buildInvoiceFilterSql(filters, 4);
  const agrFilter = buildAgreementFilterSql(filters, 2);

  const [tenantsR, receivableR, collectedR, defaultersR, overdueR, agingR] = await Promise.all([
    client.query<{ c: string }>(
      `SELECT COUNT(DISTINCT ra.contact_id)::text AS c
       FROM rental_agreements ra
       WHERE ra.tenant_id = $1 AND ra.deleted_at IS NULL AND ra.status <> 'Cancelled'${agrFilter.sql}`,
      [tenantId, ...agrFilter.params]
    ),
    client.query<{ total: string }>(
      `SELECT COALESCE(SUM(GREATEST(i.amount - COALESCE(i.paid_amount, 0), 0)), 0)::text AS total
       FROM invoices i WHERE ${RENTAL_INVOICE_WHERE}${invFilter.sql}`,
      [tenantId, ...invFilter.params]
    ),
    client.query<{ total: string }>(
      `SELECT COALESCE(SUM(i.paid_amount), 0)::text AS total
       FROM invoices i
       WHERE i.tenant_id = $1 AND i.deleted_at IS NULL
         AND i.invoice_type IN ('Rental', 'Security Deposit')
         AND i.issue_date >= $2::date AND i.issue_date <= $3::date${collectedInvFilter.sql}`,
      [tenantId, filters.from, filters.to, ...collectedInvFilter.params]
    ),
    client.query<{ c: string }>(
      `SELECT COUNT(DISTINCT i.contact_id)::text AS c FROM invoices i
       WHERE ${RENTAL_INVOICE_WHERE} AND i.due_date < CURRENT_DATE
         AND GREATEST(i.amount - COALESCE(i.paid_amount, 0), 0) > 0${invFilter.sql}`,
      [tenantId, ...invFilter.params]
    ),
    client.query<{ c: string }>(
      `SELECT COUNT(*)::text AS c FROM invoices i
       WHERE ${RENTAL_INVOICE_WHERE} AND i.due_date < CURRENT_DATE
         AND GREATEST(i.amount - COALESCE(i.paid_amount, 0), 0) > 0${invFilter.sql}`,
      [tenantId, ...invFilter.params]
    ),
    client.query<{ bucket: string; amount: string; entities: string }>(
      `SELECT bucket, COALESCE(SUM(balance), 0)::text AS amount,
              COUNT(DISTINCT contact_id)::text AS entities
       FROM (
         SELECT i.contact_id,
           GREATEST(i.amount - COALESCE(i.paid_amount, 0), 0) AS balance,
           CASE
             WHEN i.due_date >= CURRENT_DATE THEN 'current'
             WHEN CURRENT_DATE - i.due_date BETWEEN 1 AND 30 THEN '1-30'
             WHEN CURRENT_DATE - i.due_date BETWEEN 31 AND 60 THEN '31-60'
             WHEN CURRENT_DATE - i.due_date BETWEEN 61 AND 90 THEN '61-90'
             ELSE '90+'
           END AS bucket
         FROM invoices i WHERE ${RENTAL_INVOICE_WHERE}${invFilter.sql}
       ) sub GROUP BY bucket`,
      [tenantId, ...invFilter.params]
    ),
  ]);

  const kpis: ReportingKpi[] = [
    { id: 'totalTenants', label: 'Total Tenants', value: Number(tenantsR.rows[0]?.c ?? 0), format: 'count' },
    { id: 'outstandingReceivable', label: 'Outstanding Receivable', value: Number(receivableR.rows[0]?.total ?? 0), format: 'currency' },
    { id: 'rentCollected', label: 'Rent Collected', value: Number(collectedR.rows[0]?.total ?? 0), format: 'currency' },
    { id: 'defaulterTenants', label: 'Defaulter Tenants', value: Number(defaultersR.rows[0]?.c ?? 0), format: 'count' },
    { id: 'overdueInvoices', label: 'Overdue Invoices', value: Number(overdueR.rows[0]?.c ?? 0), format: 'count' },
  ];

  const order: AgingBucket['bucket'][] = ['current', '1-30', '31-60', '61-90', '90+'];
  const map = new Map(agingR.rows.map((r) => [r.bucket as AgingBucket['bucket'], { amount: Number(r.amount), entityCount: Number(r.entities) }]));
  const aging: AgingBucket[] = order.map((bucket) => ({
    bucket,
    label: AGING_LABELS[bucket],
    amount: map.get(bucket)?.amount ?? 0,
    entityCount: map.get(bucket)?.entityCount ?? 0,
  }));

  return { filters, generatedAt: new Date().toISOString(), kpis, aging };
}

export async function getRentalReceivableReport(
  client: pg.PoolClient,
  tenantId: string,
  filters: RentalReportingFilters,
  page: number,
  pageSize: number
): Promise<PaginatedReportRows<RentalReceivableRow>> {
  const { page: p, pageSize: ps, offset } = paginate(page, pageSize);
  const agrFilter = buildAgreementFilterSql(filters, 2);

  const countR = await client.query<{ c: string }>(
    `SELECT COUNT(*)::text AS c FROM rental_agreements ra
     WHERE ra.tenant_id = $1 AND ra.deleted_at IS NULL AND ra.status <> 'Cancelled'${agrFilter.sql}`,
    [tenantId, ...agrFilter.params]
  );

  const rowsR = await client.query<{
    id: string; tenant_id: string; tenant_name: string; property_name: string;
    building_name: string; agreement_no: string; monthly_rent: string;
    invoiced: string; collected: string; outstanding: string; overdue_amount: string; status: string;
  }>(
    `SELECT ra.id, ra.contact_id AS tenant_id, COALESCE(t.name, 'Unknown') AS tenant_name,
            COALESCE(prop.name, '') AS property_name, COALESCE(bld.name, '') AS building_name,
            COALESCE(ra.agreement_number, '') AS agreement_no,
            COALESCE(ra.monthly_rent, 0)::text AS monthly_rent,
            COALESCE(inv_sums.invoice_amount_total, 0)::text AS invoiced,
            COALESCE(inv_sums.invoice_paid_total, 0)::text AS collected,
            GREATEST(COALESCE(inv_sums.invoice_amount_total, 0) - COALESCE(inv_sums.invoice_paid_total, 0), 0)::text AS outstanding,
            COALESCE(od.overdue_amount, 0)::text AS overdue_amount, ra.status
     FROM rental_agreements ra
     LEFT JOIN contacts t ON t.id = ra.contact_id AND t.tenant_id = ra.tenant_id AND t.deleted_at IS NULL
     LEFT JOIN properties prop ON prop.id = ra.property_id AND prop.tenant_id = ra.tenant_id
     LEFT JOIN buildings bld ON bld.id = prop.building_id AND bld.tenant_id = ra.tenant_id
     LEFT JOIN LATERAL (
       SELECT COALESCE(SUM(inv.amount), 0) AS invoice_amount_total,
              COALESCE(SUM(inv.paid_amount), 0) AS invoice_paid_total
       FROM invoices inv
       WHERE inv.tenant_id = ra.tenant_id AND inv.deleted_at IS NULL
         AND inv.agreement_id = ra.id AND inv.invoice_type IN ('Rental', 'Security Deposit')
     ) inv_sums ON TRUE
     LEFT JOIN LATERAL (
       SELECT COALESCE(SUM(GREATEST(inv.amount - COALESCE(inv.paid_amount, 0), 0)), 0) AS overdue_amount
       FROM invoices inv
       WHERE inv.tenant_id = ra.tenant_id AND inv.deleted_at IS NULL
         AND inv.agreement_id = ra.id AND inv.due_date < CURRENT_DATE AND inv.status <> 'Paid'
     ) od ON TRUE
     WHERE ra.tenant_id = $1 AND ra.deleted_at IS NULL AND ra.status <> 'Cancelled'${agrFilter.sql}
     ORDER BY GREATEST(COALESCE(inv_sums.invoice_amount_total, 0) - COALESCE(inv_sums.invoice_paid_total, 0), 0) DESC, tenant_name
     LIMIT $${agrFilter.nextIdx} OFFSET $${agrFilter.nextIdx + 1}`,
    [tenantId, ...agrFilter.params, ps, offset]
  );

  return {
    rows: rowsR.rows.map((r) => ({
      id: r.id, tenantId: r.tenant_id, tenantName: r.tenant_name, propertyName: r.property_name,
      buildingName: r.building_name, agreementNo: r.agreement_no, monthlyRent: Number(r.monthly_rent),
      invoiced: Number(r.invoiced), collected: Number(r.collected), outstanding: Number(r.outstanding),
      overdueAmount: Number(r.overdue_amount), status: r.status,
    })),
    totalCount: Number(countR.rows[0]?.c ?? 0), page: p, pageSize: ps,
  };
}

export async function getTenantDefaultersReport(
  client: pg.PoolClient,
  tenantId: string,
  filters: RentalReportingFilters,
  page: number,
  pageSize: number
): Promise<PaginatedReportRows<TenantDefaulterRow>> {
  const { page: p, pageSize: ps, offset } = paginate(page, pageSize);
  const invFilter = buildInvoiceFilterSql(filters, 2);

  const countR = await client.query<{ c: string }>(
    `SELECT COUNT(DISTINCT i.contact_id)::text AS c FROM invoices i
     WHERE ${RENTAL_INVOICE_WHERE} AND i.due_date < CURRENT_DATE
       AND GREATEST(i.amount - COALESCE(i.paid_amount, 0), 0) > 0${invFilter.sql}`,
    [tenantId, ...invFilter.params]
  );

  const rowsR = await client.query<{
    tenant_id: string; tenant_name: string; property_name: string;
    overdue_invoices: string; overdue_amount: string; oldest_due: string; days_past_due: string;
  }>(
    `SELECT i.contact_id AS tenant_id, COALESCE(c.name, 'Unknown') AS tenant_name,
            COALESCE(string_agg(DISTINCT prop.name, ', '), '') AS property_name,
            COUNT(*)::text AS overdue_invoices,
            SUM(GREATEST(i.amount - COALESCE(i.paid_amount, 0), 0))::text AS overdue_amount,
            MIN(i.due_date)::text AS oldest_due, MAX(CURRENT_DATE - i.due_date)::text AS days_past_due
     FROM invoices i
     LEFT JOIN contacts c ON c.id = i.contact_id AND c.tenant_id = i.tenant_id
     LEFT JOIN properties prop ON prop.id = i.property_id AND prop.tenant_id = i.tenant_id
     WHERE ${RENTAL_INVOICE_WHERE} AND i.due_date < CURRENT_DATE
       AND GREATEST(i.amount - COALESCE(i.paid_amount, 0), 0) > 0${invFilter.sql}
     GROUP BY i.contact_id, c.name
     ORDER BY overdue_amount DESC
     LIMIT $${invFilter.nextIdx} OFFSET $${invFilter.nextIdx + 1}`,
    [tenantId, ...invFilter.params, ps, offset]
  );

  return {
    rows: rowsR.rows.map((r, idx) => ({
      id: `${r.tenant_id}-${idx}`, tenantId: r.tenant_id, tenantName: r.tenant_name,
      propertyName: r.property_name, overdueInvoices: Number(r.overdue_invoices),
      overdueAmount: Number(r.overdue_amount), oldestDueDate: r.oldest_due, daysPastDue: Number(r.days_past_due),
    })),
    totalCount: Number(countR.rows[0]?.c ?? 0), page: p, pageSize: ps,
  };
}

export async function getRentSchedule(
  client: pg.PoolClient,
  tenantId: string,
  filters: RentalReportingFilters,
  page: number,
  pageSize: number
): Promise<PaginatedReportRows<RentScheduleRow>> {
  const { page: p, pageSize: ps, offset } = paginate(page, pageSize);
  const invFilter = buildInvoiceFilterSql(filters, 4);

  const countR = await client.query<{ c: string }>(
    `SELECT COUNT(*)::text AS c FROM invoices i
     WHERE i.tenant_id = $1 AND i.deleted_at IS NULL AND i.invoice_type IN ('Rental', 'Security Deposit')
       AND i.due_date >= $2::date AND i.due_date <= $3::date${invFilter.sql}`,
    [tenantId, filters.from, filters.to, ...invFilter.params]
  );

  const rowsR = await client.query<{
    id: string; tenant_id: string; tenant_name: string; property_name: string;
    invoice_number: string; due_date: string; amount: string; paid_amount: string; balance: string; status: string;
  }>(
    `SELECT i.id, COALESCE(i.contact_id, '') AS tenant_id, COALESCE(c.name, 'Unknown') AS tenant_name,
            COALESCE(prop.name, '') AS property_name, COALESCE(i.invoice_number, '') AS invoice_number,
            i.due_date::text, i.amount::text, COALESCE(i.paid_amount, 0)::text AS paid_amount,
            GREATEST(i.amount - COALESCE(i.paid_amount, 0), 0)::text AS balance, i.status
     FROM invoices i
     LEFT JOIN contacts c ON c.id = i.contact_id AND c.tenant_id = i.tenant_id
     LEFT JOIN properties prop ON prop.id = i.property_id AND prop.tenant_id = i.tenant_id
     WHERE i.tenant_id = $1 AND i.deleted_at IS NULL AND i.invoice_type IN ('Rental', 'Security Deposit')
       AND i.due_date >= $2::date AND i.due_date <= $3::date${invFilter.sql}
     ORDER BY i.due_date, tenant_name
     LIMIT $${invFilter.nextIdx} OFFSET $${invFilter.nextIdx + 1}`,
    [tenantId, filters.from, filters.to, ...invFilter.params, ps, offset]
  );

  return {
    rows: rowsR.rows.map((r) => ({
      id: r.id, tenantId: r.tenant_id, tenantName: r.tenant_name, propertyName: r.property_name,
      invoiceNumber: r.invoice_number, dueDate: r.due_date, amount: Number(r.amount),
      paidAmount: Number(r.paid_amount), balance: Number(r.balance), status: r.status,
    })),
    totalCount: Number(countR.rows[0]?.c ?? 0), page: p, pageSize: ps,
  };
}

export async function getRentalCollectionPerformance(
  client: pg.PoolClient,
  tenantId: string,
  filters: RentalReportingFilters
): Promise<CollectionPerformanceRow[]> {
  const invFilter = buildInvoiceFilterSql(filters, 4);
  const year = new Date(filters.to).getFullYear();
  const months: CollectionPerformanceRow[] = [];

  for (let m = 0; m < 12; m++) {
    const start = new Date(year, m, 1);
    const end = new Date(year, m + 1, 0);
    const from = start.toISOString().slice(0, 10);
    const to = end.toISOString().slice(0, 10);
    const r = await client.query<{ due: string; collected: string }>(
      `SELECT COALESCE(SUM(i.amount), 0)::text AS due, COALESCE(SUM(i.paid_amount), 0)::text AS collected
       FROM invoices i
       WHERE i.tenant_id = $1 AND i.deleted_at IS NULL AND i.invoice_type IN ('Rental', 'Security Deposit')
         AND i.issue_date >= $2::date AND i.issue_date <= $3::date${invFilter.sql}`,
      [tenantId, from, to, ...invFilter.params]
    );
    const due = Number(r.rows[0]?.due ?? 0);
    const collected = Number(r.rows[0]?.collected ?? 0);
    months.push({
      id: `${year}-${m + 1}`, period: `${year}-${String(m + 1).padStart(2, '0')}`,
      label: start.toLocaleString('en-US', { month: 'short' }),
      due, collected, outstanding: Math.max(0, due - collected),
      collectionRate: due > 0 ? (collected / due) * 100 : 0,
    });
  }
  return months;
}

export async function getTenantLedgerPaginated(
  client: pg.PoolClient,
  tenantId: string,
  filters: RentalReportingFilters,
  page: number,
  pageSize: number
): Promise<PaginatedReportRows<TenantLedgerRow>> {
  const { getTenantLedgerReportJson } = await import('../../../services/tenantLedgerReportService.js');
  const payload = await getTenantLedgerReportJson(client, tenantId, {
    startDate: filters.from,
    endDate: filters.to,
    tenantId: filters.tenantId,
    sortKey: 'date',
    sortDirection: 'desc',
  });

  type LedgerRow = {
    id: string; date: string; tenantName?: string; propertyName?: string;
    buildingName?: string; particulars: string; debit: number; credit: number; balance: number;
    tenantId?: string; contactId?: string;
  };

  let rows = (payload.rows as LedgerRow[]).map((r) => ({
    id: r.id, date: r.date, tenantId: r.tenantId ?? r.contactId ?? filters.tenantId ?? '',
    tenantName: r.tenantName ?? 'Unknown', propertyName: r.propertyName ?? '',
    buildingName: r.buildingName ?? '', particulars: r.particulars,
    debit: r.debit, credit: r.credit, balance: r.balance,
  }));

  if (filters.buildingId) {
    const bldR = await client.query<{ name: string }>(
      `SELECT name FROM buildings WHERE id = $1 AND tenant_id = $2`, [filters.buildingId, tenantId]
    );
    const bname = bldR.rows[0]?.name;
    if (bname) rows = rows.filter((r) => r.buildingName === bname);
  }

  const { page: p, pageSize: ps, offset } = paginate(page, pageSize);
  return { rows: rows.slice(offset, offset + ps), totalCount: rows.length, page: p, pageSize: ps };
}

export async function getTenant360(
  client: pg.PoolClient,
  tenantId: string,
  contactId: string
): Promise<Tenant360Detail | null> {
  const contactR = await client.query<{
    id: string; name: string; contact_no: string | null; company_name: string | null;
    address: string | null; description: string | null;
  }>(
    `SELECT id, name, contact_no, company_name, address, description
     FROM contacts WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
    [contactId, tenantId]
  );
  const contact = contactR.rows[0];
  if (!contact) return null;

  const propsR = await client.query<{
    property_id: string; property_name: string; building_name: string;
    agreement_no: string; status: string; monthly_rent: string;
  }>(
    `SELECT ra.property_id, COALESCE(prop.name, '') AS property_name,
            COALESCE(bld.name, '') AS building_name, COALESCE(ra.agreement_number, '') AS agreement_no,
            ra.status, COALESCE(ra.monthly_rent, 0)::text AS monthly_rent
     FROM rental_agreements ra
     LEFT JOIN properties prop ON prop.id = ra.property_id AND prop.tenant_id = ra.tenant_id
     LEFT JOIN buildings bld ON bld.id = prop.building_id AND bld.tenant_id = ra.tenant_id
     WHERE ra.tenant_id = $1 AND ra.contact_id = $2 AND ra.deleted_at IS NULL
     ORDER BY prop.name`,
    [tenantId, contactId]
  );

  const finR = await client.query<{
    monthly_rent: string; invoiced: string; collected: string; outstanding: string; overdue: string;
  }>(
    `SELECT COALESCE(SUM(ra.monthly_rent), 0)::text AS monthly_rent,
            COALESCE(SUM(inv.amount), 0)::text AS invoiced,
            COALESCE(SUM(inv.paid_amount), 0)::text AS collected,
            COALESCE(SUM(GREATEST(inv.amount - COALESCE(inv.paid_amount, 0), 0)), 0)::text AS outstanding,
            COALESCE(SUM(CASE WHEN inv.due_date < CURRENT_DATE AND inv.status <> 'Paid'
              THEN GREATEST(inv.amount - COALESCE(inv.paid_amount, 0), 0) ELSE 0 END), 0)::text AS overdue
     FROM rental_agreements ra
     LEFT JOIN invoices inv ON inv.agreement_id = ra.id AND inv.tenant_id = ra.tenant_id
       AND inv.deleted_at IS NULL AND inv.invoice_type IN ('Rental', 'Security Deposit')
     WHERE ra.tenant_id = $1 AND ra.contact_id = $2 AND ra.deleted_at IS NULL`,
    [tenantId, contactId]
  );
  const fin = finR.rows[0];

  const paymentsR = await client.query<{
    id: string; date: string; amount: string; description: string | null; invoice_number: string | null;
  }>(
    `SELECT t.id, t.date::text, t.amount::text, t.description, inv.invoice_number
     FROM transactions t
     LEFT JOIN invoices inv ON inv.id = t.invoice_id AND inv.tenant_id = t.tenant_id
     WHERE t.tenant_id = $1 AND t.contact_id = $2 AND t.deleted_at IS NULL AND t.type IN ('Income', 'Receipt')
     ORDER BY t.date DESC LIMIT 50`,
    [tenantId, contactId]
  );

  const docsR = await client.query<{ id: string; name: string; type: string; file_name: string; created_at: string }>(
    `SELECT id, name, type, file_name, created_at::text FROM documents
     WHERE tenant_id = $1 AND entity_id = $2 AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 20`,
    [tenantId, contactId]
  );

  const notes: string[] = [];
  if (contact.description?.trim()) notes.push(contact.description.trim());
  const agrNotesR = await client.query<{ description: string | null }>(
    `SELECT description FROM rental_agreements
     WHERE tenant_id = $1 AND contact_id = $2 AND deleted_at IS NULL
       AND description IS NOT NULL AND TRIM(description) <> ''`,
    [tenantId, contactId]
  );
  for (const row of agrNotesR.rows) {
    if (row.description?.trim()) notes.push(row.description.trim());
  }

  return {
    profile: {
      contactId: contact.id, name: contact.name,
      contactNo: contact.contact_no ?? undefined, companyName: contact.company_name ?? undefined,
      address: contact.address ?? undefined, description: contact.description ?? undefined,
    },
    properties: propsR.rows.map((p) => ({
      propertyId: p.property_id, propertyName: p.property_name, buildingName: p.building_name,
      agreementNo: p.agreement_no, status: p.status, monthlyRent: Number(p.monthly_rent),
    })),
    financial: {
      monthlyRent: Number(fin?.monthly_rent ?? 0), invoiced: Number(fin?.invoiced ?? 0),
      collected: Number(fin?.collected ?? 0), outstanding: Number(fin?.outstanding ?? 0),
      overdueAmount: Number(fin?.overdue ?? 0),
    },
    payments: paymentsR.rows.map((p) => ({
      id: p.id, date: p.date, amount: Number(p.amount), description: p.description ?? '',
      invoiceNumber: p.invoice_number ?? undefined,
    })),
    notes,
    documents: docsR.rows.map((d) => ({
      id: d.id, name: d.name, type: d.type, fileName: d.file_name, createdAt: d.created_at,
    })),
  };
}
