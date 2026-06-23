import { useEffect, useRef } from 'react';
import { useDispatchOnly, useStateSelector } from './useSelectiveState';
import { getAppStateApiService } from '../services/api/appStateApi';
import { getBootstrapCoordinator } from '../services/api/bootstrapCoordinator';
import type { AppAction, AppState } from '../types';

/** PERF-A6.1 — excluded from bulk-chunked offset=0; loaded on demand via GET /state/bulk?entities= */
export const DEFERRED_BOOTSTRAP_ENTITY_KEYS = [
  'contacts',
  'invoices',
  'bills',
  'vendors',
  'personalTransactions',
] as const;

export type DeferredBootstrapEntityKey = (typeof DEFERRED_BOOTSTRAP_ENTITY_KEYS)[number];

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
 * Loads deferred bootstrap entities when the active page group needs them and AppState slices are empty.
 * Uses existing GET /state/bulk?entities= API — no global preload at login.
 */
export function usePageGroupDeferredBootstrap(activeGroup: string, enabled: boolean): void {
  const dispatch = useDispatchOnly();
  const lengths = useDeferredEntityLengths();
  const inFlightRef = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const needed = PAGE_GROUP_DEFERRED_ENTITIES[activeGroup];
    if (!needed?.length) return;

    const missing = needed.filter((key) => lengths[key] === 0);
    if (missing.length === 0) return;

    const requestKey = `${activeGroup}:${missing.join(',')}`;
    if (inFlightRef.current === requestKey) return;
    inFlightRef.current = requestKey;

    void (async () => {
      try {
        const coordinator = getBootstrapCoordinator();
        const proceed = await coordinator.awaitDeferredBootstrapGate();
        if (!proceed) return;

        const stillMissing = needed.filter((key) => lengths[key] === 0);
        if (stillMissing.length === 0) return;

        const partial = await getAppStateApiService().loadStateBulk(stillMissing.join(','));
        const hasPayload = stillMissing.some((key) => {
          const slice = partial[ENTITY_STATE_KEYS[key]];
          return Array.isArray(slice) && slice.length > 0;
        });
        if (hasPayload) {
          dispatch({
            type: 'SET_STATE',
            payload: partial,
            _isRemote: true,
          } as AppAction);
        }
      } catch {
        // Allow retry on next navigation when slices are still empty
      } finally {
        if (inFlightRef.current === requestKey) {
          inFlightRef.current = null;
        }
      }
    })();
  }, [activeGroup, enabled, dispatch, lengths.bills, lengths.contacts, lengths.invoices, lengths.personalTransactions, lengths.vendors]);
}
