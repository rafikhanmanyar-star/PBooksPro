import { Router } from 'express';
import { z } from 'zod';
import { getPool } from '../../../db/pool.js';
import { sendFailure, sendSuccess, handleRouteError } from '../../../utils/apiResponse.js';
import { getTemplateCatalog } from '../../../constants/emailAutomation.js';
import {
  createCampaign,
  getAutomationStats,
  launchCampaign,
} from '../../../services/emailAutomation/emailAutomationCampaignService.js';

export const adminEmailAutomationRouter = Router();

adminEmailAutomationRouter.get('/admin/email-automation/templates', (_req, res) => {
  sendSuccess(res, { templates: getTemplateCatalog() });
});

adminEmailAutomationRouter.get('/admin/email-automation/stats', async (_req, res) => {
  const client = await getPool().connect();
  try {
    const stats = await getAutomationStats(client);
    sendSuccess(res, stats);
  } catch (e) {
    handleRouteError(res, e, { route: 'GET /admin/email-automation/stats' });
  } finally {
    client.release();
  }
});

adminEmailAutomationRouter.get('/admin/email-automation/queue', async (req, res) => {
  const limit = Math.min(Number(req.query.limit ?? 50), 200);
  const status = typeof req.query.status === 'string' ? req.query.status : undefined;
  const client = await getPool().connect();
  try {
    const { rows } = await client.query(
      `SELECT id, tenant_id, recipient_email, event_type, subject, status,
              scheduled_at, sent_at, opened_at, clicked_at, error, created_at
       FROM email_automation_queue
       WHERE ($1::text IS NULL OR status = $1)
       ORDER BY created_at DESC
       LIMIT $2`,
      [status ?? null, limit]
    );
    sendSuccess(res, { items: rows });
  } catch (e) {
    handleRouteError(res, e, { route: 'GET /admin/email-automation/queue' });
  } finally {
    client.release();
  }
});

adminEmailAutomationRouter.get('/admin/email-automation/campaigns', async (req, res) => {
  const limit = Math.min(Number(req.query.limit ?? 50), 100);
  const client = await getPool().connect();
  try {
    const { rows } = await client.query(
      `SELECT id, name, event_type, subject, status, scheduled_at, started_at, completed_at, stats, created_at
       FROM email_automation_campaigns
       ORDER BY created_at DESC
       LIMIT $1`,
      [limit]
    );
    sendSuccess(res, { campaigns: rows });
  } catch (e) {
    handleRouteError(res, e, { route: 'GET /admin/email-automation/campaigns' });
  } finally {
    client.release();
  }
});

const campaignSchema = z.object({
  name: z.string().min(1).max(200),
  eventType: z.enum(['new_feature_announcement', 're_engagement_campaign']),
  subject: z.string().min(1).max(300),
  templateKey: z.string().min(1).max(100),
  bodyOverride: z.string().max(8000).optional(),
  featureTitle: z.string().max(300).optional(),
  featureBody: z.string().max(8000).optional(),
  scheduledAt: z.string().datetime().optional(),
  targetFilter: z
    .object({
      subscriptionStatus: z.array(z.string()).optional(),
      inactiveDaysMin: z.number().int().min(0).optional(),
    })
    .optional(),
  launchNow: z.boolean().optional(),
});

adminEmailAutomationRouter.post('/admin/email-automation/campaigns', async (req, res) => {
  if (process.env.EMAIL_AUTOMATION_ENABLED !== 'true') {
    sendFailure(res, 503, 'EMAIL_AUTOMATION_DISABLED', 'Email automation is not enabled.');
    return;
  }

  const parsed = campaignSchema.safeParse(req.body);
  if (!parsed.success) {
    sendFailure(res, 400, 'VALIDATION_ERROR', parsed.error.message);
    return;
  }

  const client = await getPool().connect();
  try {
    const campaignId = await createCampaign(client, {
      name: parsed.data.name,
      eventType: parsed.data.eventType,
      subject: parsed.data.subject,
      templateKey: parsed.data.templateKey,
      bodyOverride: parsed.data.bodyOverride ?? parsed.data.featureBody,
      targetFilter: parsed.data.targetFilter,
      scheduledAt: parsed.data.scheduledAt ? new Date(parsed.data.scheduledAt) : undefined,
      createdBy: (req as { userId?: string }).userId,
      featureTitle: parsed.data.featureTitle,
      featureBody: parsed.data.featureBody,
    });

    let launch = { queued: 0 };
    if (parsed.data.launchNow && !parsed.data.scheduledAt) {
      launch = await launchCampaign(client, campaignId);
    }

    sendSuccess(res, { campaignId, ...launch }, 201);
  } catch (e) {
    handleRouteError(res, e, { route: 'POST /admin/email-automation/campaigns' });
  } finally {
    client.release();
  }
});

adminEmailAutomationRouter.post('/admin/email-automation/campaigns/:id/launch', async (req, res) => {
  if (process.env.EMAIL_AUTOMATION_ENABLED !== 'true') {
    sendFailure(res, 503, 'EMAIL_AUTOMATION_DISABLED', 'Email automation is not enabled.');
    return;
  }

  const client = await getPool().connect();
  try {
    const result = await launchCampaign(client, String(req.params.id));
    sendSuccess(res, result);
  } catch (e) {
    handleRouteError(res, e, { route: 'POST /admin/email-automation/campaigns/:id/launch' });
  } finally {
    client.release();
  }
});
