import type pg from 'pg';
import { listAccounts } from '../accountsService.js';
import { parseDateOnly, toDateOnlyString } from './dashboardMetricsHelpers.js';
import type {
  LeaseExpiryPoint,
  OccupancyTrendPoint,
  PropertyPerformanceRow,
  RentCollectionPoint,
  RentalAnalyticsFilters,
  RentalAnalyticsResponse,
  RentalKpiValue,
} from './rentalAnalyticsTypes.js';

function monthSlots(year: number): { key: string; label: string; from: string; to: string }[] {
  const slots: { key: string; label: string; from: string; to: string }[] = [];
  for (let m = 0; m < 12; m++) {
    const start = new Date(year, m, 1);
    const end = new Date(year, m + 1, 0);
    slots.push({
      key: `${year}-${String(m + 1).padStart(2, '0')}`,
      label: start.toLocaleString('en-US', { month: 'short' }),
      from: toDateOnlyString(start),
      to: toDateOnlyString(end),
    });
  }
  return slots;
}

async function securityDepositBalance(client: pg.PoolClient, tenantId: string): Promise<number> {
  const accounts = await listAccounts(client, tenantId);
  const sec = accounts.find((a) => a.name.toLowerCase() === 'security deposit' && !a.deleted_at);
  return sec ? Number(sec.balance) : 0;
}

