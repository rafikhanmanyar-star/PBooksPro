/**
 * Cloud Performance Program — client startup instrumentation.
 *
 * Enable: localStorage.setItem('PBOOKS_STARTUP_PERF', '1')
 * Disable: localStorage.removeItem('PBOOKS_STARTUP_PERF')
 *
 * Export snapshot: window.__PBOOKS_EXPORT_STARTUP_PERF__()
 */

import {
  classifyStartupRequest,
  normalizeStartupPath,
  type StartupRequestClassification,
} from '../shared/performance/startupRequestCatalog';

export type StartupMilestone =
  | 'app_boot'
  | 'auth_check_start'
  | 'auth_check_done'
  | 'login_submit'
  | 'login_success'
  | 'bootstrap_start'
  | 'bootstrap_complete'
  | 'dashboard_ready';

export type StartupRequestRecord = {
  method: string;
  path: string;
  normalizedPath: string;
  status: number;
  durationMs: number;
  timestamp: number;
  classification: StartupRequestClassification | 'unknown';
  phase: string;
};

export type StartupPerfSnapshot = {
  program: 'cloud-perf-startup';
  capturedAt: string;
  enabled: boolean;
  sessionId: string;
  origin: string;
  milestones: Record<StartupMilestone, number | null>;
  totalLoadMs: number | null;
  apiRequestCount: number;
  requests: StartupRequestRecord[];
  slowestEndpoints: Array<{ path: string; durationMs: number; status: number }>;
  classificationSummary: Record<StartupRequestClassification | 'unknown', number>;
  duplicatePaths: Array<{ path: string; count: number }>;
};

const SESSION_KEY = 'pbooks_startup_perf_session';
const ORIGIN_KEY = 'pbooks_startup_perf_origin';

let enabled: boolean | null = null;
let originMs: number | null = null;
let sessionId: string | null = null;
const milestones: Partial<Record<StartupMilestone, number>> = {};
const requests: StartupRequestRecord[] = [];
let dashboardReadyMarked = false;

function readEnabled(): boolean {
  if (enabled !== null) return enabled;
  try {
    if (typeof localStorage !== 'undefined' && localStorage.getItem('PBOOKS_STARTUP_PERF') === '1') {
      enabled = true;
      return true;
    }
  } catch {
    /* ignore */
  }
  enabled = false;
  return false;
}

function ensureSession(): void {
  if (!readEnabled()) return;
  if (originMs === null) {
    originMs = performance.now();
    try {
      sessionId = sessionStorage.getItem(SESSION_KEY);
      if (!sessionId) {
        sessionId = `sp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        sessionStorage.setItem(SESSION_KEY, sessionId);
      }
      const storedOrigin = sessionStorage.getItem(ORIGIN_KEY);
      if (storedOrigin) {
        originMs = Number(storedOrigin);
      } else {
        sessionStorage.setItem(ORIGIN_KEY, String(originMs));
      }
    } catch {
      sessionId = `sp-${Date.now()}`;
    }
  }
}

export function startupPerfEnabled(): boolean {
  return readEnabled();
}

export function markStartupMilestone(name: StartupMilestone): void {
  if (!readEnabled()) return;
  ensureSession();
  const elapsed = originMs !== null ? Math.round(performance.now() - originMs) : 0;
  milestones[name] = elapsed;
  console.log(`[STARTUP-PERF] milestone=${name} elapsedMs=${elapsed}`);
  if (name === 'login_success') {
    try {
      sessionStorage.removeItem(ORIGIN_KEY);
      originMs = performance.now();
      sessionStorage.setItem(ORIGIN_KEY, String(originMs));
    } catch {
      originMs = performance.now();
    }
  }
}

export function recordStartupApiRequest(input: {
  method: string;
  path: string;
  status: number;
  durationMs: number;
}): void {
  if (!readEnabled()) return;
  ensureSession();
  const normalizedPath = normalizeStartupPath(input.path);
  const catalog = classifyStartupRequest(input.path);
  requests.push({
    method: input.method,
    path: input.path,
    normalizedPath,
    status: input.status,
    durationMs: Math.round(input.durationMs),
    timestamp: Date.now(),
    classification: catalog?.classification ?? 'unknown',
    phase: catalog?.phase ?? 'unknown',
  });
}

export function markDashboardReady(): void {
  if (!readEnabled() || dashboardReadyMarked) return;
  dashboardReadyMarked = true;
  markStartupMilestone('dashboard_ready');
}

function buildDuplicatePaths(): Array<{ path: string; count: number }> {
  const counts = new Map<string, number>();
  for (const r of requests) {
    const key = `${r.method} ${r.normalizedPath}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([path, count]) => ({ path, count }))
    .sort((a, b) => b.count - a.count);
}

export function getStartupPerfSnapshot(): StartupPerfSnapshot {
  const classificationSummary: StartupPerfSnapshot['classificationSummary'] = {
    required: 0,
    optional: 0,
    duplicate: 0,
    legacy: 0,
    unknown: 0,
  };
  for (const r of requests) {
    classificationSummary[r.classification] += 1;
  }

  const slowest = [...requests]
    .sort((a, b) => b.durationMs - a.durationMs)
    .slice(0, 10)
    .map((r) => ({ path: r.normalizedPath, durationMs: r.durationMs, status: r.status }));

  const allMilestones: Record<StartupMilestone, number | null> = {
    app_boot: milestones.app_boot ?? null,
    auth_check_start: milestones.auth_check_start ?? null,
    auth_check_done: milestones.auth_check_done ?? null,
    login_submit: milestones.login_submit ?? null,
    login_success: milestones.login_success ?? null,
    bootstrap_start: milestones.bootstrap_start ?? null,
    bootstrap_complete: milestones.bootstrap_complete ?? null,
    dashboard_ready: milestones.dashboard_ready ?? null,
  };

  const totalLoadMs = allMilestones.dashboard_ready;

  return {
    program: 'cloud-perf-startup',
    capturedAt: new Date().toISOString(),
    enabled: readEnabled(),
    sessionId: sessionId ?? 'disabled',
    origin: typeof window !== 'undefined' ? window.location.origin : '',
    milestones: allMilestones,
    totalLoadMs,
    apiRequestCount: requests.length,
    requests,
    slowestEndpoints: slowest,
    classificationSummary,
    duplicatePaths: buildDuplicatePaths(),
  };
}

export function exportStartupPerfSnapshot(): StartupPerfSnapshot {
  const snapshot = getStartupPerfSnapshot();
  console.log('[STARTUP-PERF] snapshot', snapshot);
  return snapshot;
}

export function resetStartupPerfSession(): void {
  enabled = null;
  originMs = null;
  sessionId = null;
  dashboardReadyMarked = false;
  for (const key of Object.keys(milestones) as StartupMilestone[]) {
    delete milestones[key];
  }
  requests.length = 0;
  try {
    sessionStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(ORIGIN_KEY);
  } catch {
    /* ignore */
  }
}

declare global {
  interface Window {
    __PBOOKS_EXPORT_STARTUP_PERF__?: () => StartupPerfSnapshot;
    __PBOOKS_RESET_STARTUP_PERF__?: () => void;
  }
}

export function installStartupPerfGlobals(): void {
  if (typeof window === 'undefined') return;
  window.__PBOOKS_EXPORT_STARTUP_PERF__ = exportStartupPerfSnapshot;
  window.__PBOOKS_RESET_STARTUP_PERF__ = resetStartupPerfSession;
}
