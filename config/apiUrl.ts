/**
 * API URL configuration for the app.
 *
 * When the app is opened from another PC (e.g. http://192.168.1.105:5173),
 * the API is derived from the same host on port 3000 (e.g. http://192.168.1.105:3000/api),
 * so no IP needs to be hardcoded.
 *
 * Set VITE_API_URL for remote API (not used in local-only mode).
 */

/** Default HTTP port for LAN API (must match backend). */
export const DEFAULT_LAN_API_PORT = 3000;

const API_PORT = DEFAULT_LAN_API_PORT;

/** Persisted by the API login screen / setBaseUrl so Electron (file://) can reach a LAN server without rebuilding. */
export const PBOOKS_API_BASE_STORAGE_KEY = 'pbooks_api_base_url';

/**
 * Offline desktop build (`VITE_LOCAL_ONLY=true`) can still sign in against PBooks API Server (PostgreSQL).
 * When set to `postgres_api`, `isLocalOnlyMode()` is false so REST sync + Socket.IO run.
 * Local company files set `sqlite` before reload.
 */
export const PBOOKS_SESSION_DATA_SOURCE_KEY = 'pbooks_session_data_source';

export type SessionDataSource = 'sqlite' | 'postgres_api';

export function setSessionDataSource(source: SessionDataSource): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(PBOOKS_SESSION_DATA_SOURCE_KEY, source);
  } catch {
    /* ignore */
  }
}

export function clearSessionDataSource(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(PBOOKS_SESSION_DATA_SOURCE_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Older offline builds could save a PostgreSQL JWT but still treat the app as local-only (no sync, no Socket.IO).
 * If we find a non-local tenant token and no explicit session mode, assume API session.
 */
export function ensureLegacyOfflineApiSessionMarked(): void {
  if (typeof window === 'undefined') return;
  const v = import.meta.env.VITE_LOCAL_ONLY;
  if (v !== 'true' && v !== true) return;
  try {
    if (localStorage.getItem(PBOOKS_SESSION_DATA_SOURCE_KEY)) return;
    const token = localStorage.getItem('auth_token');
    const tid = localStorage.getItem('tenant_id');
    if (token && tid && tid !== 'local') {
      localStorage.setItem(PBOOKS_SESSION_DATA_SOURCE_KEY, 'postgres_api');
    }
  } catch {
    /* ignore */
  }
}

function normalizeApiBaseUrl(url: string): string {
  const u = url.trim().replace(/\/?$/, '');
  return u.endsWith('/api') ? u : `${u}/api`;
}

function isRemoteApiUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false;
  return (
    url.includes('onrender.com') ||
    (url.startsWith('https://') && !url.includes('localhost') && !url.includes('127.0.0.1'))
  );
}

/** True when the resolved API base targets a LAN/self-hosted server (discover + reconnect apply). Hosted cloud URLs skip this. */
export function isLanBackendApi(): boolean {
  return !isRemoteApiUrl(getApiBaseUrl());
}

/** Strip `/api` suffix to get server root (e.g. `http://192.168.1.10:3000`). */
export function getApiRootUrl(): string {
  return getApiBaseUrl().replace(/\/api\/?$/i, '');
}

/**
 * Returns the API base URL (e.g. http://host:3000/api).
 * In the browser: uses the same host as the page and port 3000, so when another PC
 * opens http://SERVER_IP:5173, API is http://SERVER_IP:3000/api.
 * Use VITE_API_URL for production/staging remote API.
 * In Electron (file:// protocol), VITE_API_URL must be set or defaults to production.
 */
export function getApiBaseUrl(): string {
  if (typeof window !== 'undefined') {
    try {
      const stored = localStorage.getItem(PBOOKS_API_BASE_STORAGE_KEY);
      if (stored?.trim()) return normalizeApiBaseUrl(stored);
    } catch {
      /* ignore */
    }
  }

  const env = import.meta.env.VITE_API_URL as string | undefined;
  if (env && isRemoteApiUrl(env)) return env.endsWith('/api') ? env : env.replace(/\/?$/, '') + '/api';
  if (typeof window !== 'undefined') {
    const { protocol, hostname } = window.location;
    // Electron loads from file:// - hostname is empty, use VITE_API_URL or localhost
    if (protocol === 'file:' || !hostname) {
      return env || `http://localhost:${API_PORT}/api`;
    }
    return `${protocol}//${hostname}:${API_PORT}/api`;
  }
  return env || `http://localhost:${API_PORT}/api`;
}

/**
 * Returns the WebSocket server URL (same host as API, no /api path).
 */
export function getWsServerUrl(): string {
  const env = import.meta.env.VITE_WS_URL as string | undefined;
  if (env) return env.replace(/\/?$/, '');
  const api = getApiBaseUrl();
  return api.replace(/\/api\/?$/, '');
}

/**
 * Returns true when the app is configured to use the staging API server.
 * Used to show a "Staging" banner in the UI to avoid confusion with production.
 */
export function isStagingEnvironment(): boolean {
  const apiUrl = (import.meta.env.VITE_API_URL as string) || '';
  return apiUrl.includes('-staging') || apiUrl.includes('staging.onrender.com');
}

/**
 * Local-only: SQLite + Electron offline builds (set `VITE_LOCAL_ONLY=true` in build scripts).
 * LAN / API: set `VITE_LOCAL_ONLY=false` (required for packaged API client, and for dev when using .env).
 *
 * When the variable is **unset**: browser tabs on `http:` / `https:` are treated as API-capable so
 * transaction mutations POST to PostgreSQL. Otherwise a dev server without `.env` would skip API sync
 * (optimistic UI only — data lost on refresh, other users never see changes). `file://` (Electron)
 * stays local-only unless `VITE_LOCAL_ONLY=false` is baked into the build, or the user chose
 * organization server sign-in (`pbooks_session_data_source=postgres_api`).
 */
export function isLocalOnlyMode(): boolean {
  const v = import.meta.env.VITE_LOCAL_ONLY;
  if (v === 'false' || v === false) return false;

  if (typeof window !== 'undefined') {
    try {
      if (localStorage.getItem(PBOOKS_SESSION_DATA_SOURCE_KEY) === 'postgres_api') {
        return false;
      }
    } catch {
      /* ignore */
    }
  }

  if (v === 'true' || v === true) return true;
  if (typeof window !== 'undefined') {
    const p = window.location.protocol;
    if (p === 'http:' || p === 'https:') return false;
  }
  return true;
}
