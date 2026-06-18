/**
 * API URL configuration for the app.
 *
 * Architecture v2.1: Desktop and Cloud editions use apiClient → Express API → PostgreSQL.
 *
 * When the app is opened from another PC (e.g. http://192.168.1.105:5173),
 * the API is derived from the same host on port 3000 (e.g. http://192.168.1.105:3000/api),
 * so no IP needs to be hardcoded.
 */

/** Default HTTP port for LAN API (must match backend). */
export const DEFAULT_LAN_API_PORT = 3000;
/** Staging API on the same machine as production (production uses 3000). */
export const STAGING_LAN_API_PORT = 3001;

/** Persisted by the API login screen / setBaseUrl so Electron (file://) can reach a LAN server without rebuilding. */
export const PBOOKS_API_BASE_STORAGE_KEY = 'pbooks_api_base_url';

/** @deprecated Offline SQLite removed — key retained for legacy localStorage reads. */
export const PBOOKS_SESSION_DATA_SOURCE_KEY = 'pbooks_session_data_source';

/**
 * @deprecated Offline SQLite was removed in Architecture v2.1 Phase 4. Always false.
 * Use isAccountingBackedByRemoteApi() or isPostgresApiMode() from config/dataMode.ts.
 */
export function isLocalOnlyMode(): boolean {
  return false;
}

/** @deprecated No-op — offline SQLite session switching removed. */
export function setSessionDataSource(_source: 'sqlite' | 'postgres_api'): void {}

/** @deprecated No-op — offline SQLite session switching removed. */
export function clearSessionDataSource(): void {}

/** @deprecated No-op — offline SQLite session switching removed. */
export function ensureLegacyOfflineApiSessionMarked(): void {}

export function isProductionLocalApiUrl(url: string): boolean {
  if (!url) return false;
  return /:3000(\/|$)/.test(url);
}

export function isStagingLocalApiUrl(url: string): boolean {
  if (!url) return false;
  return /:3001(\/|$)/.test(url);
}

/** HTTP port this client build should use for LAN API discovery and connection. */
export function getLanApiPort(): number {
  return isStagingEnvironment() ? STAGING_LAN_API_PORT : DEFAULT_LAN_API_PORT;
}

/** True when a discovered / manual server port matches this client (staging → 3001, production → 3000). */
export function isAllowedLanApiPort(port: number): boolean {
  return port === getLanApiPort();
}

/** Root URL (no /api) for the default API server for this build (staging → :3001, production → :3000). */
export function getDefaultApiRootUrl(): string {
  const env = import.meta.env.VITE_API_URL as string | undefined;
  if (env?.trim()) {
    return env.replace(/\/api\/?$/i, '').replace(/\/+$/, '');
  }
  const port = isStagingEnvironment() ? STAGING_LAN_API_PORT : DEFAULT_LAN_API_PORT;
  return `http://127.0.0.1:${port}`;
}

/** Default API base URL baked into this client build. */
export function getDefaultApiBaseUrl(): string {
  const env = import.meta.env.VITE_API_URL as string | undefined;
  if (env?.trim()) return normalizeApiBaseUrl(env);
  return `${getDefaultApiRootUrl()}/api/v1`;
}

/** Persisted LAN server root (no /api), cleared when it targets the wrong port for this build. */
export function getStoredLanApiRootUrl(): string | null {
  const stored = readStoredApiBaseUrl();
  if (!stored) return null;
  return stored.replace(/\/api\/?$/i, '');
}

function readStoredApiBaseUrl(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const stored = localStorage.getItem(PBOOKS_API_BASE_STORAGE_KEY);
    if (!stored?.trim()) return null;
    const normalized = normalizeApiBaseUrl(stored);
    if (isStagingEnvironment() && isProductionLocalApiUrl(normalized)) {
      localStorage.removeItem(PBOOKS_API_BASE_STORAGE_KEY);
      return null;
    }
    if (!isStagingEnvironment() && isStagingLocalApiUrl(normalized)) {
      localStorage.removeItem(PBOOKS_API_BASE_STORAGE_KEY);
      return null;
    }
    return normalized;
  } catch {
    return null;
  }
}

