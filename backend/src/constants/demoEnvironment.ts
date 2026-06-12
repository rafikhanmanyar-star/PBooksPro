/** Version-controlled demo template is applied via demoSeedService — not user-editable. */
export const DEMO_MASTER_TENANT_ID = '__demo_master__' as const;
export const DEMO_MASTER_TENANT_NAME = 'PBooksPro Demo Master (internal)';

/** Public sandbox — reset daily; visitors explore here. */
export const DEMO_PUBLIC_TENANT_ID = 'pbooks-demo' as const;
export const DEMO_PUBLIC_TENANT_NAME = 'PBooksPro Live Demo';

/** In-person customer presentations — same sample data, never auto-reset on login/logout. */
export const DEMO_PRESENTATION_TENANT_ID = 'demo-company' as const;
export const DEMO_PRESENTATION_TENANT_NAME = 'Demo Company';
export const DEMO_PRESENTATION_EMAIL = 'demo@company.com';
export const DEMO_PRESENTATION_USER_ID = 'user_demo_company';

export function configuredPresentationTenantId(): string | undefined {
  const id = process.env.DEMO_PRESENTATION_TENANT_ID?.trim();
  return id || undefined;
}

/** Matches local `demo-company` and cloud-registered orgs like `demo-company-7dcf84`. */
export function isDemoPresentationTenant(tenantId: string | undefined): boolean {
  if (!tenantId) return false;
  const configured = configuredPresentationTenantId();
  if (configured && tenantId === configured) return true;
  if (tenantId === DEMO_PRESENTATION_TENANT_ID) return true;
  return tenantId.startsWith('demo-company');
}

/** Public demo sandbox trial length — counted from tenant creation. */
export const DEMO_TRIAL_DAYS = 7;

export function getDemoTrialDays(): number {
  const raw = Number(process.env.DEMO_TRIAL_DAYS);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : DEMO_TRIAL_DAYS;
}

/** All product areas visible in the live demo (rental, selling, construction). */
export const DEMO_LICENSE_MODULES = ['all'] as const;

/** Max ledger transactions in the sandbox (seeded sample data + visitor entries). */
export const DEMO_MAX_TRANSACTIONS = 50;

/** Max construction/selling projects visitors can have in total (includes seeded projects). */
export const DEMO_MAX_PROJECTS = 8;

export function getDemoMaxTransactions(): number {
  const raw = Number(process.env.DEMO_MAX_TRANSACTIONS);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : DEMO_MAX_TRANSACTIONS;
}

export function getDemoMaxProjects(): number {
  const raw = Number(process.env.DEMO_MAX_PROJECTS);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : DEMO_MAX_PROJECTS;
}

export const DEMO_INTERNAL_TENANT_IDS = new Set<string>([
  DEMO_MASTER_TENANT_ID,
  '__integration_test__',
]);

export function isDemoPublicTenant(tenantId: string | undefined): boolean {
  return tenantId === DEMO_PUBLIC_TENANT_ID;
}

export const DEMO_DEFAULT_USERNAME = 'demo';
export const DEMO_DEFAULT_USER_ID = 'user_demo_pbooks';

export function isDemoMasterTenant(tenantId: string | undefined): boolean {
  return tenantId === DEMO_MASTER_TENANT_ID;
}

export function isDemoEnvironmentEnabled(): boolean {
  return process.env.DEMO_ENVIRONMENT_ENABLED === 'true';
}

export function isDemoPublicLoginEnabled(): boolean {
  return isDemoEnvironmentEnabled() && process.env.DEMO_PUBLIC_LOGIN_ENABLED === 'true';
}
