import type pg from 'pg';
import {
  cancelPendingTrialEmails,
  enrollTrialLifecycleEmails,
  enqueueAutomationEmail,
} from './emailAutomationQueueService.js';
import { logger } from '../../utils/logger.js';

/** Fire-and-forget safe wrapper — never throws to billing flow. */
export async function handleSubscriptionEmailEvent(
  client: pg.PoolClient,
  eventType: string,
  tenantId: string | null,
  payload: Record<string, unknown> = {}
): Promise<void> {
  if (process.env.EMAIL_AUTOMATION_ENABLED !== 'true' || !tenantId) return;

  try {
    switch (eventType) {
      case 'trial_started': {
        const subscriptionId = String(payload.subscriptionId ?? '');
        const trialEnd = payload.trialEnd ? new Date(String(payload.trialEnd)) : null;
        if (!subscriptionId || !trialEnd || Number.isNaN(trialEnd.getTime())) break;
        await enrollTrialLifecycleEmails(client, tenantId, subscriptionId, new Date(), trialEnd);
        break;
      }
      case 'subscription_activated': {
        const subscriptionId = String(payload.subscriptionId ?? '');
        if (subscriptionId) {
          await cancelPendingTrialEmails(client, tenantId, subscriptionId);
        }
        await enqueueAutomationEmail(client, {
          tenantId,
          eventType: 'subscription_purchased',
          dedupeKey: `${tenantId}:subscription_purchased:${subscriptionId || Date.now()}`,
          metadata: {
            subscriptionId,
            planName: payload.planCode ? String(payload.planCode) : undefined,
          },
        });
        break;
      }
      case 'subscription.canceled':
      case 'subscription_canceled':
      case 'cancel_scheduled': {
        if (eventType === 'cancel_scheduled') break;
        const subscriptionId = String(payload.subscriptionId ?? '');
        await enqueueAutomationEmail(client, {
          tenantId,
          eventType: 'subscription_cancelled',
          dedupeKey: `${tenantId}:subscription_cancelled:${subscriptionId}`,
          metadata: { subscriptionId },
        });
        break;
      }
      case 'transaction.payment_failed':
      case 'subscription.past_due':
      case 'payment.failed': {
        const subscriptionId = String(payload.subscriptionId ?? payload.id ?? '');
        await enqueueAutomationEmail(client, {
          tenantId,
          eventType: 'payment_failed',
          dedupeKey: `${tenantId}:payment_failed:${subscriptionId || new Date().toISOString().slice(0, 10)}`,
          metadata: { subscriptionId },
        });
        break;
      }
      default:
        break;
    }
  } catch (err) {
    logger.error('[email-automation] Hook failed', { eventType, tenantId, err });
  }
}
