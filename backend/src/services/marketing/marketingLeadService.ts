import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { getPool } from '../../db/pool.js';
import { enrollLeadInSequence } from './emailSequenceService.js';
import { logger } from '../../utils/logger.js';
import {
  MarketingLeadRepository,
  newMarketingId,
} from '../../modules/marketing/repositories/MarketingRepository.js';

export const LEAD_STATUSES = [
  'new',
  'contacted',
  'qualified',
  'demo_scheduled',
  'trial_started',
  'customer',
] as const;

export type LeadStatus = (typeof LEAD_STATUSES)[number];

export type LeadSource =
  | 'checklist'
  | 'newsletter'
  | 'exit_intent'
  | 'demo_booking'
  | 'contact_form'
  | 'trial_signup'
  | 'pricing_cta';

export function isLeadStatus(value: string): value is LeadStatus {
  return (LEAD_STATUSES as readonly string[]).includes(value);
}

export function defaultStatusForSource(source: string): LeadStatus {
  switch (source) {
    case 'demo_booking':
      return 'demo_scheduled';
    case 'trial_signup':
    case 'pricing_cta':
      return 'trial_started';
    default:
      return 'new';
  }
}

export type MarketingLeadRow = {
  id: string;
  source: string;
  lead_magnet: string | null;
  name: string | null;
  email: string;
  company: string | null;
  country: string | null;
  mobile: string | null;
  campaign: string | null;
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
  source: LeadSource;
  leadMagnet?: string;
  name?: string;
  email: string;
  company?: string;
  country?: string;
  mobile?: string;
  campaign?: string;
  status?: LeadStatus;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  pageUrl?: string;
  userAgent?: string;
  ipAddress?: string;
  metadata?: Record<string, unknown>;
};

const leadRepo = new MarketingLeadRepository();

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

  const campaign = input.campaign?.trim() || input.utmCampaign?.trim() || null;
  const status = input.status ?? defaultStatusForSource(input.source);

  const existing = await leadRepo.findByEmailAndSource(client, email, input.source);

  if (existing) {
    await leadRepo.updateExisting(client, {
      id: existing.id,
      name: input.name ?? null,
      company: input.company ?? null,
      country: input.country ?? null,
      mobile: input.mobile?.trim() || null,
      campaign,
      pageUrl: input.pageUrl ?? null,
      metadataJson: input.metadata ? JSON.stringify(input.metadata) : null,
    });
    const refreshed = await getLeadById(client, existing.id);
    return { lead: refreshed!, isNew: false };
  }

  const id = newMarketingId();
  const crmExternalId = `pbooks-lead-${id.slice(0, 8)}`;

  const lead = await leadRepo.insert(client, {
    ...input,
    id,
    email,
    campaign,
    status,
    crmExternalId,
  });

  let enrollmentId: string | undefined;
  try {
    enrollmentId = (await enrollLeadInSequence(client, lead.id, input.source)) ?? undefined;
  } catch (e) {
    logger.warn('[marketing] Lead saved but email enrollment failed', {
      leadId: lead.id,
      source: input.source,
      error: e instanceof Error ? e.message : String(e),
    });
  }

  return { lead, isNew: true, enrollmentId };
}

export async function setLeadStatus(
  client: pg.PoolClient,
  leadId: string,
  status: LeadStatus
): Promise<void> {
  if (!isLeadStatus(status)) {
    throw new Error(`Invalid lead status: ${status}`);
  }
  await leadRepo.setStatus(client, leadId, status);
}

export async function getLeadById(
  client: pg.PoolClient,
  id: string
): Promise<MarketingLeadRow | null> {
  return leadRepo.getById(client, id);
}

export async function listLeadsForCrmExport(
  since?: string,
  limit = 500
): Promise<MarketingLeadRow[]> {
  return leadRepo.listForExport(getPool(), since, limit);
}
