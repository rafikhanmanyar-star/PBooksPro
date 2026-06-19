import type pg from 'pg';
import { computeSnapshot } from '../dashboardMetricsService.js';
import { defaultDashboardPeriod } from '../dashboardMetricsHelpers.js';
import type { DashboardFilters } from '../dashboardMetricsTypes.js';
import type { RentalArBreakdown, RentalSummaryFilters, RentalSummaryResponse } from './types.js';

const SECURITY_INVOICE_SQL = `(
  i.invoice_type = 'Security Deposit'
  OR COALESCE(i.security_deposit_charge, 0) > 0
  OR LOWER(COALESCE(i.description, '')) LIKE '%security%'
)`;

async function sumOwnerPayables(client: pg.PoolClient, tenantId: string): Promise<number> {
  const r = await client.query<{ total: string }>(
    `SELECT COALESCE(SUM(GREATEST(balance, 0)), 0)::text AS total
     FROM owner_balances WHERE tenant_id = $1`,
    [tenantId]
  );
  return Number(r.rows[0]?.total ?? 0);
}

async function countOverdueInvoices(client: pg.PoolClient, tenantId: string): Promise<number> {
  const r = await client.query<{ c: string }>(
    `SELECT COUNT(*)::text AS c
     FROM invoices i
     WHERE i.tenant_id = $1
       AND i.deleted_at IS NULL
       AND i.invoice_type IN ('Rental', 'Service Charge')
       AND i.due_date < CURRENT_DATE
       AND GREATEST(i.amount - COALESCE(i.paid_amount, 0), 0) > 0
       AND (i.description IS NULL OR i.description NOT LIKE '%VOIDED%')`,
    [tenantId]
  );
  return Number(r.rows[0]?.c ?? 0);
}

function buildAgreementFilter(
  filters: RentalSummaryFilters,
  startIndex: number
): { sql: string; params: unknown[] } {
  const clauses: string[] = [];
  const params: unknown[] = [];
  let idx = startIndex;

  const status = (filters.status ?? 'all').toLowerCase();
  if (status === 'active') {
    clauses.push(`ra.status = 'Active'`);
  } else if (status === 'renewed') {
    clauses.push(`ra.status = 'Renewed'`);
  } else if (status === 'terminated') {
    clauses.push(`ra.status IN ('Terminated', 'Expired')`);
  } else if (status === 'expiring') {
    clauses.push(`ra.status = 'Active'`);
    clauses.push(`ra.end_date <= (CURRENT_DATE + INTERVAL '30 days')`);
    clauses.push(`ra.end_date >= CURRENT_DATE`);
  }

  if (filters.propertyId) {
    clauses.push(`ra.property_id = $${idx++}`);
    params.push(filters.propertyId);
  }
  if (filters.buildingId) {
    clauses.push(`EXISTS (
      SELECT 1 FROM properties p
      WHERE p.id = ra.property_id AND p.tenant_id = ra.tenant_id
        AND p.building_id = $${idx} AND p.deleted_at IS NULL
    )`);
    params.push(filters.buildingId);
    idx++;
  }

  const search = filters.search?.trim();
  if (search) {
    clauses.push(`(
      ra.agreement_number ILIKE $${idx}
      OR EXISTS (SELECT 1 FROM contacts c WHERE c.id = ra.contact_id AND c.tenant_id = ra.tenant_id AND c.name ILIKE $${idx})
      OR EXISTS (SELECT 1 FROM properties p WHERE p.id = ra.property_id AND p.tenant_id = ra.tenant_id AND p.name ILIKE $${idx})
    )`);
    params.push(`%${search}%`);
    idx++;
  }

  return { sql: clauses.length ? ` AND ${clauses.join(' AND ')}` : '', params };
}

async function aggregateActiveRentSecurity(
  client: pg.PoolClient,
  tenantId: string,
  filterSql: string,
  filterParams: unknown[]
): Promise<{ activeMonthlyRent: number; activeSecurityDeposits: number; activeAgreements: number; expiringAgreementsCount: number }> {
  const r = await client.query<{
    rent: string;
    security: string;
    active_count: string;
    expiring_count: string;
  }>(
    `SELECT
       COALESCE(SUM(CASE WHEN ra.status = 'Active' THEN COALESCE(ra.monthly_rent, 0) ELSE 0 END), 0)::text AS rent,
       COALESCE(SUM(CASE WHEN ra.status = 'Active' THEN COALESCE(ra.security_deposit, 0) ELSE 0 END), 0)::text AS security,
       COUNT(*) FILTER (WHERE ra.status = 'Active')::text AS active_count,
       COUNT(*) FILTER (
         WHERE ra.status = 'Active'
           AND ra.end_date <= (CURRENT_DATE + INTERVAL '30 days')
           AND ra.end_date >= CURRENT_DATE
       )::text AS expiring_count
     FROM rental_agreements ra
     WHERE ra.tenant_id = $1 AND ra.deleted_at IS NULL${filterSql}`,
    [tenantId, ...filterParams]
  );
  const row = r.rows[0];
  return {
    activeMonthlyRent: Number(row?.rent ?? 0),
    activeSecurityDeposits: Number(row?.security ?? 0),
    activeAgreements: Number(row?.active_count ?? 0),
    expiringAgreementsCount: Number(row?.expiring_count ?? 0),
  };
}

