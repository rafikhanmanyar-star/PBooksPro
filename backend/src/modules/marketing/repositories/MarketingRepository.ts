import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import type {
  MarketingLeadRow,
  CreateLeadInput,
  LeadStatus,
} from '../../../services/marketing/marketingLeadService.js';

const LEAD_SELECT = `id, source, lead_magnet, name, email, company, country, mobile, campaign, status,
  utm_source, utm_medium, utm_campaign, page_url, user_agent, ip_address,
  crm_external_id, metadata, created_at, updated_at`;

export class MarketingLeadRepository {
  async findByEmailAndSource(
    client: pg.PoolClient,
    email: string,
    source: string
  ): Promise<MarketingLeadRow | null> {
    const r = await client.query<MarketingLeadRow>(
      `SELECT ${LEAD_SELECT}
       FROM marketing_leads
       WHERE LOWER(email) = LOWER($1) AND source = $2
       ORDER BY created_at DESC
       LIMIT 1`,
      [email, source]
    );
    return r.rows[0] ?? null;
  }

  async updateExisting(
    client: pg.PoolClient,
    input: {
      id: string;
      name: string | null;
      company: string | null;
      country: string | null;
      mobile: string | null;
      campaign: string | null;
      pageUrl: string | null;
      metadataJson: string | null;
    }
  ): Promise<void> {
    await client.query(
      `UPDATE marketing_leads SET
         name = COALESCE($2, name),
         company = COALESCE($3, company),
         country = COALESCE($4, country),
         mobile = COALESCE($5, mobile),
         campaign = COALESCE($6, campaign),
         page_url = COALESCE($7, page_url),
         metadata = COALESCE(metadata, '{}'::jsonb) || COALESCE($8::jsonb, '{}'::jsonb),
         updated_at = NOW()
       WHERE id = $1`,
      [
        input.id,
        input.name,
        input.company,
        input.country,
        input.mobile,
        input.campaign,
        input.pageUrl,
        input.metadataJson,
      ]
    );
  }

  async insert(
    client: pg.PoolClient,
    input: Omit<CreateLeadInput, 'campaign'> & {
      id: string;
      email: string;
      campaign: string | null;
      status: LeadStatus;
      crmExternalId: string;
    }
  ): Promise<MarketingLeadRow> {
    const r = await client.query<MarketingLeadRow>(
      `INSERT INTO marketing_leads (
         id, source, lead_magnet, name, email, company, country, mobile, campaign, status,
         utm_source, utm_medium, utm_campaign, page_url, user_agent, ip_address,
         crm_external_id, metadata
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18::jsonb)
       RETURNING ${LEAD_SELECT}`,
      [
        input.id,
        input.source,
        input.leadMagnet ?? null,
        input.name?.trim() || null,
        input.email,
        input.company?.trim() || null,
        input.country?.trim() || null,
        input.mobile?.trim() || null,
        input.campaign,
        input.status,
        input.utmSource ?? null,
        input.utmMedium ?? null,
        input.utmCampaign ?? null,
        input.pageUrl ?? null,
        input.userAgent ?? null,
        input.ipAddress ?? null,
        input.crmExternalId,
        JSON.stringify(input.metadata ?? {}),
      ]
    );
    return r.rows[0]!;
  }

  async setStatus(client: pg.PoolClient, leadId: string, status: LeadStatus): Promise<void> {
    await client.query(
      `UPDATE marketing_leads SET status = $2, updated_at = NOW() WHERE id = $1`,
      [leadId, status]
    );
  }

  async getById(client: pg.PoolClient, id: string): Promise<MarketingLeadRow | null> {
    const r = await client.query<MarketingLeadRow>(
      `SELECT ${LEAD_SELECT} FROM marketing_leads WHERE id = $1`,
      [id]
    );
    return r.rows[0] ?? null;
  }

  async listForExport(
    pool: pg.Pool,
    since: string | undefined,
    limit: number
  ): Promise<MarketingLeadRow[]> {
    const params: unknown[] = [];
    let where = '';
    if (since) {
      params.push(since);
      where = `WHERE created_at >= $1`;
    }
    params.push(limit);
    const r = await pool.query<MarketingLeadRow>(
      `SELECT ${LEAD_SELECT}
       FROM marketing_leads
       ${where}
       ORDER BY created_at DESC
       LIMIT $${params.length}`,
      params
    );
    return r.rows;
  }
}

export class MarketingEmailSequenceRepository {
  async findEnrollment(
    client: pg.PoolClient,
    leadId: string,
    sequenceId: string
  ): Promise<string | null> {
    const r = await client.query<{ id: string }>(
      `SELECT id FROM marketing_email_enrollments WHERE lead_id = $1 AND sequence_id = $2`,
      [leadId, sequenceId]
    );
    return r.rows[0]?.id ?? null;
  }

  async insertEnrollment(
    client: pg.PoolClient,
    input: {
      id: string;
      leadId: string;
      sequenceId: string;
      nextSendAt: string;
    }
  ): Promise<void> {
    await client.query(
      `INSERT INTO marketing_email_enrollments (id, lead_id, sequence_id, current_step, status, next_send_at)
       VALUES ($1, $2, $3, 0, 'active', $4)`,
      [input.id, input.leadId, input.sequenceId, input.nextSendAt]
    );
  }

  async insertQueueItem(
    client: pg.PoolClient,
    input: {
      id: string;
      enrollmentId: string;
      leadId: string;
      sequenceId: string;
      stepId: string;
      subject: string;
      templateKey: string;
      scheduledAt: string;
      trackingToken: string;
    }
  ): Promise<void> {
    await client.query(
      `INSERT INTO marketing_email_queue (
         id, enrollment_id, lead_id, sequence_id, step_id, subject, template_key,
         scheduled_at, status, tracking_token
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending', $9)
       ON CONFLICT (enrollment_id, step_id) DO NOTHING`,
      [
        input.id,
        input.enrollmentId,
        input.leadId,
        input.sequenceId,
        input.stepId,
        input.subject,
        input.templateKey,
        input.scheduledAt,
        input.trackingToken,
      ]
    );
  }

  async listDueQueueItems(client: pg.PoolClient, limit: number): Promise<
    Array<{
      id: string;
      lead_id: string;
      subject: string;
      template_key: string;
      tracking_token: string | null;
      email: string;
      name: string | null;
      calendly_url: string | null;
    }>
  > {
    const r = await client.query(
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
    return r.rows;
  }

  async skipQueueItem(client: pg.PoolClient, id: string): Promise<void> {
    await client.query(
      `UPDATE marketing_email_queue SET status = 'skipped_unsubscribed' WHERE id = $1`,
      [id]
    );
  }

  async setTrackingToken(client: pg.PoolClient, id: string, token: string): Promise<void> {
    await client.query(`UPDATE marketing_email_queue SET tracking_token = $2 WHERE id = $1`, [
      id,
      token,
    ]);
  }

  async markQueueSent(client: pg.PoolClient, id: string): Promise<void> {
    await client.query(
      `UPDATE marketing_email_queue SET status = 'sent', sent_at = NOW() WHERE id = $1`,
      [id]
    );
  }

  async markQueueFailed(client: pg.PoolClient, id: string, error: string): Promise<void> {
    await client.query(
      `UPDATE marketing_email_queue SET status = 'failed', error = $2 WHERE id = $1`,
      [id, error]
    );
  }
}

export { randomUUID as newMarketingId, LEAD_SELECT };
