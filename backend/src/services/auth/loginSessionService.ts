import type { PoolClient } from 'pg';
import { signAccessToken, signMfaToken, signTenantSelectionToken } from '../../auth/jwt.js';
import {
  getMfaStatus,
  isMfaEnforcementEnabled,
  userRoleRequiresMfa,
} from './mfaService.js';
import { startTrialSubscription } from '../billing/subscriptionService.js';
import { recordLoginEvent } from '../enterpriseAuditService.js';
import type { MatchedUserAccount } from './userTenantService.js';
import {
  recordTenantSelection,
  toCompanySummaries,
  resolvePreferredCompanyId,
} from './userTenantService.js';
import { markUserLoggedIn, upsertUserSession } from './userSessionService.js';

export type LoginUserPayload = {
  id: string;
  email: string;
  username: string;
  name: string;
  fullName: string;
  role: string;
  tenantId: string;
  organizationId: string;
  displayTimezone: string | null;
  interfaceMode: string;
};

export type LoginCompanyPayload = {
  id: string;
  name: string;
  companyName: string;
};

function formatUserPayload(account: MatchedUserAccount): LoginUserPayload {
  const email = account.email?.trim() || '';
  return {
    id: account.userId,
    email,
    username: account.username,
    name: account.name,
    fullName: account.name,
    role: account.role,
    tenantId: account.tenantId,
    organizationId: account.tenantId,
    displayTimezone: account.displayTimezone,
    interfaceMode: account.interfaceMode,
  };
}

function formatCompanyPayload(account: MatchedUserAccount): LoginCompanyPayload {
  return {
    id: account.tenantId,
    name: account.tenantName,
    companyName: account.tenantName,
  };
}

export async function completeLoginForAccount(
  client: PoolClient,
  account: MatchedUserAccount,
  ctx: Parameters<typeof recordLoginEvent>[1]['ctx'],
  options?: { skipTrialBootstrap?: boolean; loginEventId?: string }
): Promise<
  | {
      kind: 'authenticated';
      token: string;
      loginEventId: string;
      user: LoginUserPayload;
      company: LoginCompanyPayload;
      tenant: LoginCompanyPayload;
    }
  | {
      kind: 'mfa_required';
      mfaToken: string;
      loginEventId: string;
      user: LoginUserPayload;
      company: LoginCompanyPayload;
      tenant: LoginCompanyPayload;
    }
  | {
      kind: 'mfa_setup_required';
      mfaSetupToken: string;
      loginEventId: string;
      user: LoginUserPayload;
      company: LoginCompanyPayload;
      tenant: LoginCompanyPayload;
    }
> {
  if (!options?.skipTrialBootstrap) {
    await startTrialSubscription(client, account.tenantId);
  }

  const loginEventId =
    options?.loginEventId ??
    (await recordLoginEvent(client, {
      tenantId: account.tenantId,
      userId: account.userId,
      email: account.email ?? account.username,
      status: 'success',
      ctx,
    }));

  await recordTenantSelection(client, account.userId, account.tenantId);
  await upsertUserSession(client, account.userId, account.tenantId, loginEventId);
  await markUserLoggedIn(client, account.userId, account.tenantId);

  const user = formatUserPayload(account);
  const company = formatCompanyPayload(account);

  if (isMfaEnforcementEnabled() && userRoleRequiresMfa(account.role)) {
    const mfaStatus = await getMfaStatus(client, account.userId, account.role);
    if (mfaStatus.enabled) {
      return {
        kind: 'mfa_required',
        mfaToken: signMfaToken(account.userId, account.tenantId, account.role, 'mfa_challenge', loginEventId),
        loginEventId,
        user,
        company,
        tenant: company,
      };
    }
    return {
      kind: 'mfa_setup_required',
      mfaSetupToken: signMfaToken(account.userId, account.tenantId, account.role, 'mfa_setup', loginEventId),
      loginEventId,
      user,
      company,
      tenant: company,
    };
  }

  return {
    kind: 'authenticated',
    token: signAccessToken(account.userId, account.tenantId, account.role),
    loginEventId,
    user,
    company,
    tenant: company,
  };
}

export function buildCompanySelectionResponse(
  accounts: MatchedUserAccount[],
  loginEventId?: string
) {
  const companies = toCompanySummaries(accounts);
  const preferredCompanyId = resolvePreferredCompanyId(accounts);
  return {
    requiresCompanySelection: true as const,
    selectionToken: signTenantSelectionToken(
      accounts.map((a) => ({ userId: a.userId, tenantId: a.tenantId })),
      loginEventId
    ),
    companies,
    preferredCompanyId,
    loginEventId,
  };
}
