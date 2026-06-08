/**
 * Privacy data export — user, tenant, and personal data packages.
 */

import type pg from 'pg';
import { PRIVACY_EXPORT_FORMAT, type PrivacyExportScope } from '../../constants/privacyRequestTypes.js';
import { buildTenantBackupPayload } from '../tenantBackupService.js';

const USER_EXPORT_COLUMNS = [
  'id',
  'tenant_id',
  'username',
  'name',
  'role',
  'email',
  'is_active',
  'created_at',
  'updated_at',
] as const;

export type PrivacyUserExportPayload = {
  format: typeof PRIVACY_EXPORT_FORMAT;
  exportedAt: string;
  scope: 'data' | 'user';
  tenantId: string;
  userId: string;
  profile: Record<string, unknown>;
  auditEvents: unknown[];
  loginEvents: unknown[];
  legalAcceptances: unknown[];
  privacyRequests: unknown[];
};

export type PrivacyTenantExportPayload = {
  format: typeof PRIVACY_EXPORT_FORMAT;
  exportedAt: string;
  scope: 'tenant';
  tenantId: string;
  tenant: Record<string, unknown>;
  users: unknown[];
  tenantData: Awaited<ReturnType<typeof buildTenantBackupPayload>>;
  privacyRequests: unknown[];
};

async function tableExists(client: pg.PoolClient, table: string): Promise<boolean> {
  const r = await client.query(
    `SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = $1 LIMIT 1`,
    [table]
  );
  return r.rows.length > 0;
}

function sanitizeUserRow(row: pg.QueryResultRow): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const col of USER_EXPORT_COLUMNS) {
    if (row[col] !== undefined) out[col] = row[col];
  }
  return out;
}

export async function buildUserPrivacyExport(
  client: pg.PoolClient,
  tenantId: string,
  userId: string,
  scope: 'data' | 'user' = 'data'
): Promise<PrivacyUserExportPayload> {
  const { rows: userRows } = await client.query(
    `SELECT ${USER_EXPORT_COLUMNS.join(', ')} FROM users WHERE id = $1 AND tenant_id = $2`,
    [userId, tenantId]
  );
  if (userRows.length === 0) {
    throw new Error('User not found in this organization.');
  }

  const auditEvents: unknown[] = [];
  if (await tableExists(client, 'audit_events')) {
    const r = await client.query(
      `SELECT id, module, action, entity_type, entity_id, summary, ip_address, occurred_at
       FROM audit_events WHERE tenant_id = $1 AND user_id = $2
       ORDER BY occurred_at DESC LIMIT 500`,
      [tenantId, userId]
    );
    auditEvents.push(...r.rows);
  }

  const loginEvents: unknown[] = [];
  if (await tableExists(client, 'login_events')) {
    const r = await client.query(
      `SELECT id, email, login_time, logout_time, ip_address, user_agent, status
       FROM login_events WHERE tenant_id = $1 AND user_id = $2
       ORDER BY login_time DESC LIMIT 200`,
      [tenantId, userId]
    );
    loginEvents.push(...r.rows);
  }

  const legalAcceptances: unknown[] = [];
  if (await tableExists(client, 'legal_acceptance')) {
    const r = await client.query(
      `SELECT document_type, document_version, accepted_at, ip_address, context
       FROM legal_acceptance WHERE tenant_id = $1 AND user_id = $2
       ORDER BY accepted_at DESC`,
      [tenantId, userId]
    );
    legalAcceptances.push(...r.rows);
  }

  const privacyRequests: unknown[] = [];
  if (await tableExists(client, 'privacy_requests')) {
    const r = await client.query(
      `SELECT id, request_type, status, requested_at, completed_at, metadata
       FROM privacy_requests WHERE tenant_id = $1 AND requested_by_user_id = $2
       ORDER BY requested_at DESC LIMIT 100`,
      [tenantId, userId]
    );
    privacyRequests.push(...r.rows);
  }

  return {
    format: PRIVACY_EXPORT_FORMAT,
    exportedAt: new Date().toISOString(),
    scope,
    tenantId,
    userId,
    profile: sanitizeUserRow(userRows[0]!),
    auditEvents,
    loginEvents,
    legalAcceptances,
    privacyRequests,
  };
}

export async function buildTenantPrivacyExport(
  client: pg.PoolClient,
  tenantId: string
): Promise<PrivacyTenantExportPayload> {
  const { rows: tenantRows } = await client.query(
    `SELECT id, name, created_at, updated_at FROM tenants WHERE id = $1`,
    [tenantId]
  );
  if (tenantRows.length === 0) {
    throw new Error('Organization not found.');
  }

  const { rows: userRows } = await client.query(
    `SELECT ${USER_EXPORT_COLUMNS.join(', ')} FROM users WHERE tenant_id = $1 ORDER BY created_at`,
    [tenantId]
  );

  const privacyRequests: unknown[] = [];
  if (await tableExists(client, 'privacy_requests')) {
    const r = await client.query(
      `SELECT id, request_type, status, requested_at, completed_at, requested_by_user_id, metadata
       FROM privacy_requests WHERE tenant_id = $1 ORDER BY requested_at DESC LIMIT 200`,
      [tenantId]
    );
    privacyRequests.push(...r.rows);
  }

  const tenantData = await buildTenantBackupPayload(client, tenantId);

  return {
    format: PRIVACY_EXPORT_FORMAT,
    exportedAt: new Date().toISOString(),
    scope: 'tenant',
    tenantId,
    tenant: tenantRows[0] as Record<string, unknown>,
    users: userRows.map(sanitizeUserRow),
    tenantData,
    privacyRequests,
  };
}

export async function buildPrivacyExport(
  client: pg.PoolClient,
  tenantId: string,
  userId: string,
  scope: PrivacyExportScope
): Promise<PrivacyUserExportPayload | PrivacyTenantExportPayload> {
  if (scope === 'tenant') {
    return buildTenantPrivacyExport(client, tenantId);
  }
  return buildUserPrivacyExport(client, tenantId, userId, scope);
}

export function privacyExportFilename(
  scope: PrivacyExportScope,
  tenantId: string,
  userId?: string
): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  if (scope === 'tenant') return `pbooks-privacy-tenant-${tenantId}-${stamp}.json`;
  return `pbooks-privacy-user-${userId ?? 'self'}-${stamp}.json`;
}
