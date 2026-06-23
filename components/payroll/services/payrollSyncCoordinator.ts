/**
 * PAYROLL-PERF-02 — Singleton payroll sync coordinator.
 * Dedupes in-flight syncs per tenant; tracks freshness and metrics.
 */

import { syncPayrollFromServerCore, type SyncPayrollFromServerOptions } from './payrollSyncCore';

const LOG_PREFIX = '[PAYROLL_SYNC]';
const LAST_SYNCED_KEY_PREFIX = 'payroll_last_synced_at_';
export const PAYROLL_SYNC_FRESH_MS = 5 * 60 * 1000;

type SyncCoreFn = (tenantId: string, options?: SyncPayrollFromServerOptions) => Promise<void>;

let syncCoreImpl: SyncCoreFn = syncPayrollFromServerCore;

/** @internal test hook */
export function _setPayrollSyncCoreForTests(fn: SyncCoreFn | null): void {
  syncCoreImpl = fn ?? syncPayrollFromServerCore;
}

export interface PayrollSyncCoordinatorMetrics {
  activeSyncs: number;
  deduplicatedSyncs: number;
  cacheHits: number;
  cacheMisses: number;
  syncDuration: number;
}

export type RequestPayrollSyncOptions = SyncPayrollFromServerOptions & {
  /** Bypass freshness skip (mutations, forced refresh). */
  force?: boolean;
  /** When true and cache is fresh, skip network entirely. */
  skipIfFresh?: boolean;
  /** Caller label for logs. */
  source?: string;
};

function logEvent(event: string, detail?: Record<string, unknown>): void {
  if (detail) {
    console.info(LOG_PREFIX, event, detail);
  } else {
    console.info(LOG_PREFIX, event);
  }
}

function lastSyncedStorageKey(tenantId: string): string {
  return `${LAST_SYNCED_KEY_PREFIX}${tenantId}`;
}

class PayrollSyncCoordinator {
  private inflightByTenant = new Map<string, Promise<void>>();
  private lastSyncedAtByTenant = new Map<string, number>();

  readonly metrics: PayrollSyncCoordinatorMetrics = {
    activeSyncs: 0,
    deduplicatedSyncs: 0,
    cacheHits: 0,
    cacheMisses: 0,
    syncDuration: 0,
  };

  getMetrics(): PayrollSyncCoordinatorMetrics {
    return { ...this.metrics };
  }

  isSyncRunning(tenantId: string): boolean {
    return this.inflightByTenant.has(tenantId);
  }

  getLastSyncedAt(tenantId: string): number | null {
    if (!tenantId) return null;
    const mem = this.lastSyncedAtByTenant.get(tenantId);
    if (mem != null) return mem;
    if (typeof localStorage === 'undefined') return null;
    try {
      const raw = localStorage.getItem(lastSyncedStorageKey(tenantId));
      if (!raw) return null;
      const ts = Number(raw);
      return Number.isFinite(ts) ? ts : null;
    } catch {
      return null;
    }
  }

  isFresh(tenantId: string, freshMs: number = PAYROLL_SYNC_FRESH_MS): boolean {
    const last = this.getLastSyncedAt(tenantId);
    if (last == null) return false;
    return Date.now() - last < freshMs;
  }

  recordCacheHit(): void {
    this.metrics.cacheHits += 1;
    logEvent('cache_hit', { cacheHits: this.metrics.cacheHits });
  }

  recordCacheMiss(): void {
    this.metrics.cacheMisses += 1;
    logEvent('cache_miss', { cacheMisses: this.metrics.cacheMisses });
  }

  resetForTenant(tenantId: string | null): void {
    if (!tenantId) {
      this.inflightByTenant.clear();
      this.lastSyncedAtByTenant.clear();
      this.metrics.activeSyncs = 0;
      return;
    }
    this.inflightByTenant.delete(tenantId);
    this.lastSyncedAtByTenant.delete(tenantId);
    this.metrics.activeSyncs = this.inflightByTenant.size;
    logEvent('reset_for_tenant', { tenantId });
  }

  private markSynced(tenantId: string): void {
    const now = Date.now();
    this.lastSyncedAtByTenant.set(tenantId, now);
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(lastSyncedStorageKey(tenantId), String(now));
      } catch {
        /* ignore quota errors */
      }
    }
  }

  async requestSync(tenantId: string, options: RequestPayrollSyncOptions = {}): Promise<void> {
    if (!tenantId) return;

    const existing = this.inflightByTenant.get(tenantId);
    if (existing) {
      this.metrics.deduplicatedSyncs += 1;
      logEvent('deduplicated', {
        tenantId,
        source: options.source ?? 'unknown',
        deduplicatedSyncs: this.metrics.deduplicatedSyncs,
      });
      return existing;
    }

    if (options.skipIfFresh && !options.force && this.isFresh(tenantId)) {
      this.recordCacheHit();
      logEvent('skip_fresh', { tenantId, source: options.source ?? 'unknown' });
      return;
    }

    if (options.skipIfFresh && !options.force) {
      this.recordCacheMiss();
    }

    const startedAt = Date.now();
    logEvent('start', {
      tenantId,
      source: options.source ?? 'unknown',
      force: !!options.force,
      skipIfFresh: !!options.skipIfFresh,
    });

    const promise = (async () => {
      try {
        await syncCoreImpl(tenantId, options);
        this.markSynced(tenantId);
        const duration = Date.now() - startedAt;
        this.metrics.syncDuration = duration;
        logEvent('complete', { tenantId, source: options.source ?? 'unknown', syncDuration: duration });
      } catch (err) {
        logEvent('error', {
          tenantId,
          source: options.source ?? 'unknown',
          message: err instanceof Error ? err.message : String(err),
        });
        throw err;
      }
    })();

    this.inflightByTenant.set(tenantId, promise);
    this.metrics.activeSyncs = this.inflightByTenant.size;

    try {
      await promise;
    } finally {
      this.inflightByTenant.delete(tenantId);
      this.metrics.activeSyncs = this.inflightByTenant.size;
    }
  }
}

let singleton: PayrollSyncCoordinator | null = null;

export function getPayrollSyncCoordinator(): PayrollSyncCoordinator {
  if (!singleton) singleton = new PayrollSyncCoordinator();
  return singleton;
}

export function resetPayrollSyncCoordinatorForTests(): void {
  singleton = new PayrollSyncCoordinator();
}

export async function requestPayrollSync(
  tenantId: string,
  options?: RequestPayrollSyncOptions
): Promise<void> {
  return getPayrollSyncCoordinator().requestSync(tenantId, options);
}

export function isPayrollCacheFresh(tenantId: string): boolean {
  return getPayrollSyncCoordinator().isFresh(tenantId);
}
