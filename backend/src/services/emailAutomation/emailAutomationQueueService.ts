import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import {
  categoryForEvent,
  templateForEvent,
  type EmailAutomationEventType,
} from '../../constants/emailAutomation.js';
import { resolveTenantRecipient } from './recipientResolver.js';
import { isEmailUnsubscribed, signUnsubscribe } from './emailAutomationUnsubscribeService.js';
import { getPublicBaseUrl } from './emailAutomationTemplates.js';
import { sendAutomationEmail } from './emailAutomationSender.js';
import { logger } from '../../utils/logger.js';

export type EnqueueEmailInput = {
  tenantId: string | null;
  recipientEmail?: string;
  recipientName?: string | null;
  tenantName?: string | null;
  eventType: EmailAutomationEventType;
  scheduledAt?: Date;
  dedupeKey: string;
  metadata?: Record<string, unknown>;
  campaignId?: string;
  subjectOverride?: string;
  templateKeyOverride?: string;
  customBody?: string;
};

function addDays(base: Date, days: number): Date {
  const d = new Date(base);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

export async function enqueueAutomationEmail(
  client: pg.PoolClient,
  input: EnqueueEmailInput
): Promise<string | null> {
  if (process.env.EMAIL_AUTOMATION_ENABLED !== 'true') return null;

  const tpl = templateForEvent(input.eventType);
  if (!tpl && !input.templateKeyOverride) return null;

  let email = input.recipientEmail?.trim().toLowerCase();
  let name = input.recipientName ?? null;
  let tenantName = input.tenantName ?? null;

  if (!email && input.tenantId) {
    const recipient = await resolveTenantRecipient(client, input.tenantId);
    if (!recipient) {
      logger.warn('[email-automation] No recipient for tenant', { tenantId: input.tenantId, eventType: input.eventType });
      return null;
    }
    email = recipient.email;
    name = recipient.name;
    tenantName = recipient.tenantName;
  }

  if (!email) return null;

  const category = categoryForEvent(input.eventType);
  if (await isEmailUnsubscribed(client, email, input.tenantId, category)) {
    logger.info('[email-automation] Skipped — unsubscribed', { email, eventType: input.eventType });
    return null;
  }

  const id = randomUUID();
  const trackingToken = randomUUID();
  const scheduledAt = (input.scheduledAt ?? new Date()).toISOString();
  const templateKey = input.templateKeyOverride ?? tpl!.key;
  const subject = input.subjectOverride ?? tpl!.subject;

  try {
    await client.query(
      `INSERT INTO email_automation_queue (
         id, tenant_id, recipient_email, recipient_name, event_type, template_key, subject,
         scheduled_at, tracking_token, dedupe_key, metadata, campaign_id
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12)`,
      [
        id,
        input.tenantId,
        email,
        name,
        input.eventType,
        templateKey,
        subject,
        scheduledAt,
        trackingToken,
        input.dedupeKey,
        JSON.stringify({ ...input.metadata, tenantName, customBody: input.customBody }),
        input.campaignId ?? null,
      ]
    );
    return id;
  } catch (err: unknown) {
    const pgErr = err as { code?: string };
    if (pgErr.code === '23505') return null;
    throw err;
  }
}

export async function cancelPendingTrialEmails(
  client: pg.PoolClient,
  tenantId: string,
  subscriptionId: string
): Promise<void> {
  await client.query(
    `UPDATE email_automation_queue SET status = 'canceled'
     WHERE tenant_id = $1 AND status = 'pending'
       AND event_type IN ('trial_started', 'trial_day_1', 'trial_day_3', 'trial_day_7', 'trial_day_12', 'trial_day_14', 'trial_expiring')
       AND dedupe_key LIKE $2`,
    [tenantId, `${tenantId}:${subscriptionId}:%`]
  );
}

export async function enrollTrialLifecycleEmails(
  client: pg.PoolClient,
  tenantId: string,
  subscriptionId: string,
  trialStart: Date,
  trialEnd: Date
): Promise<number> {
  const { TRIAL_LIFECYCLE_SCHEDULE } = await import('../../constants/emailAutomation.js');

  let queued = 0;
  for (const step of TRIAL_LIFECYCLE_SCHEDULE) {
    const scheduledAt = addDays(trialStart, step.delayDays);
    const id = await enqueueAutomationEmail(client, {
      tenantId,
      eventType: step.eventType,
      scheduledAt,
      dedupeKey: `${tenantId}:${subscriptionId}:${step.eventType}`,
      metadata: { subscriptionId, trialEnd: trialEnd.toISOString() },
      subjectOverride: step.subject,
      templateKeyOverride: step.templateKey,
    });
    if (id) queued += 1;
  }

  return queued;
}

export async function processDueAutomationEmails(
  client: pg.PoolClient,
  limit = 50
): Promise<{ sent: number; skipped: number; failed: number }> {
  if (process.env.EMAIL_AUTOMATION_ENABLED !== 'true') {
    return { sent: 0, skipped: 0, failed: 0 };
  }

  const { rows } = await client.query<{
    id: string;
    tenant_id: string | null;
    recipient_email: string;
    recipient_name: string | null;
    event_type: EmailAutomationEventType;
    subject: string;
    tracking_token: string;
    metadata: Record<string, unknown>;
  }>(
    `SELECT id, tenant_id, recipient_email, recipient_name, event_type, subject, tracking_token, metadata
     FROM email_automation_queue
     WHERE status = 'pending' AND scheduled_at <= NOW()
     ORDER BY scheduled_at ASC
     LIMIT $1
     FOR UPDATE SKIP LOCKED`,
    [limit]
  );

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of rows) {
    const category = categoryForEvent(row.event_type);
    const unsubscribed = await isEmailUnsubscribed(
      client,
      row.recipient_email,
      row.tenant_id,
      category
    );
    if (unsubscribed) {
      await client.query(
        `UPDATE email_automation_queue SET status = 'skipped_unsubscribed' WHERE id = $1`,
        [row.id]
      );
      skipped += 1;
      continue;
    }

    const sig = signUnsubscribe(row.recipient_email, row.tenant_id, category);
    const base = getPublicBaseUrl();
    const unsubscribeUrl = `${base}/api/email/unsubscribe?email=${encodeURIComponent(row.recipient_email)}&tenant=${encodeURIComponent(row.tenant_id ?? '')}&category=${encodeURIComponent(category)}&sig=${sig}`;

    try {
      await sendAutomationEmail({
        to: row.recipient_email,
        subject: row.subject,
        eventType: row.event_type,
        recipientName: row.recipient_name,
        tenantName: typeof row.metadata?.tenantName === 'string' ? row.metadata.tenantName : null,
        trackingToken: row.tracking_token,
        unsubscribeUrl,
        trialEndDate: typeof row.metadata?.trialEnd === 'string' ? row.metadata.trialEnd : undefined,
        planName: typeof row.metadata?.planName === 'string' ? row.metadata.planName : undefined,
        featureTitle: typeof row.metadata?.featureTitle === 'string' ? row.metadata.featureTitle : undefined,
        featureBody: typeof row.metadata?.featureBody === 'string' ? row.metadata.featureBody : undefined,
        customBody: typeof row.metadata?.customBody === 'string' ? row.metadata.customBody : undefined,
      });

      await client.query(
        `UPDATE email_automation_queue SET status = 'sent', sent_at = NOW() WHERE id = $1`,
        [row.id]
      );
      sent += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await client.query(
        `UPDATE email_automation_queue SET status = 'failed', error = $2 WHERE id = $1`,
        [row.id, message]
      );
      const { captureMonitoringEvent } = await import('../monitoring/monitoringCapture.js');
      captureMonitoringEvent({
        category: 'email',
        severity: 'error',
        message: `Email send failed: ${row.subject}`,
        code: 'EMAIL_SEND_FAILED',
        metadata: {
          queueId: row.id,
          eventType: row.event_type,
          recipient: row.recipient_email,
          error: message,
        },
      });
      failed += 1;
    }
  }

  return { sent, skipped, failed };
}

export async function recordEmailOpen(client: pg.PoolClient, trackingToken: string): Promise<void> {
  await client.query(
    `UPDATE email_automation_queue SET opened_at = COALESCE(opened_at, NOW()) WHERE tracking_token = $1`,
    [trackingToken]
  );
  await client.query(
    `UPDATE marketing_email_queue SET opened_at = COALESCE(opened_at, NOW()) WHERE tracking_token = $1`,
    [trackingToken]
  );
}

export async function recordEmailClick(client: pg.PoolClient, trackingToken: string): Promise<void> {
  await client.query(
    `UPDATE email_automation_queue
     SET clicked_at = COALESCE(clicked_at, NOW()), opened_at = COALESCE(opened_at, NOW())
     WHERE tracking_token = $1`,
    [trackingToken]
  );
  await client.query(
    `UPDATE marketing_email_queue
     SET clicked_at = COALESCE(clicked_at, NOW()), opened_at = COALESCE(opened_at, NOW())
     WHERE tracking_token = $1`,
    [trackingToken]
  );
}
