import type { Pool, PoolClient } from 'pg';
import bcrypt from 'bcryptjs';
import { isInternalDemoTenantId } from '../../middleware/demoEnvironmentMiddleware.js';
import {
  UserTenantMembershipRepository,
  UserTenantRepository,
  type UserTenantAccountRow,
} from '../../modules/auth/repositories/AuthRepository.js';

export type TenantCompanySummary = {
  id: string;
  name: string;
};

export type MatchedUserAccount = {
  userId: string;
  tenantId: string;
  role: string;
  username: string;
  name: string;
  passwordHash: string;
  tenantName: string;
  displayTimezone: string | null;
  interfaceMode: string;
  email: string | null;
  lastTenantId: string | null;
  organizationStatus: string;
  rejectionReason: string | null;
};

type Queryable = Pool | PoolClient;

const userTenantRepo = new UserTenantRepository();
const membershipRepo = new UserTenantMembershipRepository();

function normalizeLoginIdentifier(value: string): string {
  return value.trim().toLowerCase();
}

function mapAccountRow(row: UserTenantAccountRow): MatchedUserAccount {
  return {
    userId: row.user_id,
    tenantId: row.tenant_id,
    role: row.role,
    username: row.username,
    name: row.name,
    passwordHash: row.password_hash,
    tenantName: row.tenant_name,
    displayTimezone: row.display_timezone ?? null,
    interfaceMode: row.interface_mode ?? 'auto',
    email: row.email,
    lastTenantId: row.last_tenant_id,
    organizationStatus: row.organization_status ?? 'ACTIVE',
    rejectionReason: row.rejection_reason ?? null,
  };
}

/**
 * Find active user accounts matching email (case-insensitive).
 * Excludes internal demo master tenants.
 */
export async function findAccountsByLoginIdentifier(
  db: Queryable,
  identifier: string
): Promise<MatchedUserAccount[]> {
  const normalized = normalizeLoginIdentifier(identifier);
  if (!normalized) return [];

  const rows = await userTenantRepo.findAccountsByLoginIdentifier(db, normalized);

  return rows
    .filter((row) => !isInternalDemoTenantId(row.tenant_id))
    .map(mapAccountRow);
}

export async function filterAccountsByPassword(
  accounts: MatchedUserAccount[],
  password: string
): Promise<MatchedUserAccount[]> {
  const matched: MatchedUserAccount[] = [];
  for (const account of accounts) {
    const ok = await bcrypt.compare(password, account.passwordHash);
    if (ok) matched.push(account);
  }
  return matched;
}

export function toCompanySummaries(accounts: MatchedUserAccount[]): TenantCompanySummary[] {
  const seen = new Set<string>();
  const companies: TenantCompanySummary[] = [];
  for (const account of accounts) {
    if (seen.has(account.tenantId)) continue;
    seen.add(account.tenantId);
    companies.push({ id: account.tenantId, name: account.tenantName });
  }
  return companies;
}

export function resolvePreferredCompanyId(accounts: MatchedUserAccount[]): string | null {
  const withPreference = accounts.filter((a) => a.lastTenantId);
  if (withPreference.length === 0) return null;
  const preferred = withPreference.find((a) => a.lastTenantId === a.tenantId);
  if (preferred) return preferred.tenantId;
  return withPreference[0]!.lastTenantId;
}

export async function getUserTenantsForUser(
  db: Queryable,
  userId: string,
  _currentTenantId: string
): Promise<TenantCompanySummary[]> {
  const row = await userTenantRepo.getUserEmailAndUsername(db, userId);
  if (!row) return [];

  const identifier = normalizeLoginIdentifier(row.email?.trim() || row.username);
  const accounts = await findAccountsByLoginIdentifier(db, identifier);
  return toCompanySummaries(accounts);
}

export type OrganizationTenantSummary = {
  id: string;
  name: string;
  company_name: string;
  email: string;
};

export async function findTenantsByOrganizationEmail(
  db: Queryable,
  organizationEmail: string
): Promise<OrganizationTenantSummary[]> {
  const normalized = normalizeLoginIdentifier(organizationEmail);
  if (!normalized) return [];

  const rows = await userTenantRepo.findTenantsByOrganizationEmail(db, normalized);
  return rows
    .filter((row) => !isInternalDemoTenantId(row.id))
    .map((row) => ({
      id: row.id,
      name: row.name,
      company_name: row.name,
      email: row.email?.trim() || organizationEmail.trim(),
    }));
}

export async function findAccountByTenantAndUsername(
  db: Queryable,
  tenantId: string,
  username: string
): Promise<MatchedUserAccount | null> {
  const normalized = normalizeLoginIdentifier(username);
  if (!normalized || !tenantId.trim()) return null;

  const account = await userTenantRepo.findAccountByTenantAndUsername(db, tenantId, normalized);
  if (!account || isInternalDemoTenantId(account.tenant_id)) return null;

  return mapAccountRow(account);
}

export async function authenticateByOrgEmailAndUsername(
  db: Queryable,
  organizationEmail: string,
  username: string,
  password: string
): Promise<MatchedUserAccount[]> {
  const tenants = await findTenantsByOrganizationEmail(db, organizationEmail);
  if (tenants.length === 0) return [];

  const matched: MatchedUserAccount[] = [];
  for (const tenant of tenants) {
    const account = await findAccountByTenantAndUsername(db, tenant.id, username);
    if (!account) continue;
    const [verified] = await filterAccountsByPassword([account], password);
    if (verified) matched.push(verified);
  }
  return matched;
}

export async function findAccountForTenantByLoginIdentifier(
  db: Queryable,
  tenantId: string,
  loginIdentifier: string
): Promise<MatchedUserAccount | null> {
  const normalized = normalizeLoginIdentifier(loginIdentifier);
  if (!normalized) return null;

  const account = await userTenantRepo.findAccountForTenantByLoginIdentifier(
    db,
    tenantId,
    normalized
  );
  if (!account || isInternalDemoTenantId(account.tenant_id)) return null;

  return mapAccountRow(account);
}

export async function userHasTenantAccess(
  db: Queryable,
  userId: string,
  tenantId: string,
  loginIdentifier?: string
): Promise<MatchedUserAccount | null> {
  const account = await userTenantRepo.userHasTenantAccess(
    db,
    tenantId,
    userId,
    loginIdentifier ?? null
  );
  if (!account || isInternalDemoTenantId(account.tenant_id)) return null;

  return mapAccountRow(account);
}

export async function recordTenantSelection(
  db: Queryable,
  userId: string,
  tenantId: string
): Promise<void> {
  await userTenantRepo.recordTenantSelection(db, userId, tenantId);
}

export async function ensureUserTenantMembership(
  client: PoolClient,
  userId: string,
  tenantId: string,
  role: string
): Promise<void> {
  await membershipRepo.ensureMembership(client, userId, tenantId, role);
}
