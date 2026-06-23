import { useEffect, useRef } from 'react';
import { useDispatchOnly, useStateSelector } from './useSelectiveState';
import { getAppStateApiService } from '../services/api/appStateApi';
import { getBootstrapCoordinator } from '../services/api/bootstrapCoordinator';
import {
  type DeferredBootstrapEntityKey,
  DEFERRED_BOOTSTRAP_ENTITY_KEYS,
  ensureDeferredBundleSessionTenant,
  isDeferredBundleSessionLoaded,
  markDeferredBundleLoadSuccess,
  normalizeEntityBundle,
  recordDeferredBundleCacheHit,
  recordDeferredBundleCacheMiss,
  resolveDeferredMissingEntities,
} from '../services/api/deferredBundleState';
import { apiClient } from '../services/api/client';
import type { AppAction, AppState } from '../types';

export { DEFERRED_BOOTSTRAP_ENTITY_KEYS, type DeferredBootstrapEntityKey };

const ENTITY_STATE_KEYS: Record<DeferredBootstrapEntityKey, keyof AppState> = {
  contacts: 'contacts',
  invoices: 'invoices',
  bills: 'bills',
  vendors: 'vendors',
  personalTransactions: 'personalTransactions',
};

/** Page groups that need deferred entities in AppState (subset per group). */
export const PAGE_GROUP_DEFERRED_ENTITIES: Record<string, readonly DeferredBootstrapEntityKey[]> = {
  DASHBOARD: ['invoices', 'bills', 'contacts'],
  TRANSACTIONS: ['contacts', 'invoices', 'bills', 'vendors'],
  PAYMENTS: ['contacts', 'invoices'],
  LOANS: ['contacts'],
  VENDORS: ['vendors', 'bills', 'contacts'],
  CONTACTS: ['contacts'],
  RENTAL: ['invoices', 'contacts', 'bills'],
  PROJECT: ['bills', 'contacts', 'vendors'],
  PROJECT_SELLING: ['contacts', 'invoices'],
  INVESTMENT: ['contacts'],
  SETTINGS: ['contacts'],
  PAYROLL: ['contacts'],
  PERSONAL_TRANSACTIONS: ['personalTransactions'],
  ACCOUNTING: ['invoices', 'bills', 'contacts', 'vendors'],
};

function useDeferredEntityLengths(): Record<DeferredBootstrapEntityKey, number> {
  const contacts = useStateSelector((s) => s.contacts?.length ?? 0);
  const invoices = useStateSelector((s) => s.invoices?.length ?? 0);
  const bills = useStateSelector((s) => s.bills?.length ?? 0);
  const vendors = useStateSelector((s) => s.vendors?.length ?? 0);
  const personalTransactions = useStateSelector((s) => s.personalTransactions?.length ?? 0);
  return { contacts, invoices, bills, vendors, personalTransactions };
}

/**
 * Loads deferred bootstrap entities when the active page group needs them and slices are not yet loaded.
 * Uses GET /state/bulk?entities= with canonical bundle ordering and session load tracking (PERF-P3.2).
 */
export function usePageGroupDeferredBootstrap(activeGroup: string, enabled: boolean): void {
  const dispatch = useDispatchOnly();
  const lengths = useDeferredEntityLengths();
  const inFlightRef = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled) return;

    ensureDeferredBundleSessionTenant(apiClient.getTenantId());

    const needed = PAGE_GROUP_DEFERRED_ENTITIES[activeGroup];
    if (!needed?.length) return;

    const missing = resolveDeferredMissingEntities(needed, lengths);
    if (missing.length === 0) return;

    const normalizedBundle = normalizeEntityBundle(missing.join(','));
    if (isDeferredBundleSessionLoaded(normalizedBundle)) {
      recordDeferredBundleCacheHit(normalizedBundle);
      return;
    }

    if (inFlightRef.current === normalizedBundle) return;
    inFlightRef.current = normalizedBundle;
    recordDeferredBundleCacheMiss(normalizedBundle);

    void (async () => {
      try {
        const coordinator = getBootstrapCoordinator();
        const proceed = await coordinator.awaitDeferredBootstrapGate();
        if (!proceed) return;

        const stillMissing = resolveDeferredMissingEntities(needed, lengths);
        if (stillMissing.length === 0) return;

        const bundle = normalizeEntityBundle(stillMissing.join(','));
        if (isDeferredBundleSessionLoaded(bundle)) {
          recordDeferredBundleCacheHit(bundle);
          return;
        }

        const partial = await getAppStateApiService().loadStateBulk(bundle);
        markDeferredBundleLoadSuccess(stillMissing, bundle);
        dispatch({
          type: 'SET_STATE',
          payload: partial,
          _isRemote: true,
        } as AppAction);
      } catch {
        // Allow retry on next navigation when slices are still not marked loaded
      } finally {
        if (inFlightRef.current === normalizedBundle) {
          inFlightRef.current = null;
        }
      }
    })();
  }, [activeGroup, enabled, dispatch, lengths.bills, lengths.contacts, lengths.invoices, lengths.personalTransactions, lengths.vendors]);
}
