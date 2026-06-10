import type { PoolClient } from 'pg';
import {
  type OrganizationStatus,
  isOrganizationStatus,
  ORG_STATUS_LOGIN_MESSAGES,
  isOrganizationApprovalEnabled,
} from '../../constants/organizationStatus.js';
import type { MatchedUserAccount } from '../auth/userTenantService.js';
import { appendAuditEvent } from '../enterpriseAuditService.js';
import { bootstrapTenantChart } from '../tenantBootstrap.js';
import { getOrCreateOnboarding } from '../onboarding/onboardingService.js';
import { startTrialSubscription } from '../billing/subscriptionService.js';
import {
  sendOrganizationApprovedEmail,
  sendOrganizationRejectedEmail,
} from './organizationApprovalEmailService.js';
import { captureMonitoringEvent } from '../monitoring/monitoringCapture.js';

export type OrganizationRequestRow = {
  id: string;
  name: string;
  companyName: string | null;
  email: string | null;
  phone: string | null;
  country: string | null;
  status: OrganizationStatus;
  registrationReference: string | null;
  createdAt: string;
  ownerName: string | null;
  ownerEmail: string | null;
};

export type OrganizationRequestDetail = OrganizationRequestRow & {
  address: string | null;
  approvedAt: string | null;
  approvedBy: string | null;
  rejectedAt: string | null;
  rejectedBy: string | null;
  rejectionReason: string | null;
};

export class OrganizationAccessDeniedError extends Error {
  readonly code: string;
  readonly title: string;
  readonly orgStatus: OrganizationStatus;
  readonly rejectionReason?: string | null;

  constructor(status: Exclude<OrganizationStatus, 'ACTIVE'>, rejectionReason?: string | null) {
    const meta = ORG_STATUS_LOGIN_MESSAGES[status];
    const reasonSuffix =
      status === 'REJECTED' && rejectionReason?.trim()
        ? ` Reason: ${rejectionReason.trim()}`
        : '';
    super(`${meta.message}${reasonSuffix}`);
    this.name = 'OrganizationAccessDeniedError';
    this.code = meta.code;
    this.title = meta.title;
    this.orgStatus = status;
    this.rejectionReason = rejectionReason ?? null;
  }
}

export async function allocateRegistrationReference(client: PoolClient): Promise<string> {
  const year = new Date().getFullYear();
  const r = await client.query<{ n: string }>(
    `SELECT nextval('tenant_registration_ref_seq')::text AS n`
  );
  const seq = Number(r.rows[0]?.n ?? 1);
  return `ORG-${year}-${String(seq).padStart(6, '0')}`;
}

export async function getTenantOrganizationStatus(
  client: PoolClient,
  tenantId: string
): Promise<{ status: OrganizationStatus; rejectionReason: string | null }> {
  const r = await client.query<{ status: string; rejection_reason: string | null }>(
    `SELECT status, rejection_reason FROM tenants WHERE id = $1`,
    [tenantId]
  );
  const row = r.rows[0];
  if (!row) {
    return { status: 'ACTIVE', rejectionReason: null };
  }
  const status = isOrganizationStatus(row.status) ? row.status : 'ACTIVE';
  return { status, rejectionReason: row.rejection_reason };
}

export function assertTenantMayAuthenticate(
  status: OrganizationStatus,
  rejectionReason?: string | null
): void {
  if (!isOrganizationApprovalEnabled()) return;
  if (status === 'ACTIVE') return;
  throw new OrganizationAccessDeniedError(status, rejectionReason);
}

function resolveAccountOrgStatus(account: MatchedUserAccount): OrganizationStatus {
  return isOrganizationStatus(account.organizationStatus)
    ? account.organizationStatus
    : 'ACTIVE';
}

export function filterLoginEligibleAccounts(accounts: MatchedUserAccount[]): MatchedUserAccount[] {
  if (!isOrganizationApprovalEnabled()) return accounts;
  return accounts.filter((account) => resolveAccountOrgStatus(account) === 'ACTIVE');
}

