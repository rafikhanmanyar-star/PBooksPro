/**
 * Pull payroll entities from PostgreSQL (LAN API) into localStorage cache so existing
 * payroll UI (storageService) works unchanged in API mode.
 */

export type { SyncPayrollFromServerOptions } from './payrollSyncCore';
export {
  requestPayrollSync,
  isPayrollCacheFresh,
  getPayrollSyncCoordinator,
  PAYROLL_SYNC_FRESH_MS,
  type RequestPayrollSyncOptions,
} from './payrollSyncCoordinator';
import { requestPayrollSync, type RequestPayrollSyncOptions } from './payrollSyncCoordinator';
import type { SyncPayrollFromServerOptions } from './payrollSyncCore';

/**
 * Coordinated payroll sync — dedupes in-flight work per tenant.
 * Mutations should pass `{ force: true }`.
 */
export async function syncPayrollFromServer(
  tenantId: string,
  options?: SyncPayrollFromServerOptions & Pick<RequestPayrollSyncOptions, 'force' | 'skipIfFresh' | 'source'>
): Promise<void> {
  const { force, skipIfFresh, source, ...syncOptions } = options ?? {};
  return requestPayrollSync(tenantId, {
    ...syncOptions,
    force,
    skipIfFresh,
    source: source ?? 'syncPayrollFromServer',
  });
}
