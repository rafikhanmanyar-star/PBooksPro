import { createHmac, timingSafeEqual } from 'node:crypto';
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import type { EmailAutomationCategory } from '../../constants/emailAutomation.js';

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
  const { rows } = await client.query<{ category: string }>(
    `SELECT category FROM email_automation_unsubscribes
     WHERE LOWER(email) = $1
       AND (tenant_id IS NULL OR tenant_id = $2 OR $2 IS NULL)
       AND category IN ('all', $3)`,
    [normalized, tenantId, category]
  );
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

  const exists = await client.query(
    `SELECT 1 FROM email_automation_unsubscribes
     WHERE LOWER(email) = $1 AND COALESCE(tenant_id, '') = COALESCE($2, '') AND category = $3`,
    [normalized, tenantId, category]
  );
  if (!exists.rows.length) {
    await client.query(
      `INSERT INTO email_automation_unsubscribes (id, email, tenant_id, category, unsubscribe_token)
       VALUES ($1, $2, $3, $4, $5)`,
      [randomUUID(), normalized, tenantId, category, token]
    );
  }

  await client.query(
    `UPDATE email_automation_queue SET status = 'canceled'
     WHERE LOWER(recipient_email) = $1 AND status = 'pending'
       AND ($2::text IS NULL OR tenant_id = $2)`,
    [normalized, tenantId]
  );
}
