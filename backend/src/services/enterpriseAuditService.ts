import type pg from 'pg';
import type { Request } from 'express';
import { randomUUID } from 'crypto';

export type AuditAction =
  | 'create'
  | 'edit'
  | 'delete'
  | 'login'
  | 'logout'
  | 'role_change'
  | 'post'
  | 'reverse'
  | 'close'
  | 'reopen'
  | 'open'
  | 'failed_login';

export type AuditModule =
  | 'auth'
  | 'users'
  | 'journal'
  | 'transactions'
  | 'payroll'
  | 'accounting_periods'
  | 'accounts'
  | 'invoices'
  | 'bills'
  | 'system'
  | 'backups'
  | 'billing'
  | 'privacy';

export type LoginEventStatus = 'success' | 'failed' | 'logout';

export type AuditRequestContext = {
  ipAddress?: string | null;
  userAgent?: string | null;
};

export type AppendAuditEventInput = {
  tenantId: string;
  userId?: string | null;
  email?: string | null;
  module: AuditModule | string;
  action: AuditAction | string;
  entityType?: string | null;
  entityId?: string | null;
  summary?: string | null;
  oldValue?: unknown;
  newValue?: unknown;
  ctx?: AuditRequestContext;
  occurredAt?: Date;
};

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
  status: LoginEventStatus;
};

export type UnifiedAuditRow = {
  id: string;
  source: 'audit_event' | 'login_event';
  occurredAt: string;
  userId: string | null;
  email: string | null;
  module: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  summary: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  status: string | null;
  oldValue: unknown;
  newValue: unknown;
};

export type AuditListFilters = {
  userId?: string;
  startDate?: string;
  endDate?: string;
  module?: string;
  action?: string;
  limit?: number;
  offset?: number;
};

export function auditContextFromRequest(req: Request): AuditRequestContext {
  const forwarded = req.headers['x-forwarded-for'];
  const ip =
    typeof forwarded === 'string'
      ? forwarded.split(',')[0]?.trim()
      : req.socket?.remoteAddress ?? null;
  const ua = typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : null;
  return { ipAddress: ip, userAgent: ua };
}

function jsonOrNull(v: unknown): string | null {
  if (v === undefined || v === null) return null;
  return JSON.stringify(v);
}

export async function appendAuditEvent(
  client: pg.PoolClient,
  input: AppendAuditEventInput
): Promise<string> {
  const id = randomUUID();
  const ctx = input.ctx ?? {};
  await client.query(
    `INSERT INTO audit_events (
       id, tenant_id, user_id, email, module, action, entity_type, entity_id,
       summary, old_value, new_value, ip_address, user_agent, occurred_at
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb, $12, $13, COALESCE($14::timestamptz, NOW())
     )`,
    [
      id,
      input.tenantId,
      input.userId ?? null,
      input.email ?? null,
      input.module,
      input.action,
      input.entityType ?? null,
      input.entityId ?? null,
      input.summary ?? null,
      jsonOrNull(input.oldValue),
      jsonOrNull(input.newValue),
      ctx.ipAddress ?? null,
      ctx.userAgent ?? null,
      input.occurredAt ?? null,
    ]
  );
  return id;
}

export async function recordLoginEvent(
  client: pg.PoolClient,
  input: {
    tenantId: string;
    userId?: string | null;
    email?: string | null;
    status: LoginEventStatus;
    ctx?: AuditRequestContext;
  }
): Promise<string> {
  const id = randomUUID();
  const ctx = input.ctx ?? {};
  await client.query(
    `INSERT INTO login_events (id, tenant_id, user_id, email, login_time, ip_address, user_agent, status)
     VALUES ($1, $2, $3, $4, NOW(), $5, $6, $7)`,
    [id, input.tenantId, input.userId ?? null, input.email ?? null, ctx.ipAddress ?? null, ctx.userAgent ?? null, input.status]
  );

  if (input.status === 'success') {
    await appendAuditEvent(client, {
      tenantId: input.tenantId,
      userId: input.userId,
      email: input.email,
      module: 'auth',
      action: 'login',
      entityType: 'login_event',
      entityId: id,
      summary: 'User signed in',
      ctx,
    });
  } else if (input.status === 'failed') {
    await appendAuditEvent(client, {
      tenantId: input.tenantId,
      userId: input.userId,
      email: input.email,
      module: 'auth',
      action: 'failed_login',
      entityType: 'login_event',
      entityId: id,
      summary: 'Failed sign-in attempt',
      ctx,
    });
  }

  return id;
}

