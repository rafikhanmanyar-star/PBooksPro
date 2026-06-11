/**
 * Privacy data export — user, tenant, and personal data packages.
 */

import type pg from 'pg';
import { PRIVACY_EXPORT_FORMAT, type PrivacyExportScope } from '../../constants/privacyRequestTypes.js';
import { buildTenantBackupPayload } from '../tenantBackupService.js';
import {
  PrivacyDataExportRepository,
  sanitizeUserRow,
} from '../../modules/privacy/repositories/PrivacyRepository.js';

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

const exportRepo = new PrivacyDataExportRepository();

export async function buildUserPrivacyExport(
  client: pg.PoolClient,
  tenantId: string,
  userId: string,
  scope: 'data' | 'user' = 'data'
): Promise<PrivacyUserExportPayload> {
  const profileRow = await exportRepo.getUserProfile(client, tenantId, userId);
  if (!profileRow) {
    throw new Error('User not found in this organization.');
  }

  const auditEvents: unknown[] = [];
  if (await exportRepo.tableExists(client, 'audit_events')) {
    auditEvents.push(...(await exportRepo.listUserAuditEvents(client, tenantId, userId)));
  }

  const loginEvents: unknown[] = [];
  if (await exportRepo.tableExists(client, 'login_events')) {
    loginEvents.push(...(await exportRepo.listUserLoginEvents(client, tenantId, userId)));
  }

  const legalAcceptances: unknown[] = [];
  if (await exportRepo.tableExists(client, 'legal_acceptance')) {
    legalAcceptances.push(...(await exportRepo.listUserLegalAcceptances(client, tenantId, userId)));
  }

  const privacyRequests: unknown[] = [];
  if (await exportRepo.tableExists(client, 'privacy_requests')) {
    privacyRequests.push(...(await exportRepo.listUserPrivacyRequests(client, tenantId, userId)));
  }

  return {
    format: PRIVACY_EXPORT_FORMAT,
    exportedAt: new Date().toISOString(),
    scope,
    tenantId,
    userId,
    profile: sanitizeUserRow(profileRow),
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
  const tenantRow = await exportRepo.getTenantRow(client, tenantId);
  if (!tenantRow) {
    throw new Error('Organization not found.');
  }

  const users = await exportRepo.listTenantUsers(client, tenantId);

  const privacyRequests: unknown[] = [];
  if (await exportRepo.tableExists(client, 'privacy_requests')) {
    privacyRequests.push(...(await exportRepo.listTenantPrivacyRequests(client, tenantId)));
  }

  const tenantData = await buildTenantBackupPayload(client, tenantId);

  return {
    format: PRIVACY_EXPORT_FORMAT,
    exportedAt: new Date().toISOString(),
    scope: 'tenant',
    tenantId,
    tenant: tenantRow as Record<string, unknown>,
    users,
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
