import type { QueryClient } from '@tanstack/react-query';
import { connectRealtimeSocket, getRealtimeSocket } from '../../core/socket';
import { USER_NOTIFICATIONS_QUERY_KEY } from '../../hooks/useUserNotifications';
import {
  API_REFRESH_COOLDOWN_MS,
  isWithinRefreshCooldown,
  RECONNECT_DEBOUNCE_MS,
  shouldSkipInitialSocketConnect,
  shouldSkipRemoteReducerPatch,
} from './entityEventRefreshPolicy';
import {
  invalidateQueriesForEntityEvent,
  invalidateQueriesForFinancialPosted,
} from './entityQueryInvalidation';
import { invalidateApprovalQueries } from './approvalQueryInvalidation';
import { invalidateMobileApprovalQueries } from './mobileApprovalQueryInvalidation';
import {
  markDashboardRefreshForFinancialPosted,
  maybeMarkDashboardRefreshForEntity,
} from './dashboardRefreshIndicator';
import type { RealtimeEntityPayload } from './realtimePayload';
import { rtTrace } from './realtimeTrace';

export type NotificationCreatedPayload = {
  userId?: string;
  tenantId?: string;
};

export type DispatchHubConfig = {
  onEntityReducerPatch: (payload: RealtimeEntityPayload) => void;
  scheduleRefresh: () => void;
  runRefreshFromApi: () => void;
  getLastRefreshAt: () => number;
  queryClient: QueryClient;
  authToken: string;
  currentUserId: string | undefined;
  currentTenantId: string | undefined;
};

export type ApprovalSocketPayload = {
  tenantId?: string;
};

const APPROVAL_SOCKET_EVENTS = [
  'approval_requested',
  'approval_approved',
  'approval_rejected',
  'approval_returned',
  'approval_escalated',
  'approval_delegated',
] as const;

export const APPROVAL_SOCKET_EVENT_COUNT = APPROVAL_SOCKET_EVENTS.length;

export type RealtimeSocketLike = {
  connected: boolean;
  on(event: string, handler: (...args: unknown[]) => void): void;
  off(event: string, handler: (...args: unknown[]) => void): void;
};

let hubConfig: DispatchHubConfig | null = null;
let boundSocket: RealtimeSocketLike | null = null;
let isFirstConnect = true;
let reconnectDebounceTimer: ReturnType<typeof setTimeout> | null = null;

function getHubConfig(): DispatchHubConfig | null {
  return hubConfig;
}

function handleEntity(payload: RealtimeEntityPayload): void {
  const cfg = getHubConfig();
  if (!cfg) return;

  rtTrace('socket.received', {
    entityType: payload.type,
    entityId: payload.id,
    action: payload.action,
    ts: payload.ts,
  });

  void invalidateQueriesForEntityEvent(cfg.queryClient, payload, {
    currentUserId: cfg.currentUserId,
    currentTenantId: cfg.currentTenantId,
  });
  maybeMarkDashboardRefreshForEntity(payload, { currentUserId: cfg.currentUserId });

  if (payload?.tenantId && cfg.currentTenantId && payload.tenantId !== cfg.currentTenantId) {
    return;
  }

  const d = payload?.data;
  const bulkRefresh =
    payload.type === 'settings' &&
    payload.action === 'updated' &&
    d &&
    typeof d === 'object' &&
    d !== null &&
    'bulkRefresh' in d &&
    typeof (d as { bulkRefresh: unknown }).bulkRefresh === 'string'
      ? (d as { bulkRefresh: string }).bulkRefresh
      : undefined;
  if (bulkRefresh) {
    cfg.runRefreshFromApi();
    return;
  }

  if (shouldSkipRemoteReducerPatch(payload?.sourceUserId, cfg.currentUserId)) {
    cfg.scheduleRefresh();
    return;
  }

  cfg.onEntityReducerPatch(payload);
  cfg.scheduleRefresh();
}

function handleFinancialPosted(): void {
  const cfg = getHubConfig();
  if (!cfg) return;
  void invalidateQueriesForFinancialPosted(cfg.queryClient);
  markDashboardRefreshForFinancialPosted();
  cfg.scheduleRefresh();
}

function handleNotificationCreated(payload: NotificationCreatedPayload): void {
  const cfg = getHubConfig();
  if (!cfg) return;
  if (payload?.tenantId && cfg.currentTenantId && payload.tenantId !== cfg.currentTenantId) return;
  if (payload?.userId && cfg.currentUserId && payload.userId !== cfg.currentUserId) return;
  void cfg.queryClient.invalidateQueries({ queryKey: USER_NOTIFICATIONS_QUERY_KEY });
  void cfg.queryClient.invalidateQueries({ queryKey: ['mobile-notifications'] });
  void cfg.queryClient.invalidateQueries({ queryKey: ['mobile-command-center'] });
}

