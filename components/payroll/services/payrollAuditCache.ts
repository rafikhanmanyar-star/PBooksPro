/**
 * PAYROLL-PERF-03A — Tenant-scoped payroll audit event cache.
 */

import { apiClient } from '../../../services/api/client';

const LOG_PREFIX = '[PAYROLL_AUDIT]';
const CACHE_KEY_PREFIX = 'payroll_audit_cache_';
const LAST_LOADED_KEY_PREFIX = 'payroll_audit_last_loaded_';

export const AUDIT_CACHE_TTL_MS = 5 * 60 * 1000;

export type PayrollAuditEvent = {
  id: string;
  created_at: string;
  user_id: string | null;
  user_name?: string | null;
  module: string;
  entity_type: string;
  entity_id: string;
  action: string;
  audit_action: string | null;
  summary: string | null;
  old_value?: unknown;
  new_value?: unknown;
};

export interface PayrollAuditCache {
  events: PayrollAuditEvent[];
  lastLoadedAt: number;
}

export interface PayrollAuditCacheMetrics {
  auditCacheHits: number;
  auditCacheMisses: number;
  auditCacheStale: number;
  auditBackgroundRefreshes: number;
}

type FetchFn = () => Promise<PayrollAuditEvent[]>;

let fetchImpl: FetchFn = async () => {
  const q = new URLSearchParams({ module: 'payroll', limit: '200' });
  const resp = await apiClient.get<{ items: PayrollAuditEvent[] }>(`/audit/events?${q.toString()}`);
  return resp?.items ?? [];
};

/** @internal test hook */
export function _setPayrollAuditFetchForTests(fn: FetchFn | null): void {
  fetchImpl = fn ?? (async () => {
    const q = new URLSearchParams({ module: 'payroll', limit: '200' });
    const resp = await apiClient.get<{ items: PayrollAuditEvent[] }>(`/audit/events?${q.toString()}`);
    return resp?.items ?? [];
  });
}

function logEvent(event: string, detail?: Record<string, unknown>): void {
  if (detail) {
    console.info(LOG_PREFIX, event, detail);
  } else {
    console.info(LOG_PREFIX, event);
  }
}

function formatAge(ageMs: number): string {
  const sec = Math.floor(ageMs / 1000);
  if (sec < 60) return `${sec}s`;
  return `${Math.floor(sec / 60)}m`;
}

function cacheStorageKey(tenantId: string): string {
  return `${CACHE_KEY_PREFIX}${tenantId}`;
}

function lastLoadedStorageKey(tenantId: string): string {
  return `${LAST_LOADED_KEY_PREFIX}${tenantId}`;
}

class PayrollAuditCacheStore {
  private lastLoadedAtByTenant = new Map<string, number>();
  private eventsByTenant = new Map<string, PayrollAuditEvent[]>();
  private inflightByTenant = new Map<string, Promise<PayrollAuditEvent[]>>();

  readonly metrics: PayrollAuditCacheMetrics = {
    auditCacheHits: 0,
    auditCacheMisses: 0,
    auditCacheStale: 0,
    auditBackgroundRefreshes: 0,
  };

  getMetrics(): PayrollAuditCacheMetrics {
    return { ...this.metrics };
  }

  resetForTenant(tenantId: string | null): void {
    if (!tenantId) {
      this.lastLoadedAtByTenant.clear();
      this.eventsByTenant.clear();
      this.inflightByTenant.clear();
      return;
    }
    this.lastLoadedAtByTenant.delete(tenantId);
    this.eventsByTenant.delete(tenantId);
    this.inflightByTenant.delete(tenantId);
  }

  readCache(tenantId: string): PayrollAuditCache | null {
    if (!tenantId) return null;

    const memTs = this.lastLoadedAtByTenant.get(tenantId);
    const memEvents = this.eventsByTenant.get(tenantId);
    if (memTs != null && memEvents != null) {
      return { events: memEvents, lastLoadedAt: memTs };
    }

    if (typeof localStorage === 'undefined') return null;

    try {
      const rawTs = localStorage.getItem(lastLoadedStorageKey(tenantId));
      const rawEvents = localStorage.getItem(cacheStorageKey(tenantId));
      if (!rawTs || !rawEvents) return null;

      const lastLoadedAt = Number(rawTs);
      if (!Number.isFinite(lastLoadedAt)) return null;

      const events = JSON.parse(rawEvents) as PayrollAuditEvent[];
      if (!Array.isArray(events)) return null;

      this.lastLoadedAtByTenant.set(tenantId, lastLoadedAt);
      this.eventsByTenant.set(tenantId, events);
      return { events, lastLoadedAt };
    } catch {
      return null;
    }
  }

