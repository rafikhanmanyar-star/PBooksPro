import { getApiBaseUrl } from '../../config/apiUrl';
import { getDemoAnalyticsSessionId, isDemoModeActive } from '../../config/demoEnvironment';

export type AnalyticsPayload = Record<string, string | number | boolean | null | undefined>;

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    PBooksAnalytics?: { track: (event: string, props?: AnalyticsPayload) => void };
  }
}

export function trackEvent(event: string, properties?: AnalyticsPayload): void {
  if (typeof window === 'undefined') return;

  const payload = {
    event,
    properties: properties ?? {},
    demo: isDemoModeActive(),
    sessionId: isDemoModeActive() ? getDemoAnalyticsSessionId() : undefined,
    at: new Date().toISOString(),
  };

  window.dispatchEvent(new CustomEvent('pbooks:analytics', { detail: payload }));

  if (window.PBooksAnalytics?.track) {
    window.PBooksAnalytics.track(event, properties);
    return;
  }

  try {
    window.gtag?.('event', event, properties);
  } catch {
    /* ignore */
  }

  if (isDemoModeActive()) {
    const base = getApiBaseUrl();
    if (base) {
      void fetch(`${base}/demo/analytics`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event,
          properties,
          sessionId: getDemoAnalyticsSessionId(),
        }),
        keepalive: true,
      }).catch(() => undefined);
    }
  }
}
