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
import { EmailAutomationQueueRepository } from '../../modules/email-automation/repositories/EmailAutomationRepository.js';

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

const queueRepo = new EmailAutomationQueueRepository();

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
    await queueRepo.insert(client, {
      id,
      tenantId: input.tenantId,
      email,
      name,
      eventType: input.eventType,
      templateKey,
      subject,
      scheduledAt,
      trackingToken,
      dedupeKey: input.dedupeKey,
      metadataJson: JSON.stringify({ ...input.metadata, tenantName, customBody: input.customBody }),
      campaignId: input.campaignId ?? null,
    });
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
  await queueRepo.cancelPendingTrialEmails(client, tenantId, `${tenantId}:${subscriptionId}:%`);
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

  const rows = await queueRepo.lockDuePending(client, limit);

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
      await queueRepo.markSkippedUnsubscribed(client, row.id);
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

      await queueRepo.markSent(client, row.id);
      sent += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await queueRepo.markFailed(client, row.id, message);
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
  await queueRepo.recordOpen(client, trackingToken);
}

export async function recordEmailClick(client: pg.PoolClient, trackingToken: string): Promise<void> {
  await queueRepo.recordClick(client, trackingToken);
}
