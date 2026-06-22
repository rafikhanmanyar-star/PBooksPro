/**
 * Cloud Performance Program — startup request classification catalog.
 * Used by startupPerfTracker and Phase 2 Startup Request Matrix reports.
 * Classifications: required | optional | duplicate | legacy
 */

export type StartupRequestClassification = 'required' | 'optional' | 'duplicate' | 'legacy';

export type StartupRequestCatalogEntry = {
  /** Normalized path prefix or exact match (no query string) */
  pattern: string;
  classification: StartupRequestClassification;
  phase: 'pre-login' | 'login' | 'bootstrap' | 'shell' | 'dashboard' | 'realtime';
  description: string;
};

/** Longest-prefix match wins (patterns should be ordered most-specific first). */
export const STARTUP_REQUEST_CATALOG: StartupRequestCatalogEntry[] = [
  { pattern: '/auth/unified-login', classification: 'required', phase: 'login', description: 'Primary credential login' },
  { pattern: '/auth/select-company', classification: 'required', phase: 'login', description: 'Multi-org company picker' },
  { pattern: '/auth/mfa/verify', classification: 'required', phase: 'login', description: 'MFA challenge' },
  { pattern: '/auth/mfa/enable', classification: 'required', phase: 'login', description: 'MFA enrollment during login' },
  { pattern: '/auth/login', classification: 'legacy', phase: 'login', description: 'Legacy login endpoint' },
  { pattern: '/auth/smart-login', classification: 'legacy', phase: 'login', description: 'Legacy tenant-picker login' },
  { pattern: '/auth/lookup-tenants', classification: 'legacy', phase: 'login', description: 'Legacy org lookup' },
  { pattern: '/state/bulk-chunked', classification: 'required', phase: 'bootstrap', description: 'Paginated AppState hydrate' },
  { pattern: '/state/bulk', classification: 'optional', phase: 'bootstrap', description: 'Bulk fallback or entity fan-out' },
  { pattern: '/state/changes', classification: 'optional', phase: 'bootstrap', description: 'Incremental sync cursor' },
  { pattern: '/health', classification: 'optional', phase: 'bootstrap', description: 'Server time / LAN reachability' },
  { pattern: '/permissions/me', classification: 'required', phase: 'shell', description: 'RBAC permission gates' },
  { pattern: '/tenants/license-status', classification: 'duplicate', phase: 'shell', description: 'License check (multiple callers)' },
  { pattern: '/tenants/online-users-count', classification: 'optional', phase: 'shell', description: 'Sidebar presence count' },
  { pattern: '/tenants/online-users', classification: 'optional', phase: 'shell', description: 'Chat modal presence list' },
  { pattern: '/notifications', classification: 'optional', phase: 'shell', description: 'Header notification bell' },
  { pattern: '/rbac/break-glass/status', classification: 'optional', phase: 'shell', description: 'Break-glass banner' },
  { pattern: '/auth/heartbeat', classification: 'optional', phase: 'shell', description: 'Session keepalive' },
  { pattern: '/dashboard/metrics', classification: 'required', phase: 'dashboard', description: 'Admin KPI metrics' },
  { pattern: '/dashboard/snapshots', classification: 'required', phase: 'dashboard', description: 'Admin snapshot KPIs' },
  { pattern: '/dashboard/charts', classification: 'required', phase: 'dashboard', description: 'Admin chart series' },
  { pattern: '/dashboard/activity', classification: 'required', phase: 'dashboard', description: 'Recent activity feed' },
  { pattern: '/quotation-validation/compliance', classification: 'optional', phase: 'dashboard', description: 'Procurement compliance widget' },
  { pattern: '/procurement/dashboard-metrics', classification: 'optional', phase: 'dashboard', description: 'Procurement dashboard widget' },
  { pattern: '/billing/portal', classification: 'optional', phase: 'dashboard', description: 'Subscription status widget' },
  { pattern: '/reports/designer/dashboard-pins', classification: 'optional', phase: 'dashboard', description: 'Pinned custom reports' },
  { pattern: '/reports/custom/generate', classification: 'optional', phase: 'dashboard', description: 'Pinned report execution' },
  { pattern: '/payroll/', classification: 'optional', phase: 'bootstrap', description: 'Payroll list sync after bulk (permission-gated)' },
  { pattern: '/demo/enter', classification: 'optional', phase: 'pre-login', description: 'Demo session entry' },
  { pattern: '/trial/exchange', classification: 'optional', phase: 'pre-login', description: 'Trial URL handoff' },
  { pattern: '/monitoring/telemetry', classification: 'optional', phase: 'shell', description: 'Client telemetry ingest' },
];

export function normalizeStartupPath(path: string): string {
  return path.replace(/\?.*$/, '').replace(/\/[0-9a-f-]{36}/gi, '/:id');
}

export function classifyStartupRequest(path: string): StartupRequestCatalogEntry | null {
  const normalized = normalizeStartupPath(path);
  for (const entry of STARTUP_REQUEST_CATALOG) {
    if (normalized === entry.pattern || normalized.startsWith(entry.pattern)) {
      return entry;
    }
  }
  return null;
}