export function organizationLoginBlockError(
  accounts: MatchedUserAccount[]
): OrganizationAccessDeniedError | null {
  if (!isOrganizationApprovalEnabled() || accounts.length === 0) return null;
  if (filterLoginEligibleAccounts(accounts).length > 0) return null;
  const status = resolveAccountOrgStatus(accounts[0]!);
  if (status === 'ACTIVE') return null;
  return new OrganizationAccessDeniedError(status, accounts[0]!.rejectionReason);
}

export function assertAccountMayLogin(account: MatchedUserAccount): void {
  assertTenantMayAuthenticate(resolveAccountOrgStatus(account), account.rejectionReason);
}

async function logOrganizationStatusChange(
  client: PoolClient,
  input: {
    tenantId: string;
    adminUserId: string;
    adminEmail?: string | null;
    action: string;
    summary: string;
    previousStatus: OrganizationStatus;
    newStatus: OrganizationStatus;
    reason?: string | null;
  }
): Promise<void> {
  await appendAuditEvent(client, {
    tenantId: input.tenantId,
    userId: input.adminUserId,
    email: input.adminEmail ?? undefined,
    module: 'system',
    action: input.action,
    entityType: 'organization',
    entityId: input.tenantId,
    summary: input.summary,
    oldValue: { status: input.previousStatus },
    newValue: { status: input.newStatus, reason: input.reason ?? null },
  });
}

async function invalidateTenantSessions(client: PoolClient, tenantId: string): Promise<void> {
  try {
    await client.query(`DELETE FROM user_sessions WHERE tenant_id = $1`, [tenantId]);
  } catch {
    /* user_sessions may not exist on all deployments */
  }
}

export async function listOrganizationRequests(
  client: PoolClient,
  options: { status?: OrganizationStatus; limit?: number; offset?: number }
): Promise<{ items: OrganizationRequestRow[]; total: number }> {
  const limit = Math.min(Math.max(options.limit ?? 100, 1), 500);
  const offset = Math.max(options.offset ?? 0, 0);
  const params: unknown[] = [];
  let where = 'WHERE t.id !~ \'^__\'';
  if (options.status) {
    params.push(options.status);
    where += ` AND t.status = $${params.length}`;
  }

  const countR = await client.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM tenants t ${where}`,
    params
  );
  params.push(limit, offset);
  const listR = await client.query<{
    id: string;
    name: string;
    company_name: string | null;
    email: string | null;
    phone: string | null;
    country: string | null;
    status: string;
    registration_reference: string | null;
    created_at: Date;
    owner_name: string | null;
    owner_email: string | null;
  }>(
    `SELECT t.id, t.name, t.company_name, t.email, t.phone, t.country, t.status,
            t.registration_reference, t.created_at,
            u.name AS owner_name, u.email AS owner_email
     FROM tenants t
     LEFT JOIN LATERAL (
       SELECT name, email FROM users
       WHERE tenant_id = t.id AND role IN ('Admin', 'admin', 'SUPER_ADMIN', 'super_admin')
       ORDER BY created_at ASC
       LIMIT 1
     ) u ON TRUE
     ${where}
     ORDER BY t.created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  return {
    total: Number(countR.rows[0]?.count ?? 0),
    items: listR.rows.map((row) => ({
      id: row.id,
      name: row.name,
      companyName: row.company_name,
      email: row.email,
      phone: row.phone,
      country: row.country,
      status: (isOrganizationStatus(row.status) ? row.status : 'ACTIVE') as OrganizationStatus,
      registrationReference: row.registration_reference,
      createdAt: row.created_at.toISOString(),
      ownerName: row.owner_name,
      ownerEmail: row.owner_email,
    })),
  };
}

