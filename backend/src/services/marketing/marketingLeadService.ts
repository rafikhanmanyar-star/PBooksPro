import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { getPool } from '../../db/pool.js';
import { enrollLeadInSequence } from './emailSequenceService.js';

export type MarketingLeadRow = {
  id: string;
  source: string;
  lead_magnet: string | null;
  name: string | null;
  email: string;
  company: string | null;
  country: string | null;
  status: string;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  page_url: string | null;
  user_agent: string | null;
  ip_address: string | null;
  crm_external_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type CreateLeadInput = {
  source: 'checklist' | 'newsletter' | 'exit_intent';
  leadMagnet?: string;
  name?: string;
  email: string;
  company?: string;
  country?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  pageUrl?: string;
  userAgent?: string;
  ipAddress?: string;
  metadata?: Record<string, unknown>;
};

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function createMarketingLead(
  client: pg.PoolClient,
  input: CreateLeadInput
): Promise<{ lead: MarketingLeadRow; isNew: boolean; enrollmentId?: string }> {
  const email = normalizeEmail(input.email);
  if (!email || !email.includes('@')) {
    throw new Error('Valid email is required.');
  }

  const existing = await client.query<MarketingLeadRow>(
    `SELECT id, source, lead_magnet, name, email, company, country, status,
            utm_source, utm_medium, utm_campaign, page_url, user_agent, ip_address,
            crm_external_id, metadata, created_at, updated_at
     FROM marketing_leads
     WHERE LOWER(email) = LOWER($1) AND source = $2
     ORDER BY created_at DESC
     LIMIT 1`,
    [email, input.source]
  );

  if (existing.rows.length > 0) {
    const row = existing.rows[0];
    await client.query(
      `UPDATE marketing_leads SET
         name = COALESCE($2, name),
         company = COALESCE($3, company),
         country = COALESCE($4, country),
         page_url = COALESCE($5, page_url),
         updated_at = NOW()
       WHERE id = $1`,
      [row.id, input.name ?? null, input.company ?? null, input.country ?? null, input.pageUrl ?? null]
    );
    const refreshed = await getLeadById(client, row.id);
    return { lead: refreshed!, isNew: false };
  }

  const id = randomUUID();
  const crmExternalId = `pbooks-lead-${id.slice(0, 8)}`;

  const insert = await client.query<MarketingLeadRow>(
    `INSERT INTO marketing_leads (
       id, source, lead_magnet, name, email, company, country, status,
       utm_source, utm_medium, utm_campaign, page_url, user_agent, ip_address,
       crm_external_id, metadata
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,'new',$8,$9,$10,$11,$12,$13,$14,$15::jsonb)
     RETURNING id, source, lead_magnet, name, email, company, country, status,
               utm_source, utm_medium, utm_campaign, page_url, user_agent, ip_address,
               crm_external_id, metadata, created_at, updated_at`,
    [
      id,
      input.source,
      input.leadMagnet ?? null,
      input.name?.trim() || null,
      email,
      input.company?.trim() || null,
      input.country?.trim() || null,
      input.utmSource ?? null,
      input.utmMedium ?? null,
      input.utmCampaign ?? null,
      input.pageUrl ?? null,
      input.userAgent ?? null,
      input.ipAddress ?? null,
      crmExternalId,
      JSON.stringify(input.metadata ?? {}),
    ]
  );

  const lead = insert.rows[0];
  const enrollmentId = await enrollLeadInSequence(client, lead.id, input.source);

  return { lead, isNew: true, enrollmentId: enrollmentId ?? undefined };
}

export async function getLeadById(
  client: pg.PoolClient,
  id: string
): Promise<MarketingLeadRow | null> {
  const r = await client.query<MarketingLeadRow>(
    `SELECT id, source, lead_magnet, name, email, company, country, status,
            utm_source, utm_medium, utm_campaign, page_url, user_agent, ip_address,
            crm_external_id, metadata, created_at, updated_at
     FROM marketing_leads WHERE id = $1`,
    [id]
  );
  return r.rows[0] ?? null;
}

export async function listLeadsForCrmExport(
  since?: string,
  limit = 500
): Promise<MarketingLeadRow[]> {
  const pool = getPool();
  const params: unknown[] = [];
  let where = '';
  if (since) {
    params.push(since);
    where = `WHERE created_at >= $1`;
  }
  params.push(limit);
  const r = await pool.query<MarketingLeadRow>(
    `SELECT id, source, lead_magnet, name, email, company, country, status,
            utm_source, utm_medium, utm_campaign, page_url, user_agent, ip_address,
            crm_external_id, metadata, created_at, updated_at
     FROM marketing_leads
     ${where}
     ORDER BY created_at DESC
     LIMIT $${params.length}`,
    params
  );
  return r.rows;
}