  writeCache(tenantId: string, events: PayrollAuditEvent[]): void {
    if (!tenantId) return;
    const lastLoadedAt = Date.now();
    this.lastLoadedAtByTenant.set(tenantId, lastLoadedAt);
    this.eventsByTenant.set(tenantId, events);

    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(lastLoadedStorageKey(tenantId), String(lastLoadedAt));
        localStorage.setItem(cacheStorageKey(tenantId), JSON.stringify(events));
      } catch {
        /* ignore quota errors */
      }
    }
  }

  getCacheAgeMs(tenantId: string): number | null {
    const cached = this.readCache(tenantId);
    if (!cached) return null;
    return Date.now() - cached.lastLoadedAt;
  }

  isFresh(tenantId: string, ttlMs: number = AUDIT_CACHE_TTL_MS): boolean {
    const age = this.getCacheAgeMs(tenantId);
    if (age == null) return false;
    return age < ttlMs;
  }

  filterEvents(events: PayrollAuditEvent[], actionFilter: string): PayrollAuditEvent[] {
    if (!actionFilter) return events;
    return events.filter((r) => (r.audit_action ?? r.action) === actionFilter);
  }

  async loadEvents(
    tenantId: string,
    options: { force?: boolean; background?: boolean } = {}
  ): Promise<PayrollAuditEvent[]> {
    if (!tenantId) return [];

    const cached = this.readCache(tenantId);
    const ageMs = cached ? Date.now() - cached.lastLoadedAt : null;

    if (!options.force && cached && this.isFresh(tenantId)) {
      this.metrics.auditCacheHits += 1;
      logEvent('cache_hit', { age: ageMs != null ? formatAge(ageMs) : undefined });
      return cached.events;
    }

    if (!options.force && cached && !this.isFresh(tenantId)) {
      this.metrics.auditCacheStale += 1;
      logEvent('cache_stale', { age: ageMs != null ? formatAge(ageMs) : undefined });
    } else if (!cached) {
      this.metrics.auditCacheMisses += 1;
      logEvent('cache_miss');
    }

    const existing = this.inflightByTenant.get(tenantId);
    if (existing) return existing;

    if (options.background) {
      this.metrics.auditBackgroundRefreshes += 1;
      logEvent('background_refresh', { started: true });
    }

    const promise = (async () => {
      try {
        const events = await fetchImpl();
        this.writeCache(tenantId, events);
        logEvent('api_loaded', { count: events.length, background: !!options.background });
        return events;
      } finally {
        this.inflightByTenant.delete(tenantId);
      }
    })();

    this.inflightByTenant.set(tenantId, promise);
    return promise;
  }
}

let singleton: PayrollAuditCacheStore | null = null;

export function getPayrollAuditCacheStore(): PayrollAuditCacheStore {
  if (!singleton) singleton = new PayrollAuditCacheStore();
  return singleton;
}

export function resetPayrollAuditCacheStoreForTests(): void {
  singleton = new PayrollAuditCacheStore();
}

export function getPayrollAuditCacheMetrics(): PayrollAuditCacheMetrics {
  return getPayrollAuditCacheStore().getMetrics();
}

export function readPayrollAuditCache(tenantId: string): PayrollAuditCache | null {
  return getPayrollAuditCacheStore().readCache(tenantId);
}

export function isPayrollAuditCacheFresh(tenantId: string): boolean {
  return getPayrollAuditCacheStore().isFresh(tenantId);
}

export function filterPayrollAuditEvents(
  events: PayrollAuditEvent[],
  actionFilter: string
): PayrollAuditEvent[] {
  return getPayrollAuditCacheStore().filterEvents(events, actionFilter);
}

export async function loadPayrollAuditEvents(
  tenantId: string,
  options?: { force?: boolean; background?: boolean }
): Promise<PayrollAuditEvent[]> {
  return getPayrollAuditCacheStore().loadEvents(tenantId, options);
}
