import type pg from 'pg';
import type { Request } from 'express';
import {
  AuditEventRepository,
  type AuditEventRow,
  type LoginEventRow,
} from '../../../core/repositories/AuditEventRepository.js';

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
  | 'privacy'
  | 'rbac';

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

export type { AuditEventRow, LoginEventRow };

export type UnifiedAuditRow = {
  id: string;
  source: 'audit_event' | 'login_event';
  tenantId: string;
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

export async function appendAuditEvent(
  client: pg.PoolClient,
  input: AppendAuditEventInput
): Promise<string> {
  const tenantId = input.tenantId?.trim();
  if (!tenantId) {
    throw new Error('appendAuditEvent requires a tenantId');
  }

  const ctx = input.ctx ?? {};
  return new AuditEventRepository(tenantId).insertAuditEvent(client, {
    userId: input.userId,
    email: input.email,
    module: input.module,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    summary: input.summary,
    oldValue: input.oldValue,
    newValue: input.newValue,
    ipAddress: ctx.ipAddress ?? null,
    userAgent: ctx.userAgent ?? null,
    occurredAt: input.occurredAt,
  });
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
  const ctx = input.ctx ?? {};
  const repo = new AuditEventRepository(input.tenantId);
  const id = await repo.insertLoginEvent(client, {
    userId: input.userId,
    email: input.email,
    status: input.status,
    ipAddress: ctx.ipAddress ?? null,
    userAgent: ctx.userAgent ?? null,
  });

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
  const repo = new AuditEventRepository(input.tenantId);
  let closedId = input.loginEventId ?? null;

  if (closedId) {
    await repo.closeLoginEvent(client, closedId, input.userId);
  } else {
    closedId = await repo.findOpenLoginSession(client, input.userId);
    if (closedId) {
      await repo.closeLoginEventById(client, closedId);
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
    tenantId: row.tenant_id,
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
    tenantId: row.tenant_id,
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
  const repo = new AuditEventRepository(tenantId);
  const includeLoginEvents = !filters.module || filters.module === 'auth';

  const [auditRes, loginRes] = await Promise.all([
    repo.queryAuditEvents(client, {
      userId: filters.userId,
      module: filters.module,
      action: filters.action,
      startDate: filters.startDate,
      endDate: filters.endDate,
      limit,
      offset,
    }),
    includeLoginEvents
      ? repo.queryLoginEvents(client, {
          userId: filters.userId,
          action: filters.action,
          startDate: filters.startDate,
          endDate: filters.endDate,
          limit,
          offset,
        })
      : Promise.resolve([] as LoginEventRow[]),
  ]);

  const merged = [
    ...auditRes.filter((row) => row.tenant_id === tenantId).map(rowToUnifiedFromAudit),
    ...loginRes.filter((row) => row.tenant_id === tenantId).map(rowToUnifiedFromLogin),
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

/** Defense-in-depth: drop rows whose source tenant does not match the session tenant. */
export function filterUnifiedAuditRowsForTenant(
  rows: UnifiedAuditRow[],
  tenantId: string
): UnifiedAuditRow[] {
  const expected = tenantId.trim();
  if (!expected) return [];
  return rows.filter((row) => row.tenantId === expected);
}

export async function listAuditModules(
  client: pg.PoolClient,
  tenantId: string
): Promise<string[]> {
  return new AuditEventRepository(tenantId).listDistinctModules(client);
}

export async function listAuditActions(
  client: pg.PoolClient,
  tenantId: string
): Promise<string[]> {
  return new AuditEventRepository(tenantId).listDistinctActions(client);
}
