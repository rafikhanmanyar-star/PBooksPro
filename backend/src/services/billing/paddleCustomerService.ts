/**
 * Billing customer records + Paddle customer provisioning.
 */

import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { createPaddleCustomer } from './paddleService.js';
import { logBillingAudit } from './billingAuditService.js';
import { BillingCustomerRepository } from '../../modules/billing/repositories/BillingCustomerRepository.js';

export type BillingCustomerRow = {
  id: string;
  tenant_id: string;
  paddle_customer_id: string | null;
  email: string;
  name: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

const customerRepo = new BillingCustomerRepository();

export async function getBillingCustomerByTenant(
  client: pg.PoolClient,
  tenantId: string
): Promise<BillingCustomerRow | null> {
  return customerRepo.getByTenant(client, tenantId);
}

export async function getBillingCustomerByPaddleId(
  client: pg.PoolClient,
  paddleCustomerId: string
): Promise<BillingCustomerRow | null> {
  return customerRepo.getByPaddleId(client, paddleCustomerId);
}

export async function createOrSyncBillingCustomer(
  client: pg.PoolClient,
  input: {
    tenantId: string;
    email: string;
    name?: string;
    userId?: string | null;
  }
): Promise<BillingCustomerRow> {
  const existing = await getBillingCustomerByTenant(client, input.tenantId);
  if (existing?.paddle_customer_id) return existing;

  const paddle = await createPaddleCustomer({
    tenantId: input.tenantId,
    email: input.email,
    name: input.name,
  });

  if (existing) {
    const updated = await customerRepo.linkPaddle(client, existing.id, {
      paddleCustomerId: paddle.paddleCustomerId,
      email: input.email,
      name: input.name ?? null,
    });
    await logBillingAudit(client, {
      tenantId: input.tenantId,
      userId: input.userId,
      action: 'customer_updated',
      summary: 'Billing customer linked to Paddle',
      details: { paddleCustomerId: paddle.paddleCustomerId },
    });
    return updated;
  }

  const id = randomUUID();
  const created = await customerRepo.insert(client, {
    id,
    tenantId: input.tenantId,
    paddleCustomerId: paddle.paddleCustomerId,
    email: input.email,
    name: input.name ?? null,
  });

  await logBillingAudit(client, {
    tenantId: input.tenantId,
    userId: input.userId,
    action: 'customer_created',
    summary: 'Billing customer created in Paddle',
    details: { paddleCustomerId: paddle.paddleCustomerId, email: input.email },
  });

  return created;
}

export async function updateBillingCustomerInfo(
  client: pg.PoolClient,
  input: {
    tenantId: string;
    email: string;
    name?: string;
    userId?: string | null;
  }
): Promise<BillingCustomerRow> {
  const { updatePaddleCustomer } = await import('./paddleService.js');
  let customer = await getBillingCustomerByTenant(client, input.tenantId);

  if (!customer) {
    return createOrSyncBillingCustomer(client, input);
  }

  if (customer.paddle_customer_id) {
    await updatePaddleCustomer(customer.paddle_customer_id, {
      email: input.email,
      name: input.name,
    });
  }

  const updated = await customerRepo.updateInfo(
    client,
    customer.id,
    input.email,
    input.name ?? null
  );

  await logBillingAudit(client, {
    tenantId: input.tenantId,
    userId: input.userId,
    action: 'customer_updated',
    summary: 'Billing information updated',
    details: { email: input.email },
  });

  return updated;
}

export async function updateCustomerFromPaddleWebhook(
  client: pg.PoolClient,
  data: Record<string, unknown>
): Promise<void> {
  const paddleId = typeof data.id === 'string' ? data.id : null;
  const email = typeof data.email === 'string' ? data.email : null;
  const name = typeof data.name === 'string' ? data.name : null;
  const custom = data.custom_data;
  const tenantId =
    custom && typeof custom === 'object' && typeof (custom as Record<string, unknown>).tenant_id === 'string'
      ? ((custom as Record<string, unknown>).tenant_id as string)
      : null;

  if (!paddleId) return;

  const byPaddle = await getBillingCustomerByPaddleId(client, paddleId);
  if (byPaddle) {
    await customerRepo.updateFromWebhookByPaddleId(client, byPaddle.id, email, name);
    return;
  }

  if (tenantId && email) {
    const existing = await getBillingCustomerByTenant(client, tenantId);
    if (existing) {
      await customerRepo.linkPaddleOnExisting(client, existing.id, paddleId, email, name);
    } else {
      await customerRepo.insertFromWebhook(client, {
        tenantId,
        paddleId,
        email,
        name,
      });
    }
  }
}