async function computeArBreakdown(
  client: pg.PoolClient,
  tenantId: string
): Promise<RentalArBreakdown> {
  const r = await client.query<{
    rental_due: string;
    rental_paid: string;
    security_due: string;
    security_paid: string;
    invoice_count: string;
  }>(
    `SELECT
       COALESCE(SUM(CASE WHEN NOT ${SECURITY_INVOICE_SQL} AND i.status <> 'Paid'
         THEN GREATEST(i.amount - COALESCE(i.paid_amount, 0), 0) ELSE 0 END), 0)::text AS rental_due,
       COALESCE(SUM(CASE WHEN NOT ${SECURITY_INVOICE_SQL} AND i.status IN ('Paid', 'Partially Paid')
         THEN COALESCE(i.paid_amount, 0) ELSE 0 END), 0)::text AS rental_paid,
       COALESCE(SUM(CASE WHEN ${SECURITY_INVOICE_SQL} AND i.status <> 'Paid'
         THEN GREATEST(i.amount - COALESCE(i.paid_amount, 0), 0) ELSE 0 END), 0)::text AS security_due,
       COALESCE(SUM(CASE WHEN ${SECURITY_INVOICE_SQL} AND i.status IN ('Paid', 'Partially Paid')
         THEN COALESCE(i.paid_amount, 0) ELSE 0 END), 0)::text AS security_paid,
       COUNT(*)::text AS invoice_count
     FROM invoices i
     WHERE i.tenant_id = $1
       AND i.deleted_at IS NULL
       AND i.invoice_type IN ('Rental', 'Security Deposit', 'Service Charge')
       AND (i.description IS NULL OR i.description NOT LIKE '%VOIDED%')`,
    [tenantId]
  );
  const row = r.rows[0]!;
  const rentalDueAmount = Number(row.rental_due ?? 0);
  const rentalPaidAmount = Number(row.rental_paid ?? 0);
  const securityDueAmount = Number(row.security_due ?? 0);
  const securityPaidAmount = Number(row.security_paid ?? 0);
  return {
    rentalDueAmount,
    rentalPaidAmount,
    securityDueAmount,
    securityPaidAmount,
    totalDueAmount: rentalDueAmount + securityDueAmount,
    totalPaidAmount: rentalPaidAmount + securityPaidAmount,
    totalInvoiceCount: Number(row.invoice_count ?? 0),
  };
}

export async function getRentalSummary(
  client: pg.PoolClient,
  tenantId: string,
  filters: RentalSummaryFilters = {}
): Promise<RentalSummaryResponse> {
  const period = defaultDashboardPeriod();
  const dashboardFilters: DashboardFilters = {
    from: period.from,
    to: period.to,
    comparisonPeriod: 'none',
    buildingId: filters.buildingId,
    propertyId: filters.propertyId,
  };

  const agreementFilter = buildAgreementFilter(filters, 2);

  const [snapshot, ownerPayables, overdueInvoices, rentSecurity, arBreakdown] = await Promise.all([
    computeSnapshot(client, tenantId, dashboardFilters),
    sumOwnerPayables(client, tenantId),
    countOverdueInvoices(client, tenantId),
    aggregateActiveRentSecurity(client, tenantId, agreementFilter.sql, agreementFilter.params),
    filters.includeArBreakdown ? computeArBreakdown(client, tenantId) : Promise.resolve(undefined),
  ]);

  return {
    generatedAt: new Date().toISOString(),
    occupancyRate: snapshot.occupancyRate,
    activeAgreements: rentSecurity.activeAgreements,
    overdueInvoices,
    ownerPayables,
    activeMonthlyRent: rentSecurity.activeMonthlyRent,
    activeSecurityDeposits: rentSecurity.activeSecurityDeposits,
    expiringAgreementsCount: rentSecurity.expiringAgreementsCount,
    arBreakdown,
  };
}
