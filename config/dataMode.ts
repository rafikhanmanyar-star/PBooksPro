/**
 * Runtime data mode helpers (Architecture v2.1).
 * Use in shared modules instead of scattering isLocalOnlyMode() checks.
 */
export { IS_LEGACY_SQLITE_BUILD, IS_POSTGRES_API_BUILD } from './runtimeMode';
export { isLocalOnlyMode, isAccountingBackedByRemoteApi } from './apiUrl';

import { isLocalOnlyMode } from './apiUrl';

/** Standard Desktop/Cloud path: PostgreSQL via REST API. */
export function isPostgresApiMode(): boolean {
  return !isLocalOnlyMode();
}
