import { getPool } from '../../db/pool.js';
import type { MarketingLeadRow } from './marketingLeadService.js';
import { LEAD_STATUSES, type LeadStatus, isLeadStatus } from './marketingLeadService.js';

export type LeadListFilters = {
  search?: string;
  source?: string;
  status?: string;
  campaign?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
};

export type LeadListResult = {
  leads: MarketingLeadRow[];
  total: number;
};

const STATUS_CSV_LABELS: Record<string, string> = {
  new: 'New',
  contacted: 'Contacted',
  qualified: 'Qualified',
  demo_scheduled: 'Demo Scheduled',
  trial_started: 'Trial Started',
  customer: 'Customer',
};

function escapeCsv(value: string | null | undefined): string {
  const s = value ?? '';
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function buildWhere(filters: LeadListFilters): { clause: string; params: unknown[] } {
  const params: unknown[] = [];
  const parts: string[] = ['WHERE 1=1'];
  let i = 1;

  if (filters.search?.trim()) {
    parts.push(
      `AND (
        name ILIKE $${i} OR company ILIKE $${i} OR email ILIKE $${i}
        OR mobile ILIKE $${i} OR campaign ILIKE $${i}
      )`
    );
    params.push(`%${filters.search.trim()}%`);
    i++;
  }
  if (filters.source?.trim()) {
    parts.push(`AND source = $${i++}`);
    params.push(filters.source.trim());
  }
  if (filters.status?.trim()) {
    parts.push(`AND status = $${i++}`);
    params.push(filters.status.trim());
  }
  if (filters.campaign?.trim()) {
    parts.push(`AND campaign ILIKE $${i++}`);
    params.push(`%${filters.campaign.trim()}%`);
  }
  if (filters.from?.trim()) {
    parts.push(`AND created_at >= $${i++}::timestamptz`);
    params.push(filters.from.trim());
  }
  if (filters.to?.trim()) {
    parts.push(`AND created_at <= $${i++}::timestamptz`);
    params.push(filters.to.trim());
  }

  return { clause: parts.join('\n'), params };
}

const LEAD_SELECT = `SELECT id, source, lead_magnet, name, email, company, country, mobile, campaign, status,
  utm_source, utm_medium, utm_campaign, page_url, user_agent, ip_address,
  crm_external_id, metadata, created_at, updated_at`;

export async function listLeadsForAdmin(filters: LeadListFilters = {}): Promise<LeadListResult> {
  const pool = getPool();
  const limit = Math.min(Math.max(filters.limit ?? 50, 1), 500);
  const offset = Math.max(filters.offset ?? 0, 0);
  const { clause, params } = buildWhere(filters);

  const countR = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM marketing_leads ${clause}`,
    params
  );
  const total = parseInt(countR.rows[0]?.count ?? '0', 10);

  const listParams = [...params, limit, offset];
  const r = await pool.query<MarketingLeadRow>(
    `${LEAD_SELECT}
     FROM marketing_leads
     ${clause}
     ORDER BY created_at DESC
     LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
    listParams
  );

  return { leads: r.rows, total };
}

export async function updateLeadStatus(id: string, status: LeadStatus): Promise<MarketingLeadRow | null> {
  if (!isLeadStatus(status)) {
    throw new Error(`Invalid lead status: ${status}`);
  }
  const pool = getPool();
  const r = await pool.query<MarketingLeadRow>(
    `${LEAD_SELECT}
     FROM marketing_leads
     WHERE id = $1`,
    [id]
  );
  if (!r.rows[0]) return null;

  const updated = await pool.query<MarketingLeadRow>(
    `UPDATE marketing_leads SET status = $2, updated_at = NOW() WHERE id = $1
     RETURNING id, source, lead_magnet, name, email, company, country, mobile, campaign, status,
       utm_source, utm_medium, utm_campaign, page_url, user_agent, ip_address,
       crm_external_id, metadata, created_at, updated_at`,
    [id, status]
  );
  return updated.rows[0] ?? null;
}

export async function getLeadStats(): Promise<{
  total: number;
  byStatus: Record<string, number>;
  bySource: Record<string, number>;
  last7Days: number;
}> {
  const pool = getPool();
  const [totalR, statusR, sourceR, recentR] = await Promise.all([
    pool.query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM marketing_leads`),
    pool.query<{ status: string; count: string }>(
      `SELECT status, COUNT(*)::text AS count FROM marketing_leads GROUP BY status`
    ),
    pool.query<{ source: string; count: string }>(
      `SELECT source, COUNT(*)::text AS count FROM marketing_leads GROUP BY source ORDER BY count DESC`
    ),
    pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM marketing_leads WHERE created_at >= NOW() - INTERVAL '7 days'`
    ),
  ]);

  const byStatus: Record<string, number> = {};
  for (const row of statusR.rows) byStatus[row.status] = parseInt(row.count, 10);
  for (const s of LEAD_STATUSES) {
    if (byStatus[s] === undefined) byStatus[s] = 0;
  }

  const bySource: Record<string, number> = {};
  for (const row of sourceR.rows) bySource[row.source] = parseInt(row.count, 10);

  return {
    total: parseInt(totalR.rows[0]?.count ?? '0', 10),
    byStatus,
    bySource,
    last7Days: parseInt(recentR.rows[0]?.count ?? '0', 10),
  };
}

export function leadsToCsv(leads: MarketingLeadRow[]): string {
  const header = 'Name,Company,Email,Mobile,Source,Campaign,Date,Lead Status';
  const rows = leads.map((l) =>
    [
      escapeCsv(l.name),
      escapeCsv(l.company),
      escapeCsv(l.email),
      escapeCsv(l.mobile),
      escapeCsv(l.source),
      escapeCsv(l.campaign || l.utm_campaign),
      escapeCsv(l.created_at ? new Date(l.created_at).toISOString() : ''),
      escapeCsv(STATUS_CSV_LABELS[l.status] || l.status),
    ].join(',')
  );
  return [header, ...rows].join('\n');
}

export async function exportLeadsCsv(filters: LeadListFilters = {}): Promise<string> {
  const { leads } = await listLeadsForAdmin({ ...filters, limit: 10000, offset: 0 });
  return leadsToCsv(leads);
}