export async function getRentalAnalyticsJson(
  client: pg.PoolClient,
  tenantId: string,
  filters: RentalAnalyticsFilters
): Promise<RentalAnalyticsResponse> {
  const { from, to, propertyId, buildingId } = filters;
  const year = parseDateOnly(to).getFullYear();
  const monthStart = `${to.slice(0, 7)}-01`;
  const monthEnd = to;

  const propFilterRange = propertyId ? ' AND i.property_id = $4' : '';
  const propFilterSimple = propertyId ? ' AND i.property_id = $2' : '';
  const propFilterRa = propertyId ? ' AND ra.property_id = $2' : '';

  const [
    occupied,
    totalProps,
    monthlyIncome,
    outstandingRent,
    expiringAgreements,
    securityDeposits,
    activeTenants,
    occupancyTrend,
    rentCollection,
    propertyPerf,
    leaseExpiry,
  ] = await Promise.all([
    client.query<{ c: string }>(
      `SELECT COUNT(DISTINCT ra.property_id)::text AS c
       FROM rental_agreements ra
       WHERE ra.tenant_id = $1 AND ra.deleted_at IS NULL AND ra.status = 'Active'${propFilterRa}`,
      propertyId ? [tenantId, propertyId] : [tenantId]
    ),
    (() => {
      const params: unknown[] = [tenantId];
      const clauses = ['p.tenant_id = $1', 'p.deleted_at IS NULL'];
      if (propertyId) {
        params.push(propertyId);
        clauses.push(`p.id = $${params.length}`);
      }
      if (buildingId) {
        params.push(buildingId);
        clauses.push(`p.building_id = $${params.length}`);
      }
      return client.query<{ c: string }>(
        `SELECT COUNT(*)::text AS c FROM properties p WHERE ${clauses.join(' AND ')}`,
        params
      );
    })(),
    client.query<{ total: string }>(
      `SELECT COALESCE(SUM(i.amount), 0)::text AS total FROM invoices i
       WHERE i.tenant_id = $1 AND i.deleted_at IS NULL
         AND i.invoice_type IN ('Rental', 'Service Charge')
         AND i.issue_date >= $2::date AND i.issue_date <= $3::date${propFilterRange}`,
      propertyId ? [tenantId, monthStart, monthEnd, propertyId] : [tenantId, monthStart, monthEnd]
    ),
    client.query<{ total: string }>(
      `SELECT COALESCE(SUM(GREATEST(i.amount - COALESCE(i.paid_amount, 0), 0)), 0)::text AS total
       FROM invoices i
       WHERE i.tenant_id = $1 AND i.deleted_at IS NULL
         AND i.invoice_type IN ('Rental', 'Service Charge') AND i.status <> 'Paid'${propFilterSimple}`,
      propertyId ? [tenantId, propertyId] : [tenantId]
    ),
    client.query<{ c: string }>(
      `SELECT COUNT(*)::text AS c FROM rental_agreements ra
       WHERE ra.tenant_id = $1 AND ra.deleted_at IS NULL AND ra.status = 'Active'
         AND ra.end_date >= CURRENT_DATE AND ra.end_date <= CURRENT_DATE + INTERVAL '30 days'${propFilterRa}`,
      propertyId ? [tenantId, propertyId] : [tenantId]
    ),
    securityDepositBalance(client, tenantId),
    client.query<{ c: string }>(
      `SELECT COUNT(DISTINCT ra.contact_id)::text AS c FROM rental_agreements ra
       WHERE ra.tenant_id = $1 AND ra.deleted_at IS NULL AND ra.status = 'Active'${propFilterRa}`,
      propertyId ? [tenantId, propertyId] : [tenantId]
    ),
    buildOccupancyTrend(client, tenantId, year, propertyId),
    buildRentCollectionTrend(client, tenantId, year, propertyId),
    buildPropertyPerformance(client, tenantId, from, to, propertyId, buildingId),
    buildLeaseExpiryForecast(client, tenantId, propertyId),
  ]);

  const occupiedN = Number(occupied.rows[0]?.c ?? 0);
  const totalN = Number(totalProps.rows[0]?.c ?? 0);
  const occupancyRate = totalN > 0 ? (occupiedN / totalN) * 100 : 0;

  const kpis: RentalKpiValue[] = [
    { id: 'occupancyRate', label: 'Occupancy Rate', value: occupancyRate, format: 'percent' },
    { id: 'monthlyRentalIncome', label: 'Monthly Rental Income', value: Number(monthlyIncome.rows[0]?.total ?? 0), format: 'currency' },
    { id: 'outstandingRent', label: 'Outstanding Rent', value: Number(outstandingRent.rows[0]?.total ?? 0), format: 'currency' },
    { id: 'expiringAgreements', label: 'Expiring Agreements (30d)', value: Number(expiringAgreements.rows[0]?.c ?? 0), format: 'count' },
    { id: 'securityDeposits', label: 'Security Deposits', value: securityDeposits, format: 'currency' },
    { id: 'activeTenants', label: 'Active Tenants', value: Number(activeTenants.rows[0]?.c ?? 0), format: 'count' },
  ];

  return {
    filters,
    generatedAt: new Date().toISOString(),
    kpis,
    occupancyTrend,
    rentCollectionTrend: rentCollection,
    propertyPerformance: propertyPerf,
    leaseExpiryForecast: leaseExpiry,
  };
}

async function buildOccupancyTrend(
  client: pg.PoolClient,
  tenantId: string,
  year: number,
  propertyId?: string
): Promise<OccupancyTrendPoint[]> {
  const totalR = await client.query<{ c: string }>(
    `SELECT COUNT(*)::text AS c FROM properties WHERE tenant_id = $1 AND deleted_at IS NULL`,
    [tenantId]
  );
  const total = Number(totalR.rows[0]?.c ?? 0);
  const points: OccupancyTrendPoint[] = [];

  for (const slot of monthSlots(year)) {
    const params: unknown[] = [tenantId, slot.to];
    let propSql = '';
    if (propertyId) {
      params.push(propertyId);
      propSql = ` AND ra.property_id = $${params.length}`;
    }
    const r = await client.query<{ c: string }>(
      `SELECT COUNT(DISTINCT ra.property_id)::text AS c
       FROM rental_agreements ra
       WHERE ra.tenant_id = $1 AND ra.deleted_at IS NULL
         AND ra.start_date <= $2::date AND ra.end_date >= $2::date
         AND ra.status = 'Active'${propSql}`,
      params
    );
    const occupied = Number(r.rows[0]?.c ?? 0);
    points.push({
      month: slot.key,
      label: slot.label,
      occupied,
      total,
      rate: total > 0 ? (occupied / total) * 100 : 0,
    });
  }
  return points;
}

