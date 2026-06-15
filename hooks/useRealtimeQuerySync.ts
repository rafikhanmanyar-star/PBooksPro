/**
 * Real-Time First — optional module-level socket subscription for React Query invalidation.
 *
 * Global invalidation for entity_created/updated/deleted is wired in AppContext via
 * invalidateQueriesForEntityEvent(). Use this hook when a feature needs additional
 * query keys invalidated beyond the central map in services/realtime/entityQueryInvalidation.ts.
 */

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getRealtimeSocket } from '../core/socket';
import { useAuth } from '../context/AuthContext';
import { isLocalOnlyMode } from '../config/apiUrl';
import {
  invalidateQueriesForEntityEvent,
  invalidateQueriesForFinancialPosted,
} from '../services/realtime/entityQueryInvalidation';
import type { RealtimeEntityPayload } from '../services/realtime/realtimePayload';

export type RealtimeQuerySyncOptions = {
  /** Extra invalidation when matching entity types are received (runs after central map). */
  onEntityEvent?: (payload: RealtimeEntityPayload) => void | Promise<void>;
  enabled?: boolean;
};

/**
 * Mount once near the app root (App.tsx) or in a feature module for extra invalidation hooks.
 * AppContext already performs central invalidation; this avoids duplicate socket wiring when
 * `onEntityEvent` is omitted — pass `enabled: false` in App if AppContext handles everything.
 */
export function useRealtimeQuerySync(options: RealtimeQuerySyncOptions = {}): void {
  const { onEntityEvent, enabled = true } = options;
  const { user, isAuthenticated, tenant } = useAuth();
  const queryClient = useQueryClient();
  const apiMode = !isLocalOnlyMode();

  useEffect(() => {
    if (!enabled || !apiMode || !isAuthenticated) return;

    const socket = getRealtimeSocket();
    if (!socket) return;

    const ctx = {
      currentUserId: user?.id,
      currentTenantId: tenant?.id,
    };

    const onEntity = (payload: RealtimeEntityPayload) => {
      void invalidateQueriesForEntityEvent(queryClient, payload, ctx);
      void onEntityEvent?.(payload);
    };

    const onFinancialPosted = () => {
      void invalidateQueriesForFinancialPosted(queryClient);
    };

    socket.on('entity_created', onEntity);
    socket.on('entity_updated', onEntity);
    socket.on('entity_deleted', onEntity);
    socket.on('financial.posted', onFinancialPosted);

    return () => {
      socket.off('entity_created', onEntity);
      socket.off('entity_updated', onEntity);
      socket.off('entity_deleted', onEntity);
      socket.off('financial.posted', onFinancialPosted);
    };
  }, [enabled, apiMode, isAuthenticated, user?.id, tenant?.id, queryClient, onEntityEvent]);
}
