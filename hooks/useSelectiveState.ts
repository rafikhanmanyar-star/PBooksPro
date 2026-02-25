/**
 * Selective State Subscription Hooks
 * 
 * These hooks let components subscribe to specific slices of AppState,
 * avoiding re-renders when unrelated state changes.
 * 
 * Components using useAppContext() re-render on EVERY state change (155+ consumers).
 * These hooks use useSyncExternalStore to only trigger re-renders when the
 * selected slice actually changes (by reference).
 */

import { useCallback, useRef, useSyncExternalStore } from 'react';
import { useAppContext } from '../context/AppContext';
import { _getAppState, _getAppDispatch, _subscribeAppState } from '../context/AppContext';
import { AppState, AppAction } from '../types';

/**
 * Subscribe to a specific slice of AppState.
 * Only triggers a re-render when the selected value changes (by reference).
 * 
 * IMPORTANT: The selector should return a value with a stable reference when
 * the underlying data hasn't changed. Selecting a single array (e.g. s => s.bills)
 * works perfectly. Avoid creating new objects/arrays in the selector.
 * 
 * Usage:
 *   const transactions = useStateSelector(s => s.transactions);
 *   const bills = useStateSelector(s => s.bills);
 */
export function useStateSelector<T>(selector: (state: AppState) => T): T {
    const getSnapshot = useCallback(() => selector(_getAppState()), [selector]);
    return useSyncExternalStore(_subscribeAppState, getSnapshot);
}

/**
 * @deprecated Use useStateSelector instead for true selective re-rendering.
 * This wrapper exists for backward compatibility.
 */
export function useStateSlice<T>(selector: (state: AppState) => T): T {
    return useStateSelector(selector);
}

/**
 * Get only the accounts array. Only re-renders when accounts change.
 */
export function useAccounts() {
    return useStateSelector(s => s.accounts);
}

/**
 * Get only the transactions array. Only re-renders when transactions change.
 */
export function useTransactions() {
    return useStateSelector(s => s.transactions);
}

/**
 * Get only the contacts array. Only re-renders when contacts change.
 */
export function useContacts() {
    return useStateSelector(s => s.contacts);
}

/**
 * Get only the invoices array. Only re-renders when invoices change.
 */
export function useInvoices() {
    return useStateSelector(s => s.invoices);
}

/**
 * Get only the bills array. Only re-renders when bills change.
 */
export function useBills() {
    return useStateSelector(s => s.bills);
}

/**
 * Get only the categories array. Only re-renders when categories change.
 */
export function useCategories() {
    return useStateSelector(s => s.categories);
}

/**
 * Get only the projects array. Only re-renders when projects change.
 */
export function useProjects() {
    return useStateSelector(s => s.projects);
}

/**
 * Get only the buildings array. Only re-renders when buildings change.
 */
export function useBuildings() {
    return useStateSelector(s => s.buildings);
}

/**
 * Get only the properties array. Only re-renders when properties change.
 */
export function useProperties() {
    return useStateSelector(s => s.properties);
}

/**
 * Get only the units array. Only re-renders when units change.
 */
export function useUnits() {
    return useStateSelector(s => s.units);
}

/**
 * Get only the rentalAgreements array. Only re-renders when rentalAgreements change.
 */
export function useRentalAgreements() {
    return useStateSelector(s => s.rentalAgreements);
}

/**
 * Get only the vendors array. Only re-renders when vendors change.
 */
export function useVendors() {
    return useStateSelector(s => s.vendors);
}

/**
 * Get dispatch without subscribing to state changes.
 * Uses module-level dispatch ref, so this hook never causes re-renders.
 */
export function useDispatchOnly(): React.Dispatch<AppAction> {
    const dispatchRef = useRef(_getAppDispatch());
    return dispatchRef.current;
}
