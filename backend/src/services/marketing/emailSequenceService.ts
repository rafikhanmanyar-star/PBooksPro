import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { EMAIL_SEQUENCES, sequenceForSource } from '../../constants/emailSequences.js';
import { isEmailUnsubscribed } from '../emailAutomation/emailAutomationUnsubscribeService.js';
import { buildMarketingUnsubscribeUrl } from './marketingEmailSender.js';
import { logger } from '../../utils/logger.js';
import { MarketingEmailSequenceRepository } from '../../modules/marketing/repositories/MarketingRepository.js';

const sequenceRepo = new MarketingEmailSequenceRepository();

function addDays(base: Date, days: number): Date {
  const d = new Date(base);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function addMinutes(base: Date, minutes: number): Date {
  const d = new Date(base);
  d.setUTCMinutes(d.getUTCMinutes() + minutes);
  return d;
}

function scheduleStep(base: Date, delayDays: number, delayMinutes = 0): Date {
  return addMinutes(addDays(base, delayDays), delayMinutes);
}

export async function enrollLeadInSequence(
  client: pg.PoolClient,
  leadId: string,
  source: string
): Promise<string | null> {
  const sequence = sequenceForSource(source);
  if (!sequence || sequence.steps.length === 0) return null;

  const enrollmentId = randomUUID();
  const now = new Date();
  const firstStep = sequence.steps[0];
  const nextSendAt = scheduleStep(now, firstStep.delayDays, firstStep.delayMinutes ?? 0);

  const existingId = await sequenceRepo.findEnrollment(client, leadId, sequence.id);
  const activeEnrollmentId = existingId ?? enrollmentId;

  if (!existingId) {
    await sequenceRepo.insertEnrollment(client, {
      id: enrollmentId,
      leadId,
      sequenceId: sequence.id,
      nextSendAt: nextSendAt.toISOString(),
    });
  }

  for (const step of sequence.steps) {
    const scheduledAt = scheduleStep(now, step.delayDays, step.delayMinutes ?? 0);
    await sequenceRepo.insertQueueItem(client, {
      id: randomUUID(),
      enrollmentId: activeEnrollmentId,
      leadId,
      sequenceId: sequence.id,
      stepId: step.id,
      subject: step.subject,
      templateKey: step.templateKey,
      scheduledAt: scheduledAt.toISOString(),
      trackingToken: randomUUID(),
    });
  }

  logger.info('[marketing] Lead enrolled in email sequence', {
    leadId,
    sequenceId: sequence.id,
    steps: sequence.steps.length,
  });

  return activeEnrollmentId;
}

export async function processDueMarketingEmails(client: pg.PoolClient, limit = 50): Promise<number> {
  const rows = await sequenceRepo.listDueQueueItems(client, limit);

  let sent = 0;
  for (const row of rows) {
    try {
      const unsubscribed = await isEmailUnsubscribed(client, row.email, null, 'marketing');
      if (unsubscribed) {
        await sequenceRepo.skipQueueItem(client, row.id);
        continue;
      }

      const trackingToken = row.tracking_token || randomUUID();
      if (!row.tracking_token) {
        await sequenceRepo.setTrackingToken(client, row.id, trackingToken);
      }

      const unsubscribeUrl = buildMarketingUnsubscribeUrl(row.email);
      const calendly =
        row.calendly_url ||
        process.env.DEMO_BOOKING_CALENDLY_URL?.trim() ||
        undefined;

      const { sendMarketingEmail } = await import('./marketingEmailSender.js');
      await sendMarketingEmail({
        to: row.email,
        name: row.name,
        subject: row.subject,
        templateKey: row.template_key,
        trackingToken,
        unsubscribeUrl,
        context: { calendlyUrl: calendly },
      });

      await sequenceRepo.markQueueSent(client, row.id);
      sent += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await sequenceRepo.markQueueFailed(client, row.id, message);
    }
  }

  return sent;
}

export function getSequenceCatalog() {
  return EMAIL_SEQUENCES.map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description,
    triggerSources: s.triggerSources,
    stepCount: s.steps.length,
    steps: s.steps.map((step) => ({
      id: step.id,
      delayDays: step.delayDays,
      delayMinutes: step.delayMinutes ?? 0,
      subject: step.subject,
      templateKey: step.templateKey,
    })),
  }));
}
