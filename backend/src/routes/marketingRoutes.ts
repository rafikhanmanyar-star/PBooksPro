import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { withTransaction } from '../db/pool.js';
import { sendFailure, sendSuccess, handleRouteError } from '../utils/apiResponse.js';
import { publicIntrospectionLimiter } from '../middleware/introspectionGuard.js';
import { createMarketingLead, listLeadsForCrmExport } from '../services/marketing/marketingLeadService.js';
import { toCrmLeadPayload } from '../services/marketing/crmLeadMapper.js';
import { getSequenceCatalog } from '../services/marketing/emailSequenceService.js';
import { getMarketingTemplateCatalog } from '../constants/marketingEmailTemplates.js';

export const marketingRouter = Router();

const leadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 25,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    data: null,
    error: { code: 'RATE_LIMIT', message: 'Too many submissions. Please try again later.' },
  },
});

const leadSchema = z.object({
  source: z.enum([
    'checklist',
    'newsletter',
    'exit_intent',
    'contact_form',
    'trial_signup',
    'pricing_cta',
  ]),
  leadMagnet: z.string().max(200).optional(),
  name: z.string().max(200).optional(),
  email: z.string().email().max(320),
  company: z.string().max(200).optional(),
  country: z.string().max(120).optional(),
  mobile: z.string().max(40).optional(),
  campaign: z.string().max(200).optional(),
  utmSource: z.string().max(120).optional(),
  utmMedium: z.string().max(120).optional(),
  utmCampaign: z.string().max(120).optional(),
  pageUrl: z.string().max(2000).optional(),
  metadata: z.record(z.unknown()).optional(),
});

const newsletterSchema = z.object({
  email: z.string().email().max(320),
  name: z.string().max(200).optional(),
  pageUrl: z.string().max(2000).optional(),
});

function marketingEnabled(): boolean {
  return process.env.MARKETING_LEADS_ENABLED === 'true';
}

function clientIp(req: { ip?: string; headers: Record<string, unknown> }): string | undefined {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') return forwarded.split(',')[0]?.trim();
  return req.ip;
}

marketingRouter.get('/marketing/sequences', publicIntrospectionLimiter, (_req, res) => {
  sendSuccess(res, { sequences: getSequenceCatalog() });
});

marketingRouter.get('/marketing/email-templates', publicIntrospectionLimiter, (_req, res) => {
  sendSuccess(res, { templates: getMarketingTemplateCatalog() });
});

marketingRouter.post('/marketing/leads', leadLimiter, async (req, res) => {
  if (!marketingEnabled()) {
    sendFailure(res, 503, 'MARKETING_DISABLED', 'Lead capture is not enabled on this server.');
    return;
  }

  try {
    const body = leadSchema.parse(req.body ?? {});
    const result = await withTransaction((client) =>
      createMarketingLead(client, {
        ...body,
        userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : undefined,
        ipAddress: clientIp(req),
      })
    );

    sendSuccess(res, {
      leadId: result.lead.id,
      crmExternalId: result.lead.crm_external_id,
      isNew: result.isNew,
      downloadUrl:
        process.env.MARKETING_CHECKLIST_URL ||
        '/assets/checklists/property-management-accounting-checklist.html',
      crm: toCrmLeadPayload(result.lead),
    }, result.isNew ? 201 : 200);
  } catch (e) {
    handleRouteError(res, e, { route: 'POST /marketing/leads' });
  }
});

marketingRouter.post('/marketing/newsletter', leadLimiter, async (req, res) => {
  if (!marketingEnabled()) {
    sendFailure(res, 503, 'MARKETING_DISABLED', 'Newsletter signup is not enabled on this server.');
    return;
  }

  try {
    const body = newsletterSchema.parse(req.body ?? {});
    const result = await withTransaction((client) =>
      createMarketingLead(client, {
        source: 'newsletter',
        leadMagnet: 'newsletter',
        name: body.name,
        email: body.email,
        pageUrl: body.pageUrl,
        userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : undefined,
        ipAddress: clientIp(req),
      })
    );

    sendSuccess(res, {
      subscribed: true,
      leadId: result.lead.id,
      isNew: result.isNew,
    }, result.isNew ? 201 : 200);
  } catch (e) {
    handleRouteError(res, e, { route: 'POST /marketing/newsletter' });
  }
});

/** CRM sync endpoint — protect with MARKETING_CRM_EXPORT_SECRET */
marketingRouter.get('/marketing/leads/export', async (req, res) => {
  const secret = process.env.MARKETING_CRM_EXPORT_SECRET?.trim();
  if (!secret || req.header('x-crm-export-secret') !== secret) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Invalid export credentials.');
    return;
  }
  if (!marketingEnabled()) {
    sendFailure(res, 503, 'MARKETING_DISABLED', 'Marketing module disabled.');
    return;
  }

  try {
    const since = typeof req.query.since === 'string' ? req.query.since : undefined;
    const leads = await listLeadsForCrmExport(since);
    sendSuccess(res, {
      exportedAt: new Date().toISOString(),
      count: leads.length,
      leads: leads.map(toCrmLeadPayload),
    });
  } catch (e) {
    handleRouteError(res, e, { route: 'GET /marketing/leads/export' });
  }
});
