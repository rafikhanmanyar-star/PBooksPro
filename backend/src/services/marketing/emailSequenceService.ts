import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { EMAIL_SEQUENCES, sequenceForSource } from '../../constants/emailSequences.js';
import { isEmailUnsubscribed } from '../emailAutomation/emailAutomationUnsubscribeService.js';
import { buildMarketingUnsubscribeUrl } from './marketingEmailSender.js';
import { logger } from '../../utils/logger.js';

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

  const existing = await client.query<{ id: string }>(
    `SELECT id FROM marketing_email_enrollments WHERE lead_id = $1 AND sequence_id = $2`,
    [leadId, sequence.id]
  );
  const activeEnrollmentId = existing.rows[0]?.id ?? enrollmentId;

  if (!existing.rows.length) {
    await client.query(
      `INSERT INTO marketing_email_enrollments (id, lead_id, sequence_id, current_step, status, next_send_at)
       VALUES ($1, $2, $3, 0, 'active', $4)`,
      [enrollmentId, leadId, sequence.id, nextSendAt.toISOString()]
    );
  }

  for (const step of sequence.steps) {
    const scheduledAt = scheduleStep(now, step.delayDays, step.delayMinutes ?? 0);
    const trackingToken = randomUUID();
    await client.query(
      `INSERT INTO marketing_email_queue (
         id, enrollment_id, lead_id, sequence_id, step_id, subject, template_key,
         scheduled_at, status, tracking_token
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending', $9)
       ON CONFLICT (enrollment_id, step_id) DO NOTHING`,
      [
        randomUUID(),
        activeEnrollmentId,
        leadId,
        sequence.id,
        step.id,
        step.subject,
        step.templateKey,
        scheduledAt.toISOString(),
        trackingToken,
      ]
    );
  }

  logger.info('[marketing] Lead enrolled in email sequence', {
    leadId,
    sequenceId: sequence.id,
    steps: sequence.steps.length,
  });

  return activeEnrollmentId;
}

/** Process due queue items with HTML templates, tracking pixels, and unsubscribe. */
export async function processDueMarketingEmails(client: pg.PoolClient, limit = 50): Promise<number> {
  const r = await client.query<{
    id: string;
    lead_id: string;
    subject: string;
    template_key: string;
    tracking_token: string | null;
    email: string;
    name: string | null;
    calendly_url: string | null;
  }>(
    `SELECT q.id, q.lead_id, q.subject, q.template_key, q.tracking_token,
            l.email, l.name,
            (SELECT calendar_event_url FROM demo_bookings db
             WHERE db.lead_id = l.id ORDER BY db.created_at DESC LIMIT 1) AS calendly_url
     FROM marketing_email_queue q
     INNER JOIN marketing_leads l ON l.id = q.lead_id
     WHERE q.status = 'pending' AND q.scheduled_at <= NOW()
     ORDER BY q.scheduled_at ASC
     LIMIT $1
     FOR UPDATE SKIP LOCKED`,
    [limit]
  );

  let sent = 0;
  for (const row of r.rows) {
    try {
      const unsubscribed = await isEmailUnsubscribed(client, row.email, null, 'marketing');
      if (unsubscribed) {
        await client.query(
          `UPDATE marketing_email_queue SET status = 'skipped_unsubscribed' WHERE id = $1`,
          [row.id]
        );
        continue;
      }

      const trackingToken = row.tracking_token || randomUUID();
      if (!row.tracking_token) {
        await client.query(
          `UPDATE marketing_email_queue SET tracking_token = $2 WHERE id = $1`,
          [row.id, trackingToken]
        );
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

      await client.query(
        `UPDATE marketing_email_queue SET status = 'sent', sent_at = NOW() WHERE id = $1`,
        [row.id]
      );
      sent += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await client.query(
        `UPDATE marketing_email_queue SET status = 'failed', error = $2 WHERE id = $1`,
        [row.id, message]
      );
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
