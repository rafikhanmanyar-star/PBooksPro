import { createHmac, timingSafeEqual } from 'node:crypto';
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import type { EmailAutomationCategory } from '../../constants/emailAutomation.js';
import { EmailAutomationUnsubscribeRepository } from '../../modules/email-automation/repositories/EmailAutomationRepository.js';

const unsubscribeRepo = new EmailAutomationUnsubscribeRepository();

function unsubscribeSecret(): string {
  return (
    process.env.EMAIL_AUTOMATION_UNSUBSCRIBE_SECRET ||
    process.env.JWT_SECRET ||
    'email-automation-unsub-dev'
  );
}

export function signUnsubscribe(
  email: string,
  tenantId: string | null,
  category: EmailAutomationCategory
): string {
  return createHmac('sha256', unsubscribeSecret())
    .update(`${email.trim().toLowerCase()}|${tenantId ?? ''}|${category}`)
    .digest('hex')
    .slice(0, 40);
}

export function verifyUnsubscribeSignature(
  email: string,
  tenantId: string | null,
  category: EmailAutomationCategory,
  sig: string
): boolean {
  const expected = signUnsubscribe(email, tenantId, category);
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(sig));
  } catch {
    return false;
  }
}

export async function isEmailUnsubscribed(
  client: pg.PoolClient,
  email: string,
  tenantId: string | null,
  category: EmailAutomationCategory
): Promise<boolean> {
  const normalized = email.trim().toLowerCase();
  const rows = await unsubscribeRepo.findUnsubscribeCategories(client, normalized, tenantId, category);
  return rows.length > 0;
}

export async function recordUnsubscribe(
  client: pg.PoolClient,
  email: string,
  tenantId: string | null,
  category: EmailAutomationCategory | 'all'
): Promise<void> {
  const normalized = email.trim().toLowerCase();
  const token = signUnsubscribe(normalized, tenantId, category === 'all' ? 'all' : category);

  const exists = await unsubscribeRepo.exists(client, normalized, tenantId, category);
  if (!exists) {
    await unsubscribeRepo.insert(client, {
      id: randomUUID(),
      email: normalized,
      tenantId,
      category,
      token,
    });
  }

  await unsubscribeRepo.cancelPendingForEmail(client, normalized, tenantId);

  if (category === 'marketing' || category === 'all') {
    await unsubscribeRepo.cancelPendingMarketingForEmail(client, normalized);
  }
}
