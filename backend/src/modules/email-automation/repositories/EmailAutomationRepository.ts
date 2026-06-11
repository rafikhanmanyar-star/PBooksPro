import type pg from 'pg';
import type { EmailAutomationEventType } from '../../../constants/emailAutomation.js';

export class EmailAutomationQueueRepository {
  async insert(
    client: pg.PoolClient,
    input: {
      id: string;
      tenantId: string | null;
      email: string;
      name: string | null;
      eventType: EmailAutomationEventType;
      templateKey: string;
      subject: string;
      scheduledAt: string;
      trackingToken: string;
      dedupeKey: string;
      metadataJson: string;
      campaignId: string | null;
    }
  ): Promise<void> {
    await client.query(
      `INSERT INTO email_automation_queue (
         id, tenant_id, recipient_email, recipient_name, event_type, template_key, subject,
         scheduled_at, tracking_token, dedupe_key, metadata, campaign_id
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12)`,
      [
        input.id,
        input.tenantId,
        input.email,
        input.name,
        input.eventType,
        input.templateKey,
        input.subject,
        input.scheduledAt,
        input.trackingToken,
        input.dedupeKey,
        input.metadataJson,
        input.campaignId,
      ]
    );
  }

  async cancelPendingTrialEmails(
    client: pg.PoolClient,
    tenantId: string,
    dedupeKeyPrefix: string
  ): Promise<void> {
    await client.query(
      `UPDATE email_automation_queue SET status = 'canceled'
       WHERE tenant_id = $1 AND status = 'pending'
         AND event_type IN ('trial_started', 'trial_day_1', 'trial_day_3', 'trial_day_7', 'trial_day_12', 'trial_day_14', 'trial_expiring')
         AND dedupe_key LIKE $2`,
      [tenantId, dedupeKeyPrefix]
    );
  }

  async lockDuePending(
    client: pg.PoolClient,
    limit: number
  ): Promise<
    Array<{
      id: string;
      tenant_id: string | null;
      recipient_email: string;
      recipient_name: string | null;
      event_type: EmailAutomationEventType;
      subject: string;
      tracking_token: string;
      metadata: Record<string, unknown>;
    }>
  > {
    const { rows } = await client.query(
      `SELECT id, tenant_id, recipient_email, recipient_name, event_type, subject, tracking_token, metadata
       FROM email_automation_queue
       WHERE status = 'pending' AND scheduled_at <= NOW()
       ORDER BY scheduled_at ASC
       LIMIT $1
       FOR UPDATE SKIP LOCKED`,
      [limit]
    );
    return rows as Array<{
      id: string;
      tenant_id: string | null;
      recipient_email: string;
      recipient_name: string | null;
      event_type: EmailAutomationEventType;
      subject: string;
      tracking_token: string;
      metadata: Record<string, unknown>;
    }>;
  }

  async markSkippedUnsubscribed(client: pg.PoolClient, id: string): Promise<void> {
    await client.query(
      `UPDATE email_automation_queue SET status = 'skipped_unsubscribed' WHERE id = $1`,
      [id]
    );
  }

  async markSent(client: pg.PoolClient, id: string): Promise<void> {
    await client.query(
      `UPDATE email_automation_queue SET status = 'sent', sent_at = NOW() WHERE id = $1`,
      [id]
    );
  }

  async markFailed(client: pg.PoolClient, id: string, error: string): Promise<void> {
    await client.query(
      `UPDATE email_automation_queue SET status = 'failed', error = $2 WHERE id = $1`,
      [id, error]
    );
  }

  async recordOpen(client: pg.PoolClient, trackingToken: string): Promise<void> {
    await client.query(
      `UPDATE email_automation_queue SET opened_at = COALESCE(opened_at, NOW()) WHERE tracking_token = $1`,
      [trackingToken]
    );
    await client.query(
      `UPDATE marketing_email_queue SET opened_at = COALESCE(opened_at, NOW()) WHERE tracking_token = $1`,
      [trackingToken]
    );
  }

  async recordClick(client: pg.PoolClient, trackingToken: string): Promise<void> {
    await client.query(
      `UPDATE email_automation_queue
       SET clicked_at = COALESCE(clicked_at, NOW()), opened_at = COALESCE(opened_at, NOW())
       WHERE tracking_token = $1`,
      [trackingToken]
    );
    await client.query(
      `UPDATE marketing_email_queue
       SET clicked_at = COALESCE(clicked_at, NOW()), opened_at = COALESCE(opened_at, NOW())
       WHERE tracking_token = $1`,
      [trackingToken]
    );
  }
}

export class EmailAutomationCampaignRepository {
  async insert(
    client: pg.PoolClient,
    input: {
      id: string;
      name: string;
      eventType: string;
      subject: string;
      templateKey: string;
      bodyOverride: string | null;
      targetFilterJson: string;
      scheduledAt: string | null;
      createdBy: string | null;
    }
  ): Promise<void> {
    await client.query(
      `INSERT INTO email_automation_campaigns (
         id, name, event_type, subject, template_key, body_override, target_filter,
         status, scheduled_at, created_by, stats
       ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, 'draft', $8, $9, '{}'::jsonb)`,
      [
        input.id,
        input.name,
        input.eventType,
        input.subject,
        input.templateKey,
        input.bodyOverride,
        input.targetFilterJson,
        input.scheduledAt,
        input.createdBy,
      ]
    );
  }