export function normalizeApiBaseUrl(url: string): string {
  const u = url.trim().replace(/\/?$/, '');
  if (u.endsWith('/api/v1')) return u;
  if (u.endsWith('/api')) return `${u}/v1`;
  return `${u}/api/v1`;
}

function isRemoteApiUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false;
  return (
    url.includes('onrender.com') ||
    url.includes('pbookspro.com') ||
    (url.startsWith('https://') && !url.includes('localhost') && !url.includes('127.0.0.1'))
  );
}

/** True when a server root/base URL targets hosted PBooks cloud (not LAN / self-hosted). */
export function isCloudApiUrl(url: string): boolean {
  const normalized = url.trim();
  if (!normalized) return false;
  const withApi = normalized.endsWith('/api') ? normalized : `${normalized.replace(/\/+$/, '')}/api`;
  return isRemoteApiUrl(withApi);
}

/** True when the resolved API base targets a LAN/self-hosted server (discover + reconnect apply). Hosted cloud URLs skip this. */
export function isLanBackendApi(): boolean {
  return !isRemoteApiUrl(getApiBaseUrl());
}

/** True when the client talks to a hosted cloud API (not LAN / self-hosted). */
export function isCloudHostedApi(): boolean {
  return isRemoteApiUrl(getApiBaseUrl());
}

/** Strip `/api` or `/api/v1` suffix to get server root (e.g. `http://192.168.1.10:3000`). */
export function getApiRootUrl(): string {
  return getApiBaseUrl().replace(/\/api(\/v1)?\/?$/i, '');
}

/**
 * Returns the API base URL (e.g. http://host:3001/api for staging, :3000 for production).
 * Staging builds never fall back to the production port.
 */
export function getApiBaseUrl(): string {
  const stored = readStoredApiBaseUrl();
  if (stored) return stored;

  const env = import.meta.env.VITE_API_URL as string | undefined;
  if (env?.trim()) return normalizeApiBaseUrl(env);

  if (typeof window !== 'undefined') {
    const { protocol, hostname } = window.location;
    if (protocol === 'file:' || !hostname) {
      return getDefaultApiBaseUrl();
    }
    const port = isStagingEnvironment() ? STAGING_LAN_API_PORT : DEFAULT_LAN_API_PORT;
    return `${protocol}//${hostname}:${port}/api/v1`;
  }
  return getDefaultApiBaseUrl();
}

/**
 * Returns the WebSocket server URL (same host as API, no /api path).
 *
 * VITE_WS_URL is only honoured when it's a non-localhost value (e.g. a cloud
 * WebSocket endpoint). For localhost / 127.0.0.1 values we derive the URL
 * dynamically from getApiBaseUrl() so that LAN users connecting from another
 * machine get the correct server hostname instead of 127.0.0.1.
 */
export function getWsServerUrl(): string {
  const env = (import.meta.env.VITE_WS_URL as string | undefined)?.trim();
  if (env && !/127\.0\.0\.1|localhost/i.test(env)) {
    return env.replace(/\/?$/, '');
  }
  const api = getApiBaseUrl();
  return api.replace(/\/api(\/v1)?\/?$/, '');
}

/**
 * Returns true when the app is configured to use the staging API server.
 * Used to show a "Staging" banner in the UI to avoid confusion with production.
 */
export function isStagingEnvironment(): boolean {
  const v = import.meta.env.VITE_STAGING;
  if (v === 'true' || v === true) return true;
  const apiUrl = (import.meta.env.VITE_API_URL as string) || '';
  if (apiUrl.includes('-staging') || apiUrl.includes('staging.onrender.com')) return true;
  if (/:3001(\/|$)/.test(apiUrl)) return true;
  return false;
}

/** Display name for window title / login screen (staging vs production). */
export function getAppDisplayName(): string {
  return isStagingEnvironment() ? 'PBooks Pro Staging' : 'PBooks Pro';
}

/**
 * True when transactions, payroll payments, and related operational data must persist via REST to PostgreSQL.
 * Requires a valid JWT and non-local tenant id.
 */
export function isAccountingBackedByRemoteApi(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (!localStorage.getItem('auth_token')) return false;
    const tid = localStorage.getItem('tenant_id');
    if (!tid || tid === 'local') return false;
  } catch {
    return false;
  }
  return true;
}
