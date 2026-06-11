import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import type { BillingCustomerRow } from '../../../services/billing/paddleCustomerService.js';

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

export class BillingCustomerRepository {
  async getByTenant(
    client: pg.PoolClient,
    tenantId: string
  ): Promise<BillingCustomerRow | null> {
    const r = await client.query(`SELECT * FROM billing_customers WHERE tenant_id = $1`, [tenantId]);
    return r.rows[0] ? mapRow(r.rows[0]) : null;
  }

  async getByPaddleId(
    client: pg.PoolClient,
    paddleCustomerId: string
  ): Promise<BillingCustomerRow | null> {
    const r = await client.query(`SELECT * FROM billing_customers WHERE paddle_customer_id = $1`, [
      paddleCustomerId,
    ]);
    return r.rows[0] ? mapRow(r.rows[0]) : null;
  }

  async linkPaddle(
    client: pg.PoolClient,
    id: string,
    patch: { paddleCustomerId: string; email: string; name: string | null }
  ): Promise<BillingCustomerRow> {
    await client.query(
      `UPDATE billing_customers SET
         paddle_customer_id = $2,
         email = $3,
         name = COALESCE($4, name),
         updated_at = NOW()
       WHERE id = $1`,
      [id, patch.paddleCustomerId, patch.email, patch.name]
    );
    const r = await client.query(`SELECT * FROM billing_customers WHERE id = $1`, [id]);
    return mapRow(r.rows[0]!);
  }

  async insert(
    client: pg.PoolClient,
    input: {
      id: string;
      tenantId: string;
      paddleCustomerId: string;
      email: string;
      name: string | null;
    }
  ): Promise<BillingCustomerRow> {
    await client.query(
      `INSERT INTO billing_customers (id, tenant_id, paddle_customer_id, email, name)
       VALUES ($1, $2, $3, $4, $5)`,
      [input.id, input.tenantId, input.paddleCustomerId, input.email, input.name]
    );
    const r = await client.query(`SELECT * FROM billing_customers WHERE id = $1`, [input.id]);
    return mapRow(r.rows[0]!);
  }

  async updateInfo(
    client: pg.PoolClient,
    id: string,
    email: string,
    name: string | null
  ): Promise<BillingCustomerRow> {
    await client.query(
      `UPDATE billing_customers SET email = $2, name = COALESCE($3, name), updated_at = NOW() WHERE id = $1`,
      [id, email, name]
    );
    const r = await client.query(`SELECT * FROM billing_customers WHERE id = $1`, [id]);
    return mapRow(r.rows[0]!);
  }

  async updateFromWebhookByPaddleId(
    client: pg.PoolClient,
    id: string,
    email: string | null,
    name: string | null
  ): Promise<void> {
    await client.query(
      `UPDATE billing_customers SET email = COALESCE($2, email), name = COALESCE($3, name), updated_at = NOW()
       WHERE id = $1`,
      [id, email, name]
    );
  }

  async linkPaddleOnExisting(
    client: pg.PoolClient,
    id: string,
    paddleId: string,
    email: string,
    name: string | null
  ): Promise<void> {
    await client.query(
      `UPDATE billing_customers SET paddle_customer_id = $2, email = $3, name = COALESCE($4, name), updated_at = NOW()
       WHERE id = $1`,
      [id, paddleId, email, name]
    );
  }

  async insertFromWebhook(
    client: pg.PoolClient,
    input: {
      tenantId: string;
      paddleId: string;
      email: string;
      name: string | null;
    }
  ): Promise<void> {
    await client.query(
      `INSERT INTO billing_customers (id, tenant_id, paddle_customer_id, email, name)
       VALUES ($1, $2, $3, $4, $5)`,
      [randomUUID(), input.tenantId, input.paddleId, input.email, input.name]
    );
  }
}
