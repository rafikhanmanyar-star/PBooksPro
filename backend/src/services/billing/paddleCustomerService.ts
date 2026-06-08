/**
 * Billing customer records + Paddle customer provisioning.
 */

import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { createPaddleCustomer } from './paddleService.js';
import { logBillingAudit } from './billingAuditService.js';

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

function mapRow(row: pg.QueryResultRow): BillingCustomerRow {
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    paddle_customer_id: row.paddle_customer_id,
    email: row.email,
    name: row.name,
    metadata:
      row.metadata && typeof row.metadata === 'object'
        ? (row.metadata as Record<string, unknown>)
        : {},
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function getBillingCustomerByTenant(
  client: pg.PoolClient,
  tenantId: string
): Promise<BillingCustomerRow | null> {
  const { rows } = await client.query(`SELECT * FROM billing_customers WHERE tenant_id = $1`, [
    tenantId,
  ]);
  return rows.length ? mapRow(rows[0]) : null;
}

export async function getBillingCustomerByPaddleId(
  client: pg.PoolClient,
  paddleCustomerId: string
): Promise<BillingCustomerRow | null> {
  const { rows } = await client.query(
    `SELECT * FROM billing_customers WHERE paddle_customer_id = $1`,
    [paddleCustomerId]
  );
  return rows.length ? mapRow(rows[0]) : null;
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
    await client.query(
      `UPDATE billing_customers SET
         paddle_customer_id = $2,
         email = $3,
         name = COALESCE($4, name),
         updated_at = NOW()
       WHERE id = $1`,
      [existing.id, paddle.paddleCustomerId, input.email, input.name ?? null]
    );
    const { rows } = await client.query(`SELECT * FROM billing_customers WHERE id = $1`, [
      existing.id,
    ]);
    const updated = mapRow(rows[0]);
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
  await client.query(
    `INSERT INTO billing_customers (id, tenant_id, paddle_customer_id, email, name)
     VALUES ($1, $2, $3, $4, $5)`,
    [id, input.tenantId, paddle.paddleCustomerId, input.email, input.name ?? null]
  );

  await logBillingAudit(client, {
    tenantId: input.tenantId,
    userId: input.userId,
    action: 'customer_created',
    summary: 'Billing customer created in Paddle',
    details: { paddleCustomerId: paddle.paddleCustomerId, email: input.email },
  });

  const { rows } = await client.query(`SELECT * FROM billing_customers WHERE id = $1`, [id]);
  return mapRow(rows[0]);
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

  await client.query(
    `UPDATE billing_customers SET email = $2, name = COALESCE($3, name), updated_at = NOW() WHERE id = $1`,
    [customer.id, input.email, input.name ?? null]
  );

  await logBillingAudit(client, {
    tenantId: input.tenantId,
    userId: input.userId,
    action: 'customer_updated',
    summary: 'Billing information updated',
    details: { email: input.email },
  });

  const { rows } = await client.query(`SELECT * FROM billing_customers WHERE id = $1`, [customer.id]);
  return mapRow(rows[0]);
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
    await client.query(
      `UPDATE billing_customers SET email = COALESCE($2, email), name = COALESCE($3, name), updated_at = NOW()
       WHERE id = $1`,
      [byPaddle.id, email, name]
    );
    return;
  }

  if (tenantId && email) {
    const existing = await getBillingCustomerByTenant(client, tenantId);
    if (existing) {
      await client.query(
        `UPDATE billing_customers SET paddle_customer_id = $2, email = $3, name = COALESCE($4, name), updated_at = NOW()
         WHERE id = $1`,
        [existing.id, paddleId, email, name]
      );
    } else {
      await client.query(
        `INSERT INTO billing_customers (id, tenant_id, paddle_customer_id, email, name)
         VALUES ($1, $2, $3, $4, $5)`,
        [randomUUID(), tenantId, paddleId, email, name]
      );
    }
  }
}
