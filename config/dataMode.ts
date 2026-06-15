/**
 * Runtime data mode helpers (Architecture v2.1).
 */
export { IS_LEGACY_SQLITE_BUILD, IS_POSTGRES_API_BUILD } from './runtimeMode';
export { isLocalOnlyMode, isAccountingBackedByRemoteApi } from './apiUrl';

/** PostgreSQL via REST API — the only supported client data path. */
export function isPostgresApiMode(): boolean {
  return true;
}
