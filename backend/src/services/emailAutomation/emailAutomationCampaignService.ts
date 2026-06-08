import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import type { EmailAutomationEventType } from '../../constants/emailAutomation.js';
import { enqueueAutomationEmail } from './emailAutomationQueueService.js';

export type CampaignTargetFilter = {
  subscriptionStatus?: string[];
  inactiveDaysMin?: number;
};

export type CreateCampaignInput = {
  name: string;
  eventType: 'new_feature_announcement' | 're_engagement_campaign';
  subject: string;
  templateKey: string;
  bodyOverride?: string;
  targetFilter?: CampaignTargetFilter;
  scheduledAt?: Date;
  createdBy?: string;
  featureTitle?: string;
  featureBody?: string;
};

export async function createCampaign(
  client: pg.PoolClient,
  input: CreateCampaignInput
): Promise<string> {
  const id = randomUUID();
  await client.query(
    `INSERT INTO email_automation_campaigns (
       id, name, event_type, subject, template_key, body_override, target_filter,
       status, scheduled_at, created_by, stats
     ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, 'draft', $8, $9, '{}'::jsonb)`,
    [
      id,
      input.name,
      input.eventType,
      input.subject,
      input.templateKey,
      input.bodyOverride ?? null,
      JSON.stringify(input.targetFilter ?? {}),
      input.scheduledAt?.toISOString() ?? null,
      input.createdBy ?? null,
    ]
  );
  return id;
}

async function resolveCampaignRecipients(
  client: pg.PoolClient,
  filter: CampaignTargetFilter
): Promise<Array<{ tenant_id: string; email: string; name: string | null }>> {
  const statuses = filter.subscriptionStatus?.length
    ? filter.subscriptionStatus
    : ['active', 'trialing', 'expired', 'canceled'];

  const inactiveDays = filter.inactiveDaysMin ?? 0;

  const { rows } = await client.query<{ tenant_id: string; email: string; name: string }>(
    `SELECT DISTINCT ON (u.tenant_id) u.tenant_id, u.email, u.name
     FROM users u
     INNER JOIN subscriptions s ON s.tenant_id = u.tenant_id
     WHERE u.is_active = TRUE
       AND u.email IS NOT NULL AND TRIM(u.email) <> ''
       AND s.status = ANY($1::text[])
       AND (
         $2::int = 0
         OR s.updated_at < NOW() - ($2::int * INTERVAL '1 day')
         OR s.status IN ('expired', 'canceled')
       )
     ORDER BY u.tenant_id, CASE WHEN u.role = 'Admin' THEN 0 ELSE 1 END, u.created_at ASC`,
    [statuses, inactiveDays]
  );

  return rows.map((r) => ({
    tenant_id: r.tenant_id,
    email: r.email.trim().toLowerCase(),
    name: r.name?.trim() || null,
  }));
}

export async function launchCampaign(
  client: pg.PoolClient,
  campaignId: string
): Promise<{ queued: number }> {
  const { rows } = await client.query<{
    id: string;
    event_type: EmailAutomationEventType;
    subject: string;
    template_key: string;
    body_override: string | null;
    target_filter: CampaignTargetFilter;
    status: string;
  }>(`SELECT * FROM email_automation_campaigns WHERE id = $1`, [campaignId]);

  const campaign = rows[0];
  if (!campaign) throw new Error('Campaign not found.');
  if (campaign.status === 'completed' || campaign.status === 'sending') {
    throw new Error('Campaign already launched.');
  }

  await client.query(
    `UPDATE email_automation_campaigns SET status = 'sending', started_at = NOW(), updated_at = NOW() WHERE id = $1`,
    [campaignId]
  );

  const recipients = await resolveCampaignRecipients(client, campaign.target_filter ?? {});
  let queued = 0;

  for (const recipient of recipients) {
    const id = await enqueueAutomationEmail(client, {
      tenantId: recipient.tenant_id,
      recipientEmail: recipient.email,
      recipientName: recipient.name,
      eventType: campaign.event_type,
      dedupeKey: `${campaignId}:${recipient.tenant_id}:${recipient.email}`,
      campaignId,
      subjectOverride: campaign.subject,
      templateKeyOverride: campaign.template_key,
      customBody: campaign.body_override ?? undefined,
      metadata: {
        featureTitle: campaign.subject,
        featureBody: campaign.body_override ?? undefined,
        customBody: campaign.body_override ?? undefined,
      },
    });
    if (id) queued += 1;
  }

  await client.query(
    `UPDATE email_automation_campaigns
     SET status = 'completed', completed_at = NOW(), updated_at = NOW(),
         stats = jsonb_build_object('queued', $2::int, 'recipients', $3::int)
     WHERE id = $1`,
    [campaignId, queued, recipients.length]
  );

  return { queued };
}

export async function processScheduledCampaigns(client: pg.PoolClient): Promise<number> {
  const { rows } = await client.query<{ id: string }>(
    `SELECT id FROM email_automation_campaigns
     WHERE status = 'draft' AND scheduled_at IS NOT NULL AND scheduled_at <= NOW()
     ORDER BY scheduled_at ASC
     LIMIT 10`
  );

  let launched = 0;
  for (const row of rows) {
    await launchCampaign(client, row.id);
    launched += 1;
  }
  return launched;
}

export async function getAutomationStats(client: pg.PoolClient) {
  const { rows } = await client.query<{
    pending: string;
    sent: string;
    failed: string;
    opened: string;
    clicked: string;
    unsubscribed: string;
  }>(
    `SELECT
       (SELECT COUNT(*)::text FROM email_automation_queue WHERE status = 'pending') AS pending,
       (SELECT COUNT(*)::text FROM email_automation_queue WHERE status = 'sent') AS sent,
       (SELECT COUNT(*)::text FROM email_automation_queue WHERE status = 'failed') AS failed,
       (SELECT COUNT(*)::text FROM email_automation_queue WHERE opened_at IS NOT NULL) AS opened,
       (SELECT COUNT(*)::text FROM email_automation_queue WHERE clicked_at IS NOT NULL) AS clicked,
       (SELECT COUNT(*)::text FROM email_automation_unsubscribes) AS unsubscribed`
  );
  const row = rows[0];
  return {
    pending: Number(row?.pending ?? 0),
    sent: Number(row?.sent ?? 0),
    failed: Number(row?.failed ?? 0),
    opened: Number(row?.opened ?? 0),
    clicked: Number(row?.clicked ?? 0),
    unsubscribed: Number(row?.unsubscribed ?? 0),
  };
}
