export const DEMO_PUBLIC_TENANT_ID = 'pbooks-demo';
export const DEMO_SESSION_FLAG = 'pbooks_demo_mode';
export const DEMO_TOUR_DISMISSED_KEY = 'pbooks_demo_tour_dismissed';
export const DEMO_ANALYTICS_SESSION_KEY = 'pbooks_demo_analytics_session';

export function isDemoModeActive(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return sessionStorage.getItem(DEMO_SESSION_FLAG) === '1' ||
      localStorage.getItem('tenant_id') === DEMO_PUBLIC_TENANT_ID;
  } catch {
    return false;
  }
}

export function markDemoSessionActive(): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(DEMO_SESSION_FLAG, '1');
  } catch {
    /* ignore */
  }
}

export function clearDemoSessionFlags(): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(DEMO_SESSION_FLAG);
    sessionStorage.removeItem(DEMO_TOUR_DISMISSED_KEY);
  } catch {
    /* ignore */
  }
}

export function getDemoAnalyticsSessionId(): string {
  if (typeof window === 'undefined') return 'server';
  try {
    let id = sessionStorage.getItem(DEMO_ANALYTICS_SESSION_KEY);
    if (!id) {
      id = `demo-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      sessionStorage.setItem(DEMO_ANALYTICS_SESSION_KEY, id);
    }
    return id;
  } catch {
    return 'anonymous';
  }
}
