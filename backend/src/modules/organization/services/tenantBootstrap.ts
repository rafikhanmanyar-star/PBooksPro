import { SYSTEM_ACCOUNT_DEFS, SYSTEM_CATEGORY_DEFS } from '../../../constants/systemChartDefs.js';
import { TenantChartRepository } from '../../../core/repositories/TenantMaintenanceRepository.js';

export { SYSTEM_ACCOUNT_DEFS, SYSTEM_CATEGORY_DEFS } from '../../../constants/systemChartDefs.js';

/**
 * Legacy helper for migrations / import scripts that still remap old `tenantId__logicalId` PKs.
 * New installs use canonical `logicalId` only with `tenant_id = GLOBAL_SYSTEM_TENANT_ID`.
 */
export function storageIdForTenant(tenantId: string, logicalId: string, legacyIds: boolean): string {
  if (legacyIds) return logicalId;
  return `${tenantId}__${logicalId}`;
}

type Queryable = { query: (text: string, params?: unknown[]) => Promise<unknown> };

/**
 * Idempotent inserts for shared system accounts and categories (one row per logical id for all tenants).
 * `tenantId` / `legacyIds` are kept for API compatibility; chart rows always use GLOBAL_SYSTEM_TENANT_ID.
 */
export async function bootstrapTenantChart(
  client: Queryable,
  _tenantId: string,
  _options: { legacyIds: boolean }
): Promise<void> {
  const repo = new TenantChartRepository();
  await repo.ensureGlobalTenant(client);
  await repo.insertSystemAccounts(client);
  await repo.insertSystemCategories(client);
}
