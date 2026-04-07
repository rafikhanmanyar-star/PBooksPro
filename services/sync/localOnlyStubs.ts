/**
 * Local-only mode stubs - no-op implementations when VITE_LOCAL_ONLY is set.
 * Sync, WebSocket, and connection monitoring are disabled for local-only builds.
 */

export type ConnectionStatus = 'online' | 'offline' | 'checking';

export interface WebSocketDebugState {
  status: 'disconnected' | 'connecting' | 'connected' | 'error';
  serverUrl: string;
  tenantId: string | null;
  lastEvent?: { type: string; timestamp: string; data: any };
  lastStatusAt?: string;
  lastError?: string;
}

const noop = () => {};
const asyncNoop = async () => {};

export const syncManagerStub = {
  destroy: noop,
  clearAll: asyncNoop,
  setTenantId: (_: string | null) => {},
  syncOnLogin: asyncNoop,
  setPullProgress: (_l: number, _t: number | null) => {},
  clearPullProgress: noop,
  getQueueStatus: () => ({ total: 0, completed: 0, failed: 0, pending: 0 }),
  get isSyncing() { return false; },
  set isSyncing(_: boolean) {},
};

export const syncQueueStub = {
  getPendingItems: async (_tenantId: string) => [],
  enqueue: async () => '',
  clearAll: async (_tenantId: string) => {},
  removePendingByEntity: async (_tenantId: string, _type: string, _id: string) => false,
  getPendingCount: async (_tenantId: string) => 0,
  getFailedCount: async (_tenantId: string) => 0,
  getSyncStats: async (_tenantId: string) => ({ total: 0, pending: 0, syncing: 0, completed: 0, failed: 0 }),
  getFailedItems: async (_tenantId: string) => [],
  getSyncingItems: async (_tenantId: string) => [],
  clearCompleted: async (_tenantId: string) => {},
  updateStatus: async (_id: string, _status: string, _error?: string) => {},
  retryFailedItem: async (_itemId: string) => {},
  remove: async (_id: string) => {},
};

export const syncEngineStub = {
  start: asyncNoop,
  stop: noop,
  pause: noop,
  resume: noop,
  getIsRunning: () => false,
  onProgress: (_listener: (progress: any) => void) => () => {},
  onComplete: (_listener: (success: boolean, progress: any) => void) => () => {},
};

export const syncOutboxStub = {
  enqueue: () => '',
  getPending: () => [],
  markSynced: noop,
  markFailed: noop,
};

export const connectionMonitorStub = {
  startMonitoring: noop,
  stopMonitoring: noop,
  destroy: noop,
  getStatus: () => 'online' as ConnectionStatus,
  checkStatus: async () => 'online' as ConnectionStatus,
  subscribe: (_listener: (status: ConnectionStatus) => void) => () => {},
  forceCheck: async () => 'online' as ConnectionStatus,
};

export const websocketClientStub = {
  connect: noop,
  disconnect: noop,
  getDebugState: (): WebSocketDebugState => ({
    status: 'disconnected',
    serverUrl: '',
    tenantId: null,
  }),
  /** Subscribe to event; returns unsubscribe. No-op in local-only. */
  on: (_event: string, _handler: (data: any) => void) => () => {},
  off: noop,
};

export const realtimeSyncHandlerStub = {
  initialize: noop,
  destroy: noop,
  setDispatch: (_: any) => {},
  setCurrentUserId: (_: string | null) => {},
  setCurrentTenantId: (_: string | null) => {},
};

export const lockManagerStub = {
  destroy: noop,
};

export const offlineLockManagerStub = {
  setUserContext: noop,
};

export const bidirectionalSyncStub = {
  start: noop,
  stop: noop,
  runSync: asyncNoop,
};
