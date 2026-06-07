import type { MarketingLeadRow } from './marketingLeadService.js';

export type CrmLeadPayload = {
  externalId: string;
  email: string;
  firstName: string;
  lastName: string;
  fullName: string;
  company: string | null;
  country: string | null;
  leadSource: string;
  leadMagnet: string | null;
  status: string;
  tags: string[];
  customFields: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

function splitName(name: string | null): { firstName: string; lastName: string } {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: '', lastName: '' };
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

export function toCrmLeadPayload(row: MarketingLeadRow): CrmLeadPayload {
  const { firstName, lastName } = splitName(row.name);
  const tags = [row.source];
  if (row.lead_magnet) tags.push(row.lead_magnet);

  return {
    externalId: row.crm_external_id || row.id,
    email: row.email,
    firstName,
    lastName,
    fullName: row.name || row.email,
    company: row.company,
    country: row.country,
    leadSource: row.source,
    leadMagnet: row.lead_magnet,
    status: row.status,
    tags,
    customFields: {
      utmSource: row.utm_source,
      utmMedium: row.utm_medium,
      utmCampaign: row.utm_campaign,
      pageUrl: row.page_url,
      ...(row.metadata || {}),
    },
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