function handleApprovalEvent(payload: ApprovalSocketPayload): void {
  const cfg = getHubConfig();
  if (!cfg) return;
  if (payload?.tenantId && cfg.currentTenantId && payload.tenantId !== cfg.currentTenantId) return;
  invalidateApprovalQueries(cfg.queryClient);
  invalidateMobileApprovalQueries(cfg.queryClient);
}

function handleReconnect(): void {
  const cfg = getHubConfig();
  if (!cfg) return;

  if (shouldSkipInitialSocketConnect(isFirstConnect)) {
    isFirstConnect = false;
    return;
  }

  if (reconnectDebounceTimer) clearTimeout(reconnectDebounceTimer);
  reconnectDebounceTimer = setTimeout(() => {
    reconnectDebounceTimer = null;
    const activeCfg = getHubConfig();
    if (!activeCfg) return;
    if (isWithinRefreshCooldown(Date.now(), activeCfg.getLastRefreshAt(), API_REFRESH_COOLDOWN_MS)) {
      return;
    }
    activeCfg.scheduleRefresh();
  }, RECONNECT_DEBOUNCE_MS);
}

const hubHandlers = {
  handleEntity,
  handleFinancialPosted,
  handleNotificationCreated,
  handleApprovalEvent,
  handleReconnect,
};

function bindApprovalListeners(socket: RealtimeSocketLike, bind: 'on' | 'off'): void {
  const fn = bind === 'on' ? socket.on.bind(socket) : socket.off.bind(socket);
  for (const event of APPROVAL_SOCKET_EVENTS) {
    fn(event, hubHandlers.handleApprovalEvent as (...args: unknown[]) => void);
  }
}

function bindHubToSocket(socket: RealtimeSocketLike): void {
  boundSocket = socket;
  if (socket.connected) {
    isFirstConnect = false;
  }
  socket.on('entity_created', hubHandlers.handleEntity as (...args: unknown[]) => void);
  socket.on('entity_updated', hubHandlers.handleEntity as (...args: unknown[]) => void);
  socket.on('entity_deleted', hubHandlers.handleEntity as (...args: unknown[]) => void);
  socket.on('financial.posted', hubHandlers.handleFinancialPosted as (...args: unknown[]) => void);
  socket.on('notification_created', hubHandlers.handleNotificationCreated as (...args: unknown[]) => void);
  bindApprovalListeners(socket, 'on');
  socket.on('connect', hubHandlers.handleReconnect as (...args: unknown[]) => void);
}

export function cleanupRealtimeDispatchHub(): void {
  if (reconnectDebounceTimer) {
    clearTimeout(reconnectDebounceTimer);
    reconnectDebounceTimer = null;
  }
  if (boundSocket) {
    boundSocket.off('entity_created', hubHandlers.handleEntity as (...args: unknown[]) => void);
    boundSocket.off('entity_updated', hubHandlers.handleEntity as (...args: unknown[]) => void);
    boundSocket.off('entity_deleted', hubHandlers.handleEntity as (...args: unknown[]) => void);
    boundSocket.off('financial.posted', hubHandlers.handleFinancialPosted as (...args: unknown[]) => void);
    boundSocket.off(
      'notification_created',
      hubHandlers.handleNotificationCreated as (...args: unknown[]) => void
    );
    bindApprovalListeners(boundSocket, 'off');
    boundSocket.off('connect', hubHandlers.handleReconnect as (...args: unknown[]) => void);
    boundSocket = null;
  }
  isFirstConnect = true;
  hubConfig = null;
}

/** Sole production owner of connectRealtimeSocket() for entity sync. */
export function initRealtimeDispatchHub(config: DispatchHubConfig): () => void {
  cleanupRealtimeDispatchHub();
  hubConfig = config;
  isFirstConnect = true;
  const socket = connectRealtimeSocket(config.authToken);
  bindHubToSocket(socket);
  return cleanupRealtimeDispatchHub;
}

/** Test-only: bind hub to a mock socket without connectRealtimeSocket. */
export function bindRealtimeDispatchHubForTest(
  socket: RealtimeSocketLike,
  config: DispatchHubConfig
): () => void {
  cleanupRealtimeDispatchHub();
  hubConfig = config;
  isFirstConnect = true;
  bindHubToSocket(socket);
  return cleanupRealtimeDispatchHub;
}

export function getRealtimeDispatchHubConfigForTest(): DispatchHubConfig | null {
  return hubConfig;
}

export function getRealtimeDispatchHubFirstConnectForTest(): boolean {
  return isFirstConnect;
}

export function getRealtimeDispatchHubSocketForTest(): RealtimeSocketLike | null {
  return boundSocket;
}

/** Re-export for satellite UI listeners (chat, WhatsApp, locks). */
export { getRealtimeSocket };
