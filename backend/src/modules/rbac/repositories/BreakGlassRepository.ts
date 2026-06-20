import type pg from 'pg';
import { randomUUID } from 'node:crypto';

export type BreakGlassSessionRow = {
  id: string;
  tenant_id: string;
  user_id: string;
  activated_at: Date;
  expires_at: Date;
  ended_at: Date | null;
  end_reason: string | null;
  ip_address: string | null;
  user_agent: string | null;
  mfa_verified_at: Date;
};

export class BreakGlassRepository {
  constructor(private readonly client: pg.PoolClient) {}

  async userHasCapability(tenantId: string, userId: string): Promise<boolean> {
    const r = await this.client.query<{ ok: number }>(
      `SELECT 1 AS ok FROM platform_break_glass_capabilities
       WHERE tenant_id = $1 AND user_id = $2 AND revoked_at IS NULL
       LIMIT 1`,
      [tenantId, userId]
    );
    return r.rows.length > 0;
  }

  async countActiveCapabilities(tenantId: string): Promise<number> {
    const r = await this.client.query<{ cnt: string }>(
      `SELECT COUNT(*)::text AS cnt FROM platform_break_glass_capabilities
       WHERE tenant_id = $1 AND revoked_at IS NULL`,
      [tenantId]
    );
    return Number(r.rows[0]?.cnt ?? 0);
  }

  async getActiveSessionForTenant(tenantId: string): Promise<BreakGlassSessionRow | null> {
    const r = await this.client.query<BreakGlassSessionRow>(
      `SELECT * FROM break_glass_sessions
       WHERE tenant_id = $1 AND ended_at IS NULL AND expires_at > NOW()
       ORDER BY activated_at DESC
       LIMIT 1`,
      [tenantId]
    );
    return r.rows[0] ?? null;
  }

  async getActiveSessionForUser(tenantId: string, userId: string): Promise<BreakGlassSessionRow | null> {
    const r = await this.client.query<BreakGlassSessionRow>(
      `SELECT * FROM break_glass_sessions
       WHERE tenant_id = $1 AND user_id = $2 AND ended_at IS NULL AND expires_at > NOW()
       ORDER BY activated_at DESC
       LIMIT 1`,
      [tenantId, userId]
    );
    return r.rows[0] ?? null;
  }

  async getSessionById(sessionId: string): Promise<BreakGlassSessionRow | null> {
    const r = await this.client.query<BreakGlassSessionRow>(
      `SELECT * FROM break_glass_sessions WHERE id = $1 LIMIT 1`,
      [sessionId]
    );
    return r.rows[0] ?? null;
  }

  async createSession(input: {
    tenantId: string;
    userId: string;
    expiresAt: Date;
    ipAddress?: string | null;
    userAgent?: string | null;
  }): Promise<BreakGlassSessionRow> {
    const id = `bgs_${randomUUID().replace(/-/g, '')}`;
    const r = await this.client.query<BreakGlassSessionRow>(
      `INSERT INTO break_glass_sessions (
         id, tenant_id, user_id, expires_at, ip_address, user_agent
       ) VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [id, input.tenantId, input.userId, input.expiresAt, input.ipAddress ?? null, input.userAgent ?? null]
    );
    return r.rows[0]!;
  }

  async endSession(sessionId: string, reason: 'expired' | 'manual' | 'superseded'): Promise<boolean> {
    const r = await this.client.query(
      `UPDATE break_glass_sessions
       SET ended_at = NOW(), end_reason = $2
       WHERE id = $1 AND ended_at IS NULL`,
      [sessionId, reason]
    );
    return (r.rowCount ?? 0) > 0;
  }

  async expireStaleSessions(): Promise<string[]> {
    const r = await this.client.query<{ id: string }>(
      `UPDATE break_glass_sessions
       SET ended_at = NOW(), end_reason = 'expired'
       WHERE ended_at IS NULL AND expires_at <= NOW()
       RETURNING id`
    );
    return r.rows.map((row) => row.id);
  }
}
