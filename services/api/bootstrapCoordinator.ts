/**
 * PERF-P3 — Global bootstrap coordinator.
 * One active primary bootstrap per tenant/session; deduplicated bulk requests;
 * coalesced retry/backoff; soft-failure overlay recovery.
 */
import { apiClient } from './client';
import {
  _setBootstrapSoftFailure,
  type BootstrapSoftFailureState,
} from '../../context/appStateStore';

export type BootstrapHealth = 'idle' | 'running' | 'healthy' | 'unhealthy';

export interface BootstrapCoordinatorMetrics {
  activeBootstraps: number;
  suppressedDeferredBootstraps: number;
  deduplicatedBulkRequests: number;
  coalescedRetries: number;
  overlayRecoveryEvents: number;
}

const LOG_PREFIX = '[BOOTSTRAP_COORDINATOR]';

function logEvent(event: string, detail?: Record<string, unknown>): void {
  if (detail) {
    console.info(LOG_PREFIX, event, detail);
  } else {
    console.info(LOG_PREFIX, event);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class BootstrapCoordinator {
  private tenantId: string | null = null;
  private health: BootstrapHealth = 'idle';
  private softFailure = false;
  private softFailureMessage: BootstrapSoftFailureState['message'] = null;

  private primarySource: string | null = null;
  private primaryStartedAt = 0;
  private primaryPromise: Promise<unknown> | null = null;

  private bulkInflight = new Map<string, Promise<unknown>>();
  private retryInflight = new Map<string, Promise<unknown>>();
  private backoffUntilByTenant = new Map<string, number>();
  private backoffWaitByTenant = new Map<string, Promise<void>>();

  private backgroundRecoveryPromise: Promise<void> | null = null;

  readonly metrics: BootstrapCoordinatorMetrics = {
    activeBootstraps: 0,
    suppressedDeferredBootstraps: 0,
    deduplicatedBulkRequests: 0,
    coalescedRetries: 0,
    overlayRecoveryEvents: 0,
  };

  getHealth(): BootstrapHealth {
    return this.health;
  }

  isBootstrapRunning(): boolean {
    return this.health === 'running' && this.primaryPromise !== null;
  }

  isBootstrapUnhealthy(): boolean {
    return this.health === 'unhealthy' || this.softFailure;
  }

  isBootstrapHealthy(): boolean {
    return this.health === 'healthy';
  }

  isSoftFailure(): boolean {
    return this.softFailure;
  }

  getSoftFailureMessage(): BootstrapSoftFailureState['message'] {
    return this.softFailureMessage;
  }

  getMetrics(): BootstrapCoordinatorMetrics {
    return { ...this.metrics };
  }

  resetForTenant(tenantId: string | null): void {
    if (this.tenantId === tenantId) return;
    logEvent('reset_for_tenant', { previousTenantId: this.tenantId, nextTenantId: tenantId });
    this.tenantId = tenantId;
    this.health = 'idle';
    this.softFailure = false;
    this.softFailureMessage = null;
    _setBootstrapSoftFailure(false, null);
    this.primarySource = null;
    this.primaryPromise = null;
    this.primaryStartedAt = 0;
    this.bulkInflight.clear();
    this.retryInflight.clear();
    this.backoffUntilByTenant.clear();
    this.backoffWaitByTenant.clear();
    this.backgroundRecoveryPromise = null;
  }

  /**
   * One active primary bootstrap per tenant. Concurrent callers attach to the same promise.
   */
  runPrimaryBootstrap<T>(tenantId: string, source: string, fn: () => Promise<T>): Promise<T> {
    this.tenantId = tenantId;

    if (
      this.primaryPromise &&
      this.health === 'running' &&
      this.tenantId === tenantId
    ) {
      logEvent('attach_primary', { tenantId, source, attachedTo: this.primarySource });
      return this.primaryPromise as Promise<T>;
    }

    this.metrics.activeBootstraps += 1;
    this.health = 'running';
    this.softFailure = false;
    this.softFailureMessage = null;
    _setBootstrapSoftFailure(false, null);
    this.primarySource = source;
    this.primaryStartedAt = Date.now();

    logEvent('primary_start', { tenantId, source });

    const promise = fn()
      .then((result) => {
        this.health = 'healthy';
        this.softFailure = false;
        this.softFailureMessage = null;
        _setBootstrapSoftFailure(false, null);
        logEvent('primary_success', { tenantId, source });
        return result;
      })
      .catch((error) => {
        this.health = 'unhealthy';
        logEvent('primary_failed', { tenantId, source, error: String(error) });
        throw error;
      })
      .finally(() => {
        if (this.primaryPromise === promise) {
          this.primaryPromise = null;
          this.primarySource = null;
        }
      });

    this.primaryPromise = promise;
    return promise;
  }

  /** Wait for an in-flight primary bootstrap (used by deferred loaders and refresh). */
  async waitForPrimaryBootstrapIfNeeded(): Promise<void> {
    if (!this.isBootstrapRunning() || !this.primaryPromise) return;
    logEvent('wait_primary', { source: this.primarySource });
    try {
      await this.primaryPromise;
    } catch {
      /* caller decides next step */
    }
  }

  shouldSuppressDeferredBootstrap(): boolean {
    return this.isBootstrapRunning() || this.isBootstrapUnhealthy();
  }

  /**
   * Gate for deferred page-group bootstrap: wait for primary, suppress duplicates while unhealthy.
   */
  async awaitDeferredBootstrapGate(): Promise<boolean> {
    if (this.isBootstrapRunning()) {
      this.metrics.suppressedDeferredBootstraps += 1;
      logEvent('deferred_wait_primary', { source: this.primarySource });
      await this.waitForPrimaryBootstrapIfNeeded();
    }
    if (this.isBootstrapUnhealthy()) {
      this.metrics.suppressedDeferredBootstraps += 1;
      logEvent('deferred_suppressed', {
        health: this.health,
        softFailure: this.softFailure,
      });
      if (this.backgroundRecoveryPromise) {
        try {
          await this.backgroundRecoveryPromise;
        } catch {
          /* background recovery keeps trying */
        }
      }
      return this.isBootstrapHealthy();
    }
    return true;
  }

  /** Deduplicate identical bulk HTTP requests (tenant + endpoint incl. query). */
  dedupeBulkRequest<T>(tenantId: string, endpoint: string, fn: () => Promise<T>): Promise<T> {
    const key = `${tenantId}|${endpoint}`;
    const existing = this.bulkInflight.get(key);
    if (existing) {
      this.metrics.deduplicatedBulkRequests += 1;
      logEvent('deduplicated_bulk', { key });
      return existing as Promise<T>;
    }
    const promise = fn().finally(() => {
      this.bulkInflight.delete(key);
    });
    this.bulkInflight.set(key, promise);
    return promise;
  }

  /** Coalesce parallel retry trees for the same tenant + operation label. */
  withCoalescedBulkRetry<T>(tenantId: string, label: string, fn: () => Promise<T>): Promise<T> {
    const key = `${tenantId}|retry|${label}`;
    const existing = this.retryInflight.get(key);
    if (existing) {
      this.metrics.coalescedRetries += 1;
      logEvent('coalesced_retry', { key });
      return existing as Promise<T>;
    }
    const promise = fn().finally(() => {
      this.retryInflight.delete(key);
    });
    this.retryInflight.set(key, promise);
    return promise;
  }

  /** Shared backoff window per tenant so parallel loaders do not multiply retry delays. */
  async awaitSharedBackoff(tenantId: string, ms: number): Promise<void> {
    const until = Date.now() + ms;
    const prev = this.backoffUntilByTenant.get(tenantId) ?? 0;
    this.backoffUntilByTenant.set(tenantId, Math.max(prev, until));

    let waitPromise = this.backoffWaitByTenant.get(tenantId);
    if (!waitPromise) {
      waitPromise = (async () => {
        while (true) {
          const target = this.backoffUntilByTenant.get(tenantId) ?? 0;
          const remaining = target - Date.now();
          if (remaining <= 0) break;
          await delay(Math.min(remaining, 250));
        }
        this.backoffWaitByTenant.delete(tenantId);
        this.backoffUntilByTenant.delete(tenantId);
      })();
      this.backoffWaitByTenant.set(tenantId, waitPromise);
    }
    await waitPromise;
  }

  enterSoftFailure(error?: unknown, message?: string): void {
    this.softFailure = true;
    this.health = 'unhealthy';
    this.metrics.overlayRecoveryEvents += 1;
    const bannerMessage =
      message ?? 'Some data could not be loaded. Retrying in background.';
    this.softFailureMessage = bannerMessage;
    _setBootstrapSoftFailure(true, bannerMessage);
    logEvent('soft_failure', { error: error ? String(error) : undefined, message: bannerMessage });
  }

  clearSoftFailure(): void {
    this.softFailure = false;
    this.softFailureMessage = null;
    _setBootstrapSoftFailure(false, null);
    logEvent('soft_failure_cleared');
  }

  /** Background recovery after retries exhausted — does not block the UI shell. */
  scheduleBackgroundRecovery(task: () => Promise<void>): void {
    if (this.backgroundRecoveryPromise) {
      logEvent('background_recovery_already_running');
      return;
    }
    logEvent('background_recovery_scheduled');
    this.backgroundRecoveryPromise = (async () => {
      const INITIAL_WAIT_MS = 5_000;
      await delay(INITIAL_WAIT_MS);
      for (let attempt = 0; attempt < 12; attempt++) {
        try {
          await task();
          this.health = 'healthy';
          this.clearSoftFailure();
          logEvent('background_recovery_success', { attempt: attempt + 1 });
          return;
        } catch (error) {
          logEvent('background_recovery_retry', {
            attempt: attempt + 1,
            error: String(error),
          });
          await delay(Math.min(15_000, 3_000 * (attempt + 1)));
        }
      }
      logEvent('background_recovery_exhausted');
    })().finally(() => {
      this.backgroundRecoveryPromise = null;
    });
  }

  async waitForBackgroundRecovery(): Promise<void> {
    if (!this.backgroundRecoveryPromise) return;
    try {
      await this.backgroundRecoveryPromise;
    } catch {
      /* recovery loop handles errors internally */
    }
  }
}

let coordinatorInstance: BootstrapCoordinator | null = null;

export function getBootstrapCoordinator(): BootstrapCoordinator {
  if (!coordinatorInstance) {
    coordinatorInstance = new BootstrapCoordinator();
  }
  return coordinatorInstance;
}

/** Resolve tenant id from apiClient for coordinator keys. */
export function getBulkCoordTenantId(): string {
  return apiClient.getTenantId() ?? 'anonymous';
}

/** Test-only reset. */
export function resetBootstrapCoordinatorForTests(): void {
  coordinatorInstance = null;
}
