import { getDefaultApiBaseUrl } from '../config/apiUrl';
import { apiClient } from '../services/api/client';
import { resetDemoTourSession } from '../services/tours/demoTourSession';

export const DEMO_AUTH_STORAGE_KEY = 'pbooks_demo_auth';
export const WEBSITE_DEMO_ENTRY_KEY = 'pbooks_website_demo_entry';

export type DemoAuthPayload = {
  token: string;
  loginEventId?: string;
  user: {
    id: string;
    username: string;
    name: string;
    role: string;
    tenantId: string;
    displayTimezone?: string | null;
    interfaceMode?: 'auto' | 'full_erp' | 'executive_mobile';
  };
  tenant: {
    id: string;
    name: string;
    companyName: string;
  };
};

export function isAutoDemoUrl(): boolean {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('auto_demo') === '1';
}

/** Set when the visitor arrived from the marketing site live-demo funnel. */
export function markWebsiteDemoEntry(): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(WEBSITE_DEMO_ENTRY_KEY, '1');
  } catch {
    /* ignore */
  }
}

export function isWebsiteDemoEntry(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return isAutoDemoUrl() || sessionStorage.getItem(WEBSITE_DEMO_ENTRY_KEY) === '1';
  } catch {
    return isAutoDemoUrl();
  }
}

export function clearWebsiteDemoEntry(): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(WEBSITE_DEMO_ENTRY_KEY);
  } catch {
    /* ignore */
  }
}

export function readStoredDemoAuth(): DemoAuthPayload | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(DEMO_AUTH_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as DemoAuthPayload;
  } catch {
    sessionStorage.removeItem(DEMO_AUTH_STORAGE_KEY);
    return null;
  }
}

export function clearAutoDemoQueryParam(): void {
  if (typeof window === 'undefined') return;
  const params = new URLSearchParams(window.location.search);
  if (!params.has('auto_demo')) return;
  params.delete('auto_demo');
  const remaining = params.toString();
  const nextUrl =
    window.location.pathname + (remaining ? `?${remaining}` : '') + window.location.hash;
  window.history.replaceState({}, '', nextUrl);
}

/** Remove one-shot tour handoff params after the demo tour has started. */
export function clearDemoTourQueryParams(): void {
  if (typeof window === 'undefined') return;
  const params = new URLSearchParams(window.location.search);
  let changed = false;
  for (const key of ['demo_chapter', 'demo_tour_step', 'demo_tour']) {
    if (params.has(key)) {
      params.delete(key);
      changed = true;
    }
  }
  if (!changed) return;
  const remaining = params.toString();
  const nextUrl =
    window.location.pathname + (remaining ? `?${remaining}` : '') + window.location.hash;
  window.history.replaceState({}, '', nextUrl);
}

export async function fetchDemoSessionFromApi(): Promise<DemoAuthPayload | null> {
  try {
    const data = await apiClient.post<DemoAuthPayload>('/demo/enter', {});
    if (!data?.token || !data.user || !data.tenant) {
      return null;
    }
    return data;
  } catch {
    try {
      const res = await fetch(`${getDefaultApiBaseUrl()}/demo/enter`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      const json = (await res.json()) as {
        success?: boolean;
        data?: DemoAuthPayload;
      };
      const payload = json.data;
      if (!res.ok || !payload?.token || !payload.user || !payload.tenant) {
        return null;
      }
      return payload;
    } catch {
      return null;
    }
  }
}

export function storeDemoAuthPayload(payload: DemoAuthPayload): void {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(DEMO_AUTH_STORAGE_KEY, JSON.stringify(payload));
  sessionStorage.setItem('pbooks_demo_mode', '1');
}

/**
 * Resolve demo session from sessionStorage (set by index bootstrap) or ?auto_demo=1.
 * Returns payload and removes it from sessionStorage when consumed.
 */
export async function resolveDemoAuthHandoff(): Promise<DemoAuthPayload | null> {
  const stored = readStoredDemoAuth();
  if (stored) {
    sessionStorage.removeItem(DEMO_AUTH_STORAGE_KEY);
    clearAutoDemoQueryParam();
    return stored;
  }

  if (!isAutoDemoUrl()) return null;

  const payload = await fetchDemoSessionFromApi();
  clearAutoDemoQueryParam();
  if (payload) {
    sessionStorage.setItem('pbooks_demo_mode', '1');
  }
  return payload;
}

/**
 * Website demo-login runs on pbookspro.com; the app runs on app.pbookspro.com.
 * sessionStorage does not cross origins — hand off via ?auto_demo=1 and enter here.
 */
export async function bootstrapDemoAuthFromUrl(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  if (!isAutoDemoUrl()) return false;

  markWebsiteDemoEntry();
  resetDemoTourSession();
  const payload = await fetchDemoSessionFromApi();
  if (!payload) return false;

  storeDemoAuthPayload(payload);
  clearAutoDemoQueryParam();
  return true;
}