export async function recordLogoutEvent(
  client: pg.PoolClient,
  input: {
    tenantId: string;
    userId: string;
    email?: string | null;
    loginEventId?: string | null;
    ctx?: AuditRequestContext;
  }
): Promise<void> {
  const ctx = input.ctx ?? {};
  let closedId = input.loginEventId ?? null;

  if (closedId) {
    await client.query(
      `UPDATE login_events SET logout_time = NOW(), status = 'logout'
       WHERE id = $1 AND tenant_id = $2 AND user_id = $3`,
      [closedId, input.tenantId, input.userId]
    );
  } else {
    const open = await client.query<{ id: string }>(
      `SELECT id FROM login_events
       WHERE tenant_id = $1 AND user_id = $2 AND status = 'success' AND logout_time IS NULL
       ORDER BY login_time DESC LIMIT 1`,
      [input.tenantId, input.userId]
    );
    closedId = open.rows[0]?.id ?? null;
    if (closedId) {
      await client.query(
        `UPDATE login_events SET logout_time = NOW(), status = 'logout' WHERE id = $1`,
        [closedId]
      );
    }
  }

  await appendAuditEvent(client, {
    tenantId: input.tenantId,
    userId: input.userId,
    email: input.email,
    module: 'auth',
    action: 'logout',
    entityType: 'login_event',
    entityId: closedId,
    summary: 'User signed out',
    ctx,
  });
}

function rowToUnifiedFromAudit(row: AuditEventRow): UnifiedAuditRow {
  return {
    id: row.id,
    source: 'audit_event',
    occurredAt: new Date(row.occurred_at).toISOString(),
    userId: row.user_id,
    email: row.email,
    module: row.module,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    summary: row.summary,
    ipAddress: row.ip_address,
    userAgent: row.user_agent,
    status: null,
    oldValue: row.old_value ?? null,
    newValue: row.new_value ?? null,
  };
}

function rowToUnifiedFromLogin(row: LoginEventRow): UnifiedAuditRow {
  const action =
    row.status === 'failed' ? 'failed_login' : row.status === 'logout' ? 'logout' : 'login';
  return {
    id: row.id,
    source: 'login_event',
    occurredAt: new Date(row.login_time).toISOString(),
    userId: row.user_id,
    email: row.email,
    module: 'auth',
    action,
    entityType: 'login_event',
    entityId: row.id,
    summary:
      row.status === 'failed'
        ? 'Failed sign-in attempt'
        : row.status === 'logout'
          ? 'Session ended'
          : 'User signed in',
    ipAddress: row.ip_address,
    userAgent: row.user_agent,
    status: row.status,
    oldValue: null,
    newValue: row.logout_time ? { logoutTime: new Date(row.logout_time).toISOString() } : null,
  };
}

