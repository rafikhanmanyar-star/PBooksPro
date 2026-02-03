/**
 * API URL configuration for the app.
 *
 * When the app is opened from another PC (e.g. http://192.168.1.105:5173),
 * the API is derived from the same host on port 3000 (e.g. http://192.168.1.105:3000/api),
 * so no IP needs to be hardcoded.
 *
 * Set VITE_API_URL to a full URL (e.g. https://pbookspro-api.onrender.com/api) to use
 * a remote API instead (production/staging).
 */

const API_PORT = 3000;

function isRemoteApiUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false;
  return (
    url.includes('onrender.com') ||
    (url.startsWith('https://') && !url.includes('localhost') && !url.includes('127.0.0.1'))
  );
}

/**
 * Returns the API base URL (e.g. http://host:3000/api).
 * In the browser: uses the same host as the page and port 3000, so when another PC
 * opens http://SERVER_IP:5173, API is http://SERVER_IP:3000/api.
 * Use VITE_API_URL for production/staging remote API.
 */
export function getApiBaseUrl(): string {
  const env = import.meta.env.VITE_API_URL as string | undefined;
  if (env && isRemoteApiUrl(env)) return env.endsWith('/api') ? env : env.replace(/\/?$/, '') + '/api';
  if (typeof window !== 'undefined') {
    const { protocol, hostname } = window.location;
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
