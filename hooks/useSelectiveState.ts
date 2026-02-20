/**
 * Selective State Subscription Hooks
 * 
 * These hooks let components subscribe to specific slices of AppState,
 * avoiding re-renders when unrelated state changes. Components using
 * useAppContext() re-render on EVERY state change (155+ consumers).
 * These hooks only trigger re-renders when the selected slice changes.
 */

import { useRef, useMemo } from 'react';
import { useAppContext } from '../context/AppContext';
import { AppState } from '../types';

/**
 * Subscribe to a specific slice of AppState.
 * Only triggers a re-render when the selected value changes (by reference).
 * 
 * Usage:
 *   const transactions = useStateSlice(s => s.transactions);
 *   const { accounts, categories } = useStateSlice(s => ({ accounts: s.accounts, categories: s.categories }));
 */
export function useStateSlice<T>(selector: (state: AppState) => T): T {
    const { state } = useAppContext();
    const selectedRef = useRef<T>();
    const selected = selector(state);

    if (selectedRef.current !== selected) {
        selectedRef.current = selected;
    }
    return selectedRef.current as T;
}

/**
 * Get only the accounts array with stable reference.
 */
export function useAccounts() {
    const { state } = useAppContext();
    return useMemo(() => state.accounts, [state.accounts]);
}

/**
 * Get only the transactions array with stable reference.
 */
export function useTransactions() {
    const { state } = useAppContext();
    return useMemo(() => state.transactions, [state.transactions]);
}

/**
 * Get only the contacts array with stable reference.
 */
export function useContacts() {
    const { state } = useAppContext();
    return useMemo(() => state.contacts, [state.contacts]);
}

/**
 * Get only the invoices array with stable reference.
 */
export function useInvoices() {
    const { state } = useAppContext();
    return useMemo(() => state.invoices, [state.invoices]);
}

/**
 * Get only the bills array with stable reference.
 */
export function useBills() {
    const { state } = useAppContext();
    return useMemo(() => state.bills, [state.bills]);
}

/**
 * Get dispatch without subscribing to state changes.
 * Use when a component only dispatches actions and doesn't read state.
 */
export function useDispatchOnly() {
    const { dispatch } = useAppContext();
    return dispatch;
}
