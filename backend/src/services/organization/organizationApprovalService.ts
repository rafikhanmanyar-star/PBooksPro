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
import { OrganizationRepository } from '../../modules/organization/repositories/OrganizationRepository.js';
import { seedTenantRbac } from '../../modules/rbac/services/seedTenantRbac.js';
import { withSavepoint } from '../../db/pool.js';

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

const orgRepo = new OrganizationRepository();

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
  const n = await orgRepo.nextRegistrationReference(client);
  const seq = Number(n);
  return `ORG-${year}-${String(seq).padStart(6, '0')}`;
}

export async function getTenantOrganizationStatus(
  client: PoolClient,
  tenantId: string
): Promise<{ status: OrganizationStatus; rejectionReason: string | null }> {
  const row = await orgRepo.getTenantStatus(client, tenantId);
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
    userId: null,
    email: input.adminEmail ?? undefined,
    module: 'system',
    action: input.action,
    entityType: 'organization',
    entityId: input.tenantId,
    summary: input.summary,
    oldValue: { status: input.previousStatus },
    newValue: {
      status: input.newStatus,
      reason: input.reason ?? null,
      platformAdminId: input.adminUserId,
    },
  });
}

function mapListRow(row: {
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
}): OrganizationRequestRow {
  return {
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
  };
}

function mapDetailRow(row: {
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
}): OrganizationRequestDetail {
  return {
    ...mapListRow(row),
    address: row.address,
    approvedAt: row.approved_at?.toISOString() ?? null,
    approvedBy: row.approved_by,
    rejectedAt: row.rejected_at?.toISOString() ?? null,
    rejectedBy: row.rejected_by,
    rejectionReason: row.rejection_reason,
  };
}

export async function listOrganizationRequests(
  client: PoolClient,
  options: { status?: OrganizationStatus; limit?: number; offset?: number }
): Promise<{ items: OrganizationRequestRow[]; total: number }> {
  const limit = Math.min(Math.max(options.limit ?? 100, 1), 500);
  const offset = Math.max(options.offset ?? 0, 0);
  const params: unknown[] = [];
  let where = "WHERE t.id !~ '^__'";
  if (options.status) {
    params.push(options.status);
    where += ` AND t.status = $${params.length}`;
  }

  const total = await orgRepo.countOrganizationRequests(client, where, params);
  params.push(limit, offset);
  const rows = await orgRepo.listOrganizationRequests(client, where, params);

  return {
    total,
    items: rows.map(mapListRow),
  };
}

export async function getOrganizationRequestDetail(
  client: PoolClient,
  tenantId: string
): Promise<OrganizationRequestDetail | null> {
  const row = await orgRepo.getOrganizationDetail(client, tenantId);
  if (!row) return null;
  return mapDetailRow(row as Parameters<typeof mapDetailRow>[0]);
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

  await orgRepo.approve(client, tenantId, adminUserId);

  try {
    await logOrganizationStatusChange(client, {
      tenantId,
      adminUserId,
      adminEmail,
      action: 'organization_approved',
      summary: 'Organization Approved',
      previousStatus,
      newStatus: 'ACTIVE',
    });
  } catch (err) {
    console.warn('[organizationApproval] Audit log failed on approve:', err);
  }

  return (await getOrganizationRequestDetail(client, tenantId))!;
}

/** Trial/onboarding provisioning after approval — safe to run outside the status transaction. */
export async function provisionApprovedOrganization(tenantId: string): Promise<void> {
  const { withTransaction } = await import('../../db/pool.js');
  await withTransaction(async (client) => {
    await withSavepoint(client, 'org_approve_trial', async (spClient) => {
      await startTrialSubscription(spClient, tenantId);
    }).catch((err) => {
      console.warn('[organizationApproval] Trial subscription not started on approve:', err);
    });

    await withSavepoint(client, 'org_approve_onboarding', async (spClient) => {
      await getOrCreateOnboarding(spClient, tenantId);
    }).catch((err) => {
      console.warn('[organizationApproval] Onboarding init failed on approve:', err);
    });
  }).catch((err) => {
    console.warn('[organizationApproval] Post-approval provisioning failed:', err);
  });
}

export async function notifyOrganizationApproved(detail: OrganizationRequestDetail): Promise<void> {
  const recipient = detail.ownerEmail ?? detail.email;
  if (!recipient) return;
  await sendOrganizationApprovedEmail(recipient, detail.name);
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

  await orgRepo.reject(client, tenantId, adminUserId, trimmedReason);
  await orgRepo.invalidateTenantSessions(client, tenantId);

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

  await orgRepo.suspend(client, tenantId);
  await orgRepo.invalidateTenantSessions(client, tenantId);

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

  await orgRepo.activate(client, tenantId, adminUserId);

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

  await orgRepo.insertPendingOrganization(client, {
    tenantId: input.tenantId,
    companyName: input.companyName,
    email: input.email,
    phone: input.phone ?? null,
    address: input.address ?? null,
    country: input.country ?? null,
    status: initialStatus,
    registrationReference,
  });

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
  options?: { skipTrial?: boolean; creatorUserId?: string }
): Promise<void> {
  await seedTenantRbac(client, tenantId, {
    creatorUserId: options?.creatorUserId,
    creatorRoleSlug: 'company_admin',
    assignedBy: options?.creatorUserId ?? null,
  });
  await bootstrapTenantChart(client, tenantId, { legacyIds: false });
  if (!options?.skipTrial && !isOrganizationApprovalEnabled()) {
    await startTrialSubscription(client, tenantId);
  }
  await getOrCreateOnboarding(client, tenantId);
}