async function buildRentCollectionTrend(
  client: pg.PoolClient,
  tenantId: string,
  year: number,
  propertyId?: string
): Promise<RentCollectionPoint[]> {
  const points: RentCollectionPoint[] = [];
  for (const slot of monthSlots(year)) {
    const params: unknown[] = [tenantId, slot.from, slot.to];
    let propSql = '';
    if (propertyId) {
      params.push(propertyId);
      propSql = ` AND i.property_id = $${params.length}`;
    }
    const r = await client.query<{ due: string; collected: string }>(
      `SELECT COALESCE(SUM(i.amount), 0)::text AS due,
              COALESCE(SUM(i.paid_amount), 0)::text AS collected
       FROM invoices i
       WHERE i.tenant_id = $1 AND i.deleted_at IS NULL
         AND i.invoice_type IN ('Rental', 'Service Charge')
         AND i.issue_date >= $2::date AND i.issue_date <= $3::date${propSql}`,
      params
    );
    points.push({
      month: slot.key,
      label: slot.label,
      due: Number(r.rows[0]?.due ?? 0),
      collected: Number(r.rows[0]?.collected ?? 0),
    });
  }
  return points;
}

async function buildPropertyPerformance(
  client: pg.PoolClient,
  tenantId: string,
  from: string,
  to: string,
  propertyId?: string,
  buildingId?: string
): Promise<PropertyPerformanceRow[]> {
  const params: unknown[] = [tenantId, from, to];
  const clauses = ['p.tenant_id = $1', 'p.deleted_at IS NULL'];
  if (propertyId) {
    params.push(propertyId);
    clauses.push(`p.id = $${params.length}`);
  }
  if (buildingId) {
    params.push(buildingId);
    clauses.push(`p.building_id = $${params.length}`);
  }
  const r = await client.query<{ id: string; name: string; collected: string }>(
    `SELECT p.id, p.name,
            COALESCE(SUM(i.paid_amount), 0)::text AS collected
     FROM properties p
     LEFT JOIN invoices i ON i.property_id = p.id AND i.tenant_id = p.tenant_id
       AND i.deleted_at IS NULL
       AND i.invoice_type IN ('Rental', 'Service Charge')
       AND i.issue_date >= $2::date AND i.issue_date <= $3::date
     WHERE ${clauses.join(' AND ')}
     GROUP BY p.id, p.name
     ORDER BY collected DESC
     LIMIT 15`,
    params
  );
  return r.rows.map((row) => ({
    propertyId: row.id,
    propertyName: row.name,
    collected: Number(row.collected),
  }));
}

async function buildLeaseExpiryForecast(
  client: pg.PoolClient,
  tenantId: string,
  propertyId?: string
): Promise<LeaseExpiryPoint[]> {
  const params: unknown[] = [tenantId];
  let propSql = '';
  if (propertyId) {
    params.push(propertyId);
    propSql = ` AND ra.property_id = $${params.length}`;
  }
  const r = await client.query<{ month: string; c: string }>(
    `SELECT to_char(ra.end_date, 'YYYY-MM') AS month, COUNT(*)::text AS c
     FROM rental_agreements ra
     WHERE ra.tenant_id = $1 AND ra.deleted_at IS NULL AND ra.status = 'Active'
       AND ra.end_date >= CURRENT_DATE${propSql}
     GROUP BY 1
     ORDER BY 1
     LIMIT 12`,
    params
  );
  return r.rows.map((row) => {
    const [y, m] = row.month.split('-').map(Number);
    const d = new Date(y, m - 1, 1);
    return {
      month: row.month,
      label: d.toLocaleString('en-US', { month: 'short', year: 'numeric' }),
      count: Number(row.c),
    };
  });
}