export async function getOrganizationRequestDetail(
  client: PoolClient,
  tenantId: string
): Promise<OrganizationRequestDetail | null> {
  const r = await client.query<{
    id: string;
    name: string;
    company_name: string | null;
    email: string | null;
    phone: string | null;
    country: string | null;
    address: string | null;
    status: string;
    registration_reference: string | null;
    created_at: Date;
    approved_at: Date | null;
    approved_by: string | null;
    rejected_at: Date | null;
    rejected_by: string | null;
    rejection_reason: string | null;
    owner_name: string | null;
    owner_email: string | null;
  }>(
    `SELECT t.id, t.name, t.company_name, t.email, t.phone, t.country, t.address, t.status,
            t.registration_reference, t.created_at, t.approved_at, t.approved_by,
            t.rejected_at, t.rejected_by, t.rejection_reason,
            u.name AS owner_name, u.email AS owner_email
     FROM tenants t
     LEFT JOIN LATERAL (
       SELECT name, email FROM users
       WHERE tenant_id = t.id AND role IN ('Admin', 'admin', 'SUPER_ADMIN', 'super_admin')
       ORDER BY created_at ASC
       LIMIT 1
     ) u ON TRUE
     WHERE t.id = $1`,
    [tenantId]
  );
  const row = r.rows[0];
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    companyName: row.company_name,
    email: row.email,
    phone: row.phone,
    country: row.country,
    address: row.address,
    status: (isOrganizationStatus(row.status) ? row.status : 'ACTIVE') as OrganizationStatus,
    registrationReference: row.registration_reference,
    createdAt: row.created_at.toISOString(),
    ownerName: row.owner_name,
    ownerEmail: row.owner_email,
    approvedAt: row.approved_at?.toISOString() ?? null,
    approvedBy: row.approved_by,
    rejectedAt: row.rejected_at?.toISOString() ?? null,
    rejectedBy: row.rejected_by,
    rejectionReason: row.rejection_reason,
  };
}

export async function approveOrganization(
  client: PoolClient,
  tenantId: string,
  adminUserId: string,
  adminEmail?: string | null
): Promise<OrganizationRequestDetail> {
  const current = await getOrganizationRequestDetail(client, tenantId);
  if (!current) throw new Error('Organization not found');
  const previousStatus = current.status;
  if (previousStatus === 'ACTIVE') return current;

  await client.query(
    `UPDATE tenants
     SET status = 'ACTIVE',
         approved_by = $2,
         approved_at = NOW(),
         rejected_by = NULL,
         rejected_at = NULL,
         rejection_reason = NULL,
         updated_at = NOW()
     WHERE id = $1`,
    [tenantId, adminUserId]
  );

  await startTrialSubscription(client, tenantId);
  await getOrCreateOnboarding(client, tenantId);

  await logOrganizationStatusChange(client, {
    tenantId,
    adminUserId,
    adminEmail,
    action: 'organization_approved',
    summary: 'Organization Approved',
    previousStatus,
    newStatus: 'ACTIVE',
  });

  const detail = (await getOrganizationRequestDetail(client, tenantId))!;
  const recipient = detail.ownerEmail ?? detail.email;
  if (recipient) {
    void sendOrganizationApprovedEmail(recipient, detail.name);
  }
  return detail;
}

export async function rejectOrganization(
  client: PoolClient,
  tenantId: string,
  adminUserId: string,
  reason: string,
  adminEmail?: string | null
): Promise<OrganizationRequestDetail> {
  const trimmedReason = reason.trim();
  if (!trimmedReason) throw new Error('Rejection reason is required');

  const current = await getOrganizationRequestDetail(client, tenantId);
  if (!current) throw new Error('Organization not found');
  const previousStatus = current.status;

  await client.query(
    `UPDATE tenants
     SET status = 'REJECTED',
         rejected_by = $2,
         rejected_at = NOW(),
         rejection_reason = $3,
         updated_at = NOW()
     WHERE id = $1`,
    [tenantId, adminUserId, trimmedReason]
  );

  await invalidateTenantSessions(client, tenantId);

  await logOrganizationStatusChange(client, {
    tenantId,
    adminUserId,
    adminEmail,
    action: 'organization_rejected',
    summary: 'Organization Rejected',
    previousStatus,
    newStatus: 'REJECTED',
    reason: trimmedReason,
  });

  const detail = (await getOrganizationRequestDetail(client, tenantId))!;
  const recipient = detail.ownerEmail ?? detail.email;
  if (recipient) {
    void sendOrganizationRejectedEmail(recipient, detail.name, trimmedReason);
  }
  return detail;
}

