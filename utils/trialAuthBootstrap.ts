import { apiClient } from '../services/api/client';
import { getDefaultApiBaseUrl } from '../config/apiUrl';

/** Consume trial handoff from website signup redirect (exchange code or legacy query token). */
export async function bootstrapTrialAuthFromUrl(): Promise<boolean> {
  if (typeof window === 'undefined') return false;

  const params = new URLSearchParams(window.location.search);
  const exchangeCode = params.get('trial_code');
  const legacyToken = params.get('trial_token');
  const legacyTenantId = params.get('tenant_id');
  const openOnboarding = params.get('onboarding') === '1';

  let token: string | null = null;
  let tenantId: string | null = null;

  if (exchangeCode) {
    try {
      const res = await fetch(`${getDefaultApiBaseUrl()}/trial/exchange`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: exchangeCode }),
      });
      const json = (await res.json()) as {
        success?: boolean;
        data?: { token?: string; tenantId?: string };
      };
      if (res.ok && json.data?.token && json.data?.tenantId) {
        token = json.data.token;
        tenantId = json.data.tenantId;
      }
    } catch {
      return false;
    }
  } else if (legacyToken && legacyTenantId) {
    token = legacyToken;
    tenantId = legacyTenantId;
  }

  if (!token || !tenantId) return false;

  apiClient.setAuth(token, tenantId, false);

  params.delete('trial_code');
  params.delete('trial_token');
  params.delete('tenant_id');
  const remaining = params.toString();
  const nextUrl =
    window.location.pathname + (remaining ? `?${remaining}` : '') + window.location.hash;
  window.history.replaceState({}, '', nextUrl);

  if (openOnboarding) {
    try {
      sessionStorage.removeItem('pbooks_onboarding_dismissed_session');
    } catch {
      /* ignore */
    }
  }

  return true;
}
