/**
 * Client-side shape for Socket.IO entity events from backend/src/core/realtime.ts.
 * Real-Time First: every mutation emits tenant-scoped events with these fields.
 */

export type RealtimeEntityAction = 'created' | 'updated' | 'deleted';

export type RealtimeEntityPayload = {
  tenantId?: string;
  type?: string;
  action?: RealtimeEntityAction;
  id?: string;
  data?: unknown;
  sourceUserId?: string;
  ts?: string;
  version?: number;
};

export type InvalidateEntityEventContext = {
  /** Skip invalidation when the event originated from this user (same session / other tab still applies). */
  currentUserId?: string;
  currentTenantId?: string;
};
