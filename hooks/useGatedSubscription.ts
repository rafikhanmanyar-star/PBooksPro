import { useCallback, useRef, useSyncExternalStore } from 'react';
import { _getAppState, _subscribeAppState } from '../context/appStateStore';
import { usePageActiveGateState } from '../context/PageActiveContext';

/**
 * Zustand-style selector with optional page-activity gating.
 * When the enclosing `PageActiveScope` is inactive, unsubscribes from AppState
 * and returns the last snapshot from deactivation (no rerenders).
 */
export function useGatedStateSelector<T>(selector: (state: ReturnType<typeof _getAppState>) => T): T {
  const { shouldGate } = usePageActiveGateState();
  const selectorRef = useRef(selector);
  selectorRef.current = selector;
  const frozenRef = useRef<T>(selector(_getAppState()));

  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      if (shouldGate) return () => {};
      return _subscribeAppState(onStoreChange);
    },
    [shouldGate]
  );

  const getSnapshot = useCallback(() => {
    const next = selectorRef.current(_getAppState());
    if (shouldGate) {
      return frozenRef.current;
    }
    frozenRef.current = next;
    return next;
  }, [shouldGate]);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