  async resolveCampaignRecipients(
    client: pg.PoolClient,
    statuses: string[],
    inactiveDays: number
  ): Promise<Array<{ tenant_id: string; email: string; name: string | null }>> {
    const { rows } = await client.query<{ tenant_id: string; email: string; name: string }>(
      `SELECT DISTINCT ON (u.tenant_id) u.tenant_id, u.email, u.name
       FROM users u
       INNER JOIN subscriptions s ON s.tenant_id = u.tenant_id
       WHERE u.is_active = TRUE
         AND u.email IS NOT NULL AND TRIM(u.email) <> ''
         AND s.status = ANY($1::text[])
         AND (
           $2::int = 0
           OR s.updated_at < NOW() - ($2::int * INTERVAL '1 day')
           OR s.status IN ('expired', 'canceled')
         )
       ORDER BY u.tenant_id, CASE WHEN u.role = 'Admin' THEN 0 ELSE 1 END, u.created_at ASC`,
      [statuses, inactiveDays]
    );
    return rows.map((r) => ({
      tenant_id: r.tenant_id,
      email: r.email.trim().toLowerCase(),
      name: r.name?.trim() || null,
    }));
  }

  async getById(client: pg.PoolClient, campaignId: string): Promise<pg.QueryResultRow | null> {
    const { rows } = await client.query(`SELECT * FROM email_automation_campaigns WHERE id = $1`, [
      campaignId,
    ]);
    return rows[0] ?? null;
  }

  async markSending(client: pg.PoolClient, campaignId: string): Promise<void> {
    await client.query(
      `UPDATE email_automation_campaigns SET status = 'sending', started_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [campaignId]
    );
  }

  async markCompleted(
    client: pg.PoolClient,
    campaignId: string,
    queued: number,
    recipientCount: number
  ): Promise<void> {
    await client.query(
      `UPDATE email_automation_campaigns
       SET status = 'completed', completed_at = NOW(), updated_at = NOW(),
           stats = jsonb_build_object('queued', $2::int, 'recipients', $3::int)
       WHERE id = $1`,
      [campaignId, queued, recipientCount]
    );
  }

  async listDueDrafts(client: pg.PoolClient, limit = 10): Promise<Array<{ id: string }>> {
    const { rows } = await client.query<{ id: string }>(
      `SELECT id FROM email_automation_campaigns
       WHERE status = 'draft' AND scheduled_at IS NOT NULL AND scheduled_at <= NOW()
       ORDER BY scheduled_at ASC
       LIMIT $1`,
      [limit]
    );
    return rows;
  }

  async getStats(client: pg.PoolClient): Promise<{
    pending: string;
    sent: string;
    failed: string;
    opened: string;
    clicked: string;
    unsubscribed: string;
  }> {
    const { rows } = await client.query(
      `SELECT
         (SELECT COUNT(*)::text FROM email_automation_queue WHERE status = 'pending') AS pending,
         (SELECT COUNT(*)::text FROM email_automation_queue WHERE status = 'sent') AS sent,
         (SELECT COUNT(*)::text FROM email_automation_queue WHERE status = 'failed') AS failed,
         (SELECT COUNT(*)::text FROM email_automation_queue WHERE opened_at IS NOT NULL) AS opened,
         (SELECT COUNT(*)::text FROM email_automation_queue WHERE clicked_at IS NOT NULL) AS clicked,
         (SELECT COUNT(*)::text FROM email_automation_unsubscribes) AS unsubscribed`
    );
    return rows[0] as {
      pending: string;
      sent: string;
      failed: string;
      opened: string;
      clicked: string;
      unsubscribed: string;
    };
  }
}

export class EmailAutomationUnsubscribeRepository {
  async findUnsubscribeCategories(
    client: pg.PoolClient,
    email: string,
    tenantId: string | null,
    category: string
  ): Promise<Array<{ category: string }>> {
    const { rows } = await client.query<{ category: string }>(
      `SELECT category FROM email_automation_unsubscribes
       WHERE LOWER(email) = $1
         AND (tenant_id IS NULL OR tenant_id = $2 OR $2 IS NULL)
         AND category IN ('all', $3)`,
      [email, tenantId, category]
    );
    return rows;
  }

  async exists(
    client: pg.PoolClient,
    email: string,
    tenantId: string | null,
    category: string
  ): Promise<boolean> {
    const exists = await client.query(
      `SELECT 1 FROM email_automation_unsubscribes
       WHERE LOWER(email) = $1 AND COALESCE(tenant_id, '') = COALESCE($2, '') AND category = $3`,
      [email, tenantId, category]
    );
    return exists.rows.length > 0;
  }

  async insert(
    client: pg.PoolClient,
    input: { id: string; email: string; tenantId: string | null; category: string; token: string }
  ): Promise<void> {
    await client.query(
      `INSERT INTO email_automation_unsubscribes (id, email, tenant_id, category, unsubscribe_token)
       VALUES ($1, $2, $3, $4, $5)`,
      [input.id, input.email, input.tenantId, input.category, input.token]
    );
  }

  async cancelPendingForEmail(
    client: pg.PoolClient,
    email: string,
    tenantId: string | null
  ): Promise<void> {
    await client.query(
      `UPDATE email_automation_queue SET status = 'canceled'
       WHERE LOWER(recipient_email) = $1 AND status = 'pending'
         AND ($2::text IS NULL OR tenant_id = $2)`,
      [email, tenantId]
    );
  }

  async cancelPendingMarketingForEmail(client: pg.PoolClient, email: string): Promise<void> {
    await client.query(
      `UPDATE marketing_email_queue SET status = 'canceled'
       WHERE status = 'pending'
         AND lead_id IN (SELECT id FROM marketing_leads WHERE LOWER(email) = $1)`,
      [email]
    );
  }
}
