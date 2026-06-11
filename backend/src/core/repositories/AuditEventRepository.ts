import type pg from 'pg';
import { randomUUID } from 'crypto';
import { TenantRepository } from '../TenantRepository.js';

export type AuditEventRow = {
  id: string;
  tenant_id: string;
  user_id: string | null;
  email: string | null;
  module: string;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  summary: string | null;
  old_value: unknown;
  new_value: unknown;
  ip_address: string | null;
  user_agent: string | null;
  occurred_at: Date;
};

export type LoginEventRow = {
  id: string;
  tenant_id: string;
  user_id: string | null;
  email: string | null;
  login_time: Date;
  logout_time: Date | null;
  ip_address: string | null;
  user_agent: string | null;
  status: 'success' | 'failed' | 'logout';
};

function jsonOrNull(v: unknown): string | null {
  if (v === undefined || v === null) return null;
  return JSON.stringify(v);
}

export class AuditEventRepository extends TenantRepository {
  constructor(tenantId: string, client?: pg.PoolClient) {
    super(tenantId, client);
  }

  async insertAuditEvent(
    client: pg.PoolClient,
    input: {
      userId?: string | null;
      email?: string | null;
      module: string;
      action: string;
      entityType?: string | null;
      entityId?: string | null;
      summary?: string | null;
      oldValue?: unknown;
      newValue?: unknown;
      ipAddress?: string | null;
      userAgent?: string | null;
      occurredAt?: Date;
    }
  ): Promise<string> {
    const id = randomUUID();
    await client.query(
      `INSERT INTO audit_events (
         id, tenant_id, user_id, email, module, action, entity_type, entity_id,
         summary, old_value, new_value, ip_address, user_agent, occurred_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb, $12, $13, COALESCE($14::timestamptz, NOW())
       )`,
      [
        id,
        this.tenantId,
        input.userId ?? null,
        input.email ?? null,
        input.module,
        input.action,
        input.entityType ?? null,
        input.entityId ?? null,
        input.summary ?? null,
        jsonOrNull(input.oldValue),
        jsonOrNull(input.newValue),
        input.ipAddress ?? null,
        input.userAgent ?? null,
        input.occurredAt ?? null,
      ]
    );
    return id;
  }

  async insertLoginEvent(
    client: pg.PoolClient,
    input: {
      userId?: string | null;
      email?: string | null;
      status: LoginEventRow['status'];
      ipAddress?: string | null;
      userAgent?: string | null;
    }
  ): Promise<string> {
    const id = randomUUID();
    await client.query(
      `INSERT INTO login_events (id, tenant_id, user_id, email, login_time, ip_address, user_agent, status)
       VALUES ($1, $2, $3, $4, NOW(), $5, $6, $7)`,
      [
        id,
        this.tenantId,
        input.userId ?? null,
        input.email ?? null,
        input.ipAddress ?? null,
        input.userAgent ?? null,
        input.status,
      ]
    );
    return id;
  }

  async closeLoginEvent(
    client: pg.PoolClient,
    loginEventId: string,
    userId: string
  ): Promise<void> {
    await client.query(
      `UPDATE login_events SET logout_time = NOW(), status = 'logout'
       WHERE id = $1 AND tenant_id = $2 AND user_id = $3`,
      [loginEventId, this.tenantId, userId]
    );
  }

  async findOpenLoginSession(client: pg.PoolClient, userId: string): Promise<string | null> {
    const r = await client.query<{ id: string }>(
      `SELECT id FROM login_events
       WHERE tenant_id = $1 AND user_id = $2 AND status = 'success' AND logout_time IS NULL
       ORDER BY login_time DESC LIMIT 1`,
      [this.tenantId, userId]
    );
    return r.rows[0]?.id ?? null;
  }

  async closeLoginEventById(client: pg.PoolClient, loginEventId: string): Promise<void> {
    await client.query(
      `UPDATE login_events SET logout_time = NOW(), status = 'logout' WHERE id = $1`,
      [loginEventId]
    );
  }

  async queryAuditEvents(
    client: pg.PoolClient,
    filters: {
      userId?: string;
      module?: string;
      action?: string;
      startDate?: string;
      endDate?: string;
      limit: number;
      offset: number;
    }
  ): Promise<AuditEventRow[]> {
    const params: unknown[] = [this.tenantId];
    let q = `SELECT id, tenant_id, user_id, email, module, action, entity_type, entity_id, summary,
                    old_value, new_value, ip_address, user_agent, occurred_at
             FROM audit_events WHERE tenant_id = $1`;

    if (filters.userId) {
      params.push(filters.userId);
      q += ` AND user_id = $${params.length}`;
    }
    if (filters.module) {
      params.push(filters.module);
      q += ` AND module = $${params.length}`;
    }
    if (filters.action) {
      params.push(filters.action);
      q += ` AND action = $${params.length}`;
    }
    if (filters.startDate) {
      params.push(filters.startDate);
      q += ` AND occurred_at >= $${params.length}::date`;
    }
    if (filters.endDate) {
      params.push(filters.endDate);
      q += ` AND occurred_at < ($${params.length}::date + INTERVAL '1 day')`;
    }

    q += ` ORDER BY occurred_at DESC LIMIT ${filters.limit + filters.offset}`;
    const r = await client.query<AuditEventRow>(q, params);
    return r.rows;
  }

  async queryLoginEvents(
    client: pg.PoolClient,
    filters: {
      userId?: string;
      action?: string;
      startDate?: string;
      endDate?: string;
      limit: number;
      offset: number;
    }
  ): Promise<LoginEventRow[]> {
    const params: unknown[] = [this.tenantId];
    let q = `SELECT id, tenant_id, user_id, email, login_time, logout_time, ip_address, user_agent, status
             FROM login_events WHERE tenant_id = $1`;

    if (filters.userId) {
      params.push(filters.userId);
      q += ` AND user_id = $${params.length}`;
    }
    if (filters.action) {
      const loginActionMap: Record<string, string> = {
        login: 'success',
        failed_login: 'failed',
        logout: 'logout',
      };
      const st = loginActionMap[filters.action];
      if (st) {
        params.push(st);
        q += ` AND status = $${params.length}`;
      } else {
        q += ` AND 1=0`;
      }
    }
    if (filters.startDate) {
      params.push(filters.startDate);
      q += ` AND login_time >= $${params.length}::date`;
    }
    if (filters.endDate) {
      params.push(filters.endDate);
      q += ` AND login_time < ($${params.length}::date + INTERVAL '1 day')`;
    }

    q += ` ORDER BY login_time DESC LIMIT ${filters.limit + filters.offset}`;
    const r = await client.query<LoginEventRow>(q, params);
    return r.rows;
  }

  async listDistinctModules(client: pg.PoolClient): Promise<string[]> {
    const r = await client.query<{ module: string }>(
      `SELECT DISTINCT module FROM audit_events WHERE tenant_id = $1
       UNION SELECT 'auth' WHERE EXISTS (SELECT 1 FROM login_events WHERE tenant_id = $1)
       ORDER BY 1`,
      [this.tenantId]
    );
    return r.rows.map((x) => x.module);
  }

  async listDistinctActions(client: pg.PoolClient): Promise<string[]> {
    const r = await client.query<{ action: string }>(
      `SELECT DISTINCT action FROM audit_events WHERE tenant_id = $1
       UNION SELECT unnest(ARRAY['login','logout','failed_login'])
       ORDER BY 1`,
      [this.tenantId]
    );
    return r.rows.map((x) => x.action);
  }
}
