/**
 * useSyncStatus Hook (Local-Only Stub)
 *
 * No sync queue in local-only architecture. Returns static idle state.
 */

export interface UseSyncStatusResult {
  total: number;
  pending: number;
  syncing: number;
  failed: number;
  isSyncing: boolean;
  isInbound: boolean;
  hasPending: boolean;
  progress: null;
}

export function useSyncStatus(): UseSyncStatusResult {
  return {
    total: 0,
    pending: 0,
    syncing: 0,
    failed: 0,
    isSyncing: false,
    isInbound: false,
    hasPending: false,
    progress: null,
  };
}
