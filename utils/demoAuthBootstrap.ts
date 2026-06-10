import { getDefaultApiBaseUrl } from '../config/apiUrl';

const DEMO_AUTH_STORAGE_KEY = 'pbooks_demo_auth';

/**
 * Website demo-login runs on pbookspro.com; the app runs on app.pbookspro.com.
 * sessionStorage does not cross origins — hand off via ?auto_demo=1 and enter here.
 */
export async function bootstrapDemoAuthFromUrl(): Promise<boolean> {
  if (typeof window === 'undefined') return false;

  const params = new URLSearchParams(window.location.search);
  if (params.get('auto_demo') !== '1') return false;

  params.delete('auto_demo');
  const remaining = params.toString();
  const nextUrl =
    window.location.pathname + (remaining ? `?${remaining}` : '') + window.location.hash;
  window.history.replaceState({}, '', nextUrl);

  try {
    const res = await fetch(`${getDefaultApiBaseUrl()}/demo/enter`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    const json = (await res.json()) as {
      success?: boolean;
      data?: {
        token?: string;
        loginEventId?: string;
        user?: { id: string; username: string; name: string; role: string; tenantId: string };
        tenant?: { id: string; name: string; companyName: string };
      };
    };
    const data = json.data;
    if (!res.ok || !data?.token || !data.user || !data.tenant) {
      return false;
    }

    sessionStorage.setItem(
      DEMO_AUTH_STORAGE_KEY,
      JSON.stringify({
        token: data.token,
        loginEventId: data.loginEventId,
        user: data.user,
        tenant: data.tenant,
      })
    );
    sessionStorage.setItem('pbooks_demo_mode', '1');
    return true;
  } catch {
    return false;
  }
}
