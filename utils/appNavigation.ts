/**
 * SPA route helpers for Electron (file://) and browser (http/https).
 * Electron loadFile() cannot use pathname navigation; hash routes are used instead.
 */

export function isFileProtocol(): boolean {
  return typeof window !== 'undefined' && window.location.protocol === 'file:';
}

function hashRoutePart(): string {
  const raw = window.location.hash.replace(/^#/, '');
  if (!raw) return '';
  return raw.startsWith('/') ? raw : `/${raw}`;
}

/** App pathname without query string (e.g. `/billing/checkout`). */
export function getAppPathname(): string {
  if (typeof window === 'undefined') return '/';
  if (isFileProtocol()) {
    const route = hashRoutePart();
    return route ? route.split('?')[0] : '/';
  }
  return window.location.pathname;
}

/** Query string for the current app route. */
export function getAppSearchParams(): URLSearchParams {
  if (typeof window === 'undefined') return new URLSearchParams();
  if (isFileProtocol()) {
    const route = hashRoutePart();
    const q = route.indexOf('?');
    return new URLSearchParams(q >= 0 ? route.slice(q + 1) : '');
  }
  return new URLSearchParams(window.location.search);
}

/** Navigate to an in-app path like `/billing/checkout?foo=1`. */
export function navigateToAppPath(pathWithOptionalQuery: string): void {
  if (typeof window === 'undefined') return;
  const path = pathWithOptionalQuery.startsWith('/')
    ? pathWithOptionalQuery
    : `/${pathWithOptionalQuery}`;

  if (isFileProtocol()) {
    window.location.hash = path;
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    return;
  }
  window.location.href = path;
}

export type AppSpecialRoute =
  | { kind: 'home' }
  | { kind: 'billing-checkout' }
  | { kind: 'paddle-checkout' }
  | { kind: 'payment-success' }
  | { kind: 'legal'; slug: string }
  | { kind: 'settings'; section: string };

/** Settings deep-link sections (e.g. application-update, about). */
export const SETTINGS_ROUTE_SECTIONS = new Set([
  'application-update',
  'about',
  'preferences',
  'data',
  'backup',
  'help',
  'license',
]);

export function parseAppSpecialRoute(): AppSpecialRoute {
  const pathname = getAppPathname();
  const searchParams = getAppSearchParams();
  const hasPaymentParams =
    searchParams.has('payment_intent') ||
    searchParams.has('payment_status') ||
    searchParams.has('status') ||
    searchParams.has('_ptxn');

  if (pathname === '/billing/checkout' || pathname.endsWith('/billing/checkout')) {
    return { kind: 'billing-checkout' };
  }

  const legalMatch = pathname.match(/\/legal\/([^/]+)\/?$/);
  if (legalMatch) {
    return { kind: 'legal', slug: legalMatch[1] };
  }

  if (pathname === '/license/paddle-checkout' || pathname.endsWith('/license/paddle-checkout')) {
    return { kind: 'paddle-checkout' };
  }

  if (
    pathname === '/license/payment-success' ||
    pathname.endsWith('/license/payment-success') ||
    (pathname === '/' && hasPaymentParams)
  ) {
    return { kind: 'payment-success' };
  }

  const settingsSectionMatch = pathname.match(/\/settings\/([^/]+)\/?$/);
  if (settingsSectionMatch) {
    return { kind: 'settings', section: settingsSectionMatch[1] };
  }

  if (pathname === '/settings' || pathname.endsWith('/settings')) {
    return { kind: 'settings', section: 'preferences' };
  }

  return { kind: 'home' };
}

/** Navigate to the main settings view (clears blocked deep-link paths). */
export function navigateToSettingsHome(): void {
  navigateToAppPath('/settings');
}