export async function suspendOrganization(
  client: PoolClient,
  tenantId: string,
  adminUserId: string,
  adminEmail?: string | null
): Promise<OrganizationRequestDetail> {
  const current = await getOrganizationRequestDetail(client, tenantId);
  if (!current) throw new Error('Organization not found');
  const previousStatus = current.status;

  await client.query(
    `UPDATE tenants SET status = 'SUSPENDED', updated_at = NOW() WHERE id = $1`,
    [tenantId]
  );
  await invalidateTenantSessions(client, tenantId);

  await logOrganizationStatusChange(client, {
    tenantId,
    adminUserId,
    adminEmail,
    action: 'organization_suspended',
    summary: 'Organization Suspended',
    previousStatus,
    newStatus: 'SUSPENDED',
  });

  return (await getOrganizationRequestDetail(client, tenantId))!;
}

export async function activateOrganization(
  client: PoolClient,
  tenantId: string,
  adminUserId: string,
  adminEmail?: string | null
): Promise<OrganizationRequestDetail> {
  const current = await getOrganizationRequestDetail(client, tenantId);
  if (!current) throw new Error('Organization not found');
  const previousStatus = current.status;

  await client.query(
    `UPDATE tenants
     SET status = 'ACTIVE',
         approved_by = COALESCE(approved_by, $2),
         approved_at = COALESCE(approved_at, NOW()),
         updated_at = NOW()
     WHERE id = $1`,
    [tenantId, adminUserId]
  );

  await logOrganizationStatusChange(client, {
    tenantId,
    adminUserId,
    adminEmail,
    action: 'organization_activated',
    summary: 'Organization Activated',
    previousStatus,
    newStatus: 'ACTIVE',
  });

  return (await getOrganizationRequestDetail(client, tenantId))!;
}

export async function registerPendingOrganization(
  client: PoolClient,
  input: {
    tenantId: string;
    companyName: string;
    email: string;
    phone?: string;
    address?: string;
    country?: string;
  }
): Promise<{ registrationReference: string }> {
  const registrationReference = await allocateRegistrationReference(client);
  const initialStatus: OrganizationStatus = isOrganizationApprovalEnabled() ? 'PENDING' : 'ACTIVE';

  await client.query(
    `INSERT INTO tenants (
       id, name, company_name, email, phone, address, country, status, registration_reference
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      input.tenantId,
      input.companyName,
      input.companyName,
      input.email,
      input.phone ?? null,
      input.address ?? null,
      input.country ?? null,
      initialStatus,
      registrationReference,
    ]
  );

  if (initialStatus === 'PENDING') {
    captureMonitoringEvent({
      category: 'user_activity',
      severity: 'info',
      message: 'New Organization Registration Request',
      code: 'ORG_REGISTRATION_PENDING',
      tenantId: input.tenantId,
      metadata: {
        companyName: input.companyName,
        email: input.email,
        registrationReference,
      },
    });
  }

  return { registrationReference };
}

export async function bootstrapNewOrganizationData(
  client: PoolClient,
  tenantId: string,
  options?: { skipTrial?: boolean }
): Promise<void> {
  await bootstrapTenantChart(client, tenantId, { legacyIds: false });
  if (!options?.skipTrial && !isOrganizationApprovalEnabled()) {
    await startTrialSubscription(client, tenantId);
  }
  await getOrCreateOnboarding(client, tenantId);
}
