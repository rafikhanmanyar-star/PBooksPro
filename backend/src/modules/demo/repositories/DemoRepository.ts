import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import type { DemoBookingRow } from '../../../services/demo/demoBookingService.js';
import { SubscriptionRepository } from '../../billing/repositories/SubscriptionRepository.js';

const subRepo = new SubscriptionRepository();

export class DemoEnvironmentRepository {
  async getTenantCreatedAt(
    client: pg.PoolClient,
    tenantId: string
  ): Promise<string | null> {
    const r = await client.query<{ created_at: string }>(
      `SELECT created_at FROM tenants WHERE id = $1`,
      [tenantId]
    );
    return r.rows[0]?.created_at ?? null;
  }

  async updatePublicDemoTrial(
    client: pg.PoolClient,
    input: {
      subscriptionId: string;
      startDate: string;
      trialEnd: string;
      status: string;
    }
  ): Promise<void> {
    await client.query(
      `UPDATE subscriptions
       SET start_date = $2,
           trial_end_date = $3,
           renewal_date = $3,
           status = $4,
           updated_at = NOW()
       WHERE id = $1`,
      [input.subscriptionId, input.startDate, input.trialEnd, input.status]
    );
  }

  async insertPublicDemoTrial(
    client: pg.PoolClient,
    input: {
      id: string;
      tenantId: string;
      planId: string;
      status: string;
      startDate: string;
      trialEnd: string;
    }
  ): Promise<void> {
    await client.query(
      `INSERT INTO subscriptions (
         id, tenant_id, plan_id, status, billing_cycle, start_date, trial_end_date, renewal_date
       ) VALUES ($1, $2, $3, $4, 'trial', $5, $6, $6)`,
      [
        input.id,
        input.tenantId,
        input.planId,
        input.status,
        input.startDate,
        input.trialEnd,
      ]
    );
  }

  async countTenantTransactions(client: pg.PoolClient, tenantId: string): Promise<number> {
    const r = await client.query<{ c: number }>(
      `SELECT COUNT(*)::int AS c FROM transactions WHERE tenant_id = $1`,
      [tenantId]
    );
    return r.rows[0]?.c ?? 0;
  }

  async upsertDemoTenant(
    client: pg.PoolClient,
    tenantId: string,
    tenantName: string,
    companyName: string
  ): Promise<void> {
    await client.query(
      `INSERT INTO tenants (id, name, company_name) VALUES ($1, $2, $3)
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, company_name = EXCLUDED.company_name, updated_at = NOW()`,
      [tenantId, tenantName, companyName]
    );
  }

  async insertPresentationDemoTrial(
    client: pg.PoolClient,
    input: {
      id: string;
      tenantId: string;
      planId: string;
      startDate: string;
      trialEnd: string;
    }
  ): Promise<void> {
    await client.query(
      `INSERT INTO subscriptions (
         id, tenant_id, plan_id, status, billing_cycle, start_date, trial_end_date, renewal_date
       ) VALUES ($1, $2, $3, 'trialing', 'trial', $4, $5, $5)`,
      [input.id, input.tenantId, input.planId, input.startDate, input.trialEnd]
    );
  }

  async ensurePresentationDemoSubscription(
    client: pg.PoolClient,
    tenantId: string,
    trialEndIso: string
  ): Promise<void> {
    const existing = await this.getLatestSubscriptionWithPlan(client, tenantId);
    if (existing) {
      await client.query(
        `UPDATE subscriptions
         SET status = 'trialing',
             trial_end_date = $2,
             renewal_date = $2,
             updated_at = NOW()
         WHERE id = $1`,
        [existing.id, trialEndIso]
      );
      return;
    }
    const trialPlan = await client.query<{ id: string }>(
      `SELECT id FROM billing_plans WHERE plan_code = 'trial' LIMIT 1`
    );
    if (!trialPlan.rows[0]?.id) return;
    await this.insertPresentationDemoTrial(client, {
      id: randomUUID(),
      tenantId,
      planId: trialPlan.rows[0].id,
      startDate: new Date().toISOString(),
      trialEnd: trialEndIso,
    });
  }

  async upsertDemoUser(
    client: pg.PoolClient,
    input: {
      userId: string;
      tenantId: string;
      username: string;
      name: string;
      passwordHash: string;
      email?: string;
    }
  ): Promise<void> {
    await client.query(
      `INSERT INTO users (id, tenant_id, username, name, role, password_hash, email, is_active)
       VALUES ($1, $2, $3, $4, 'Admin', $5, $6, TRUE)
       ON CONFLICT (tenant_id, username) DO UPDATE SET
         password_hash = EXCLUDED.password_hash,
         name = EXCLUDED.name,
         role = EXCLUDED.role,
         email = COALESCE(EXCLUDED.email, users.email),
         is_active = TRUE,
         updated_at = NOW()`,
      [input.userId, input.tenantId, input.username, input.name, input.passwordHash, input.email ?? null]
    );
  }

  async getLatestSubscriptionWithPlan(
    client: pg.PoolClient,
    tenantId: string
  ): Promise<pg.QueryResultRow | null> {
    return subRepo.getLatestWithPlan(client, tenantId);
  }
}

export class DemoBookingRepository {
  async insert(
    client: pg.PoolClient,
    params: unknown[]
  ): Promise<DemoBookingRow> {
    const r = await client.query<DemoBookingRow>(
      `INSERT INTO demo_bookings (
         id, booking_ref, lead_id, full_name, company_name, email, mobile_number, city,
         user_count, business_type, preferred_date, preferred_time, additional_notes,
         status, utm_source, utm_medium, utm_campaign, page_url, user_agent, ip_address,
         calendar_provider, calendar_event_url, metadata
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'pending',
         $14,$15,$16,$17,$18,$19,$20,$21,$22::jsonb
       )
       RETURNING *`,
      params
    );
    return r.rows[0]!;
  }

  async markEmailsSent(client: pg.PoolClient, bookingId: string): Promise<void> {
    await client.query(
      `UPDATE demo_bookings SET
         confirmation_email_sent_at = NOW(),
         admin_notified_at = NOW(),
         updated_at = NOW()
       WHERE id = $1`,
      [bookingId]
    );
  }

  async getByRef(pool: pg.Pool, ref: string): Promise<DemoBookingRow | null> {
    const r = await pool.query<DemoBookingRow>(
      `SELECT * FROM demo_bookings WHERE booking_ref = $1 LIMIT 1`,
      [ref.trim().toUpperCase()]
    );
    return r.rows[0] ?? null;
  }
}

export { randomUUID as newDemoId };