export async function listUnifiedAuditTrail(
  client: pg.PoolClient,
  tenantId: string,
  filters: AuditListFilters = {}
): Promise<UnifiedAuditRow[]> {
  const limit = Math.min(Math.max(filters.limit ?? 200, 1), 500);
  const offset = Math.max(filters.offset ?? 0, 0);

  const auditParams: unknown[] = [tenantId];
  let auditQ = `SELECT id, tenant_id, user_id, email, module, action, entity_type, entity_id, summary,
                         old_value, new_value, ip_address, user_agent, occurred_at
                  FROM audit_events WHERE tenant_id = $1`;

  if (filters.userId) {
    auditParams.push(filters.userId);
    auditQ += ` AND user_id = $${auditParams.length}`;
  }
  if (filters.module) {
    auditParams.push(filters.module);
    auditQ += ` AND module = $${auditParams.length}`;
  }
  if (filters.action) {
    auditParams.push(filters.action);
    auditQ += ` AND action = $${auditParams.length}`;
  }
  if (filters.startDate) {
    auditParams.push(filters.startDate);
    auditQ += ` AND occurred_at >= $${auditParams.length}::date`;
  }
  if (filters.endDate) {
    auditParams.push(filters.endDate);
    auditQ += ` AND occurred_at < ($${auditParams.length}::date + INTERVAL '1 day')`;
  }

  auditQ += ` ORDER BY occurred_at DESC LIMIT ${limit + offset}`;

  const loginParams: unknown[] = [tenantId];
  let loginQ = `SELECT id, tenant_id, user_id, email, login_time, logout_time, ip_address, user_agent, status
                FROM login_events WHERE tenant_id = $1`;

  const includeLoginEvents = !filters.module || filters.module === 'auth';

  if (includeLoginEvents) {
    if (filters.userId) {
      loginParams.push(filters.userId);
      loginQ += ` AND user_id = $${loginParams.length}`;
    }
    if (filters.action) {
      const loginActionMap: Record<string, string> = {
        login: 'success',
        failed_login: 'failed',
        logout: 'logout',
      };
      const st = loginActionMap[filters.action];
      if (st) {
        loginParams.push(st);
        loginQ += ` AND status = $${loginParams.length}`;
      } else {
        loginQ += ` AND 1=0`;
      }
    }
    if (filters.startDate) {
      loginParams.push(filters.startDate);
      loginQ += ` AND login_time >= $${loginParams.length}::date`;
    }
    if (filters.endDate) {
      loginParams.push(filters.endDate);
      loginQ += ` AND login_time < ($${loginParams.length}::date + INTERVAL '1 day')`;
    }
    loginQ += ` ORDER BY login_time DESC LIMIT ${limit + offset}`;
  }

  const [auditRes, loginRes] = await Promise.all([
    client.query<AuditEventRow>(auditQ, auditParams),
    includeLoginEvents
      ? client.query<LoginEventRow>(loginQ, loginParams)
      : Promise.resolve({ rows: [] as LoginEventRow[] }),
  ]);

  const merged = [
    ...auditRes.rows.map(rowToUnifiedFromAudit),
    ...loginRes.rows.map(rowToUnifiedFromLogin),
  ];

  merged.sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : -1));

  const seen = new Set<string>();
  const deduped: UnifiedAuditRow[] = [];
  for (const row of merged) {
    const key = `${row.source}:${row.id}:${row.action}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(row);
  }

  return deduped.slice(offset, offset + limit);
}

export async function listAuditModules(
  client: pg.PoolClient,
  tenantId: string
): Promise<string[]> {
  const r = await client.query<{ module: string }>(
    `SELECT DISTINCT module FROM audit_events WHERE tenant_id = $1
     UNION SELECT 'auth' WHERE EXISTS (SELECT 1 FROM login_events WHERE tenant_id = $1)
     ORDER BY 1`,
    [tenantId]
  );
  return r.rows.map((x) => x.module);
}

export async function listAuditActions(
  client: pg.PoolClient,
  tenantId: string
): Promise<string[]> {
  const r = await client.query<{ action: string }>(
    `SELECT DISTINCT action FROM audit_events WHERE tenant_id = $1
     UNION SELECT unnest(ARRAY['login','logout','failed_login'])
     ORDER BY 1`,
    [tenantId]
  );
  return r.rows.map((x) => x.action);
}
