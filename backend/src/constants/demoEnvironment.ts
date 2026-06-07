/** Version-controlled demo template is applied via demoSeedService — not user-editable. */
export const DEMO_MASTER_TENANT_ID = '__demo_master__' as const;
export const DEMO_MASTER_TENANT_NAME = 'PBooksPro Demo Master (internal)';

/** Public sandbox — reset daily; visitors explore here. */
export const DEMO_PUBLIC_TENANT_ID = 'pbooks-demo' as const;
export const DEMO_PUBLIC_TENANT_NAME = 'PBooksPro Live Demo';

export const DEMO_DEFAULT_USERNAME = 'demo';
export const DEMO_DEFAULT_USER_ID = 'user_demo_pbooks';

export const DEMO_INTERNAL_TENANT_IDS = new Set<string>([
  DEMO_MASTER_TENANT_ID,
  '__integration_test__',
]);

export function isDemoPublicTenant(tenantId: string | undefined): boolean {
  return tenantId === DEMO_PUBLIC_TENANT_ID;
}

export function isDemoMasterTenant(tenantId: string | undefined): boolean {
  return tenantId === DEMO_MASTER_TENANT_ID;
}

export function isDemoEnvironmentEnabled(): boolean {
  return process.env.DEMO_ENVIRONMENT_ENABLED === 'true';
}

export function isDemoPublicLoginEnabled(): boolean {
  return isDemoEnvironmentEnabled() && process.env.DEMO_PUBLIC_LOGIN_ENABLED === 'true';
}
