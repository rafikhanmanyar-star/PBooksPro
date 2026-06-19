import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { QueryClient } from '@tanstack/react-query';
import {
  API_REFRESH_COOLDOWN_MS,
  RECONNECT_DEBOUNCE_MS,
} from '../services/realtime/entityEventRefreshPolicy';
import {
  APPROVAL_SOCKET_EVENT_COUNT,
  bindRealtimeDispatchHubForTest,
  cleanupRealtimeDispatchHub,
  getRealtimeDispatchHubConfigForTest,
  getRealtimeDispatchHubFirstConnectForTest,
  getRealtimeDispatchHubSocketForTest,
  type DispatchHubConfig,
  type RealtimeSocketLike,
} from '../services/realtime/RealtimeDispatchHub';
import { APPROVAL_INVALIDATION_QUERY_KEYS } from '../services/realtime/approvalQueryInvalidation';
import { MOBILE_APPROVALS_QUERY_KEY } from '../services/realtime/mobileApprovalQueryInvalidation';
import { USER_NOTIFICATIONS_QUERY_KEY } from '../hooks/useUserNotifications';

class MockSocket implements RealtimeSocketLike {
  connected = false;
  private listeners = new Map<string, Set<(...args: unknown[]) => void>>();

  on(event: string, handler: (...args: unknown[]) => void): void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(handler);
  }

  off(event: string, handler: (...args: unknown[]) => void): void {
    this.listeners.get(event)?.delete(handler);
  }

  emit(event: string, ...args: unknown[]): void {
    const handlers = this.listeners.get(event);
    if (!handlers) return;
    for (const handler of handlers) {
      handler(...args);
    }
  }

  listenerCount(event: string): number {
    return this.listeners.get(event)?.size ?? 0;
  }
}

function createTestConfig(overrides: Partial<DispatchHubConfig> = {}): DispatchHubConfig {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return {
    authToken: 'test-token',
    queryClient,
    currentUserId: 'user-a',
    currentTenantId: 'tenant-a',
    getLastRefreshAt: () => 0,
    scheduleRefresh: () => {},
    runRefreshFromApi: () => {},
    onEntityReducerPatch: () => {},
    ...overrides,
  };
}

describe('RealtimeDispatchHub A3.1', () => {
  beforeEach(() => {
    cleanupRealtimeDispatchHub();
  });

  afterEach(() => {
    cleanupRealtimeDispatchHub();
  });

  it('initializes hub config and binds core + approval socket listeners', () => {
    const socket = new MockSocket();
    bindRealtimeDispatchHubForTest(socket, createTestConfig());

    assert.ok(getRealtimeDispatchHubConfigForTest());
    assert.equal(getRealtimeDispatchHubSocketForTest(), socket);
    assert.equal(socket.listenerCount('entity_created'), 1);
    assert.equal(socket.listenerCount('entity_updated'), 1);
    assert.equal(socket.listenerCount('entity_deleted'), 1);
    assert.equal(socket.listenerCount('financial.posted'), 1);
    assert.equal(socket.listenerCount('notification_created'), 1);
    assert.equal(socket.listenerCount('connect'), 1);
    for (const ev of [
      'approval_requested',
      'approval_approved',
      'approval_rejected',
      'approval_returned',
      'approval_escalated',
      'approval_delegated',
    ]) {
      assert.equal(socket.listenerCount(ev), 1, `expected listener for ${ev}`);
    }
  });

  it('cleanup clears hubConfig, listeners, and reconnect timer', () => {
    const socket = new MockSocket();
    let scheduleCount = 0;
    const cleanup = bindRealtimeDispatchHubForTest(
      socket,
      createTestConfig({ scheduleRefresh: () => { scheduleCount += 1; } })
    );

    socket.emit('connect');
    assert.equal(getRealtimeDispatchHubFirstConnectForTest(), false);

    cleanup();
    assert.equal(getRealtimeDispatchHubConfigForTest(), null);
    assert.equal(getRealtimeDispatchHubSocketForTest(), null);
    assert.equal(socket.listenerCount('connect'), 0);

    socket.emit('connect');
    assert.equal(scheduleCount, 0);
  });

  it('R1: first connect does not schedule refresh', () => {
    const socket = new MockSocket();
    let scheduleCount = 0;
    bindRealtimeDispatchHubForTest(
      socket,
      createTestConfig({ scheduleRefresh: () => { scheduleCount += 1; } })
    );

    socket.emit('connect');
    assert.equal(scheduleCount, 0);
    assert.equal(getRealtimeDispatchHubFirstConnectForTest(), false);
  });

  it('R2: second connect schedules refresh after debounce', async () => {
    const socket = new MockSocket();
    let scheduleCount = 0;
    bindRealtimeDispatchHubForTest(
      socket,
      createTestConfig({ scheduleRefresh: () => { scheduleCount += 1; } })
    );

    socket.emit('connect');
    socket.emit('connect');
    assert.equal(scheduleCount, 0);

    await new Promise((r) => setTimeout(r, RECONNECT_DEBOUNCE_MS + 50));
    assert.equal(scheduleCount, 1);
  });

  it('R3: reconnect within cooldown does not schedule refresh', async () => {
    const socket = new MockSocket();
    let scheduleCount = 0;
    const recentRefreshAt = Date.now() - 100;
    bindRealtimeDispatchHubForTest(
      socket,
      createTestConfig({
        getLastRefreshAt: () => recentRefreshAt,
        scheduleRefresh: () => { scheduleCount += 1; },
      })
    );

    socket.emit('connect');
    socket.emit('connect');
    await new Promise((r) => setTimeout(r, RECONNECT_DEBOUNCE_MS + 50));
    assert.equal(scheduleCount, 0);
    assert.ok(Date.now() - recentRefreshAt < API_REFRESH_COOLDOWN_MS);
  });

  it('R6: re-init after cleanup resets first-connect behavior', async () => {
    const socket = new MockSocket();
    let scheduleCount = 0;
    const scheduleRefresh = () => { scheduleCount += 1; };

    const cleanup = bindRealtimeDispatchHubForTest(socket, createTestConfig({ scheduleRefresh }));
    socket.emit('connect');
    socket.emit('connect');
    await new Promise((r) => setTimeout(r, RECONNECT_DEBOUNCE_MS + 50));
    assert.equal(scheduleCount, 1);

    cleanup();
    scheduleCount = 0;
    bindRealtimeDispatchHubForTest(socket, createTestConfig({ scheduleRefresh }));
    assert.equal(getRealtimeDispatchHubFirstConnectForTest(), true);
    socket.emit('connect');
    assert.equal(scheduleCount, 0);
  });

  it('notification_created invalidates user, mobile, and command-center keys for matching user', async () => {
    const socket = new MockSocket();
    const keys: unknown[][] = [];
    const queryClient = {
      invalidateQueries: ({ queryKey }: { queryKey: readonly unknown[] }) => {
        keys.push([...queryKey]);
      },
    } as unknown as QueryClient;

    bindRealtimeDispatchHubForTest(
      socket,
      createTestConfig({ queryClient, currentUserId: 'user-a', currentTenantId: 'tenant-a' })
    );

    socket.emit('notification_created', { tenantId: 'tenant-a', userId: 'user-a' });
    assert.equal(keys.length, 3);
    assert.ok(keys.some((k) => k[0] === USER_NOTIFICATIONS_QUERY_KEY[0]));
    assert.ok(keys.some((k) => k[0] === 'mobile-notifications'));
    assert.ok(keys.some((k) => k[0] === 'mobile-command-center'));

    socket.emit('notification_created', { tenantId: 'tenant-a', userId: 'user-b' });
    assert.equal(keys.length, 3);

    socket.emit('notification_created', { tenantId: 'tenant-b', userId: 'user-a' });
    assert.equal(keys.length, 3);
  });

  it('tenant switch: cleanup then re-init uses new tenant context', () => {
    const socket = new MockSocket();
    let patchTenant: string | undefined;

    const cleanup = bindRealtimeDispatchHubForTest(
      socket,
      createTestConfig({
        currentTenantId: 'tenant-old',
        onEntityReducerPatch: () => { patchTenant = 'tenant-old'; },
      })
    );

    cleanup();

    bindRealtimeDispatchHubForTest(
      socket,
      createTestConfig({
        currentTenantId: 'tenant-new',
        onEntityReducerPatch: () => { patchTenant = 'tenant-new'; },
      })
    );

    socket.emit('entity_updated', {
      tenantId: 'tenant-new',
      type: 'project',
      action: 'updated',
      id: 'p1',
      data: { id: 'p1', name: 'P', version: 1 },
      sourceUserId: 'user-b',
    });

    assert.equal(patchTenant, 'tenant-new');
    assert.equal(getRealtimeDispatchHubConfigForTest()?.currentTenantId, 'tenant-new');
  });

  it('V9: approval listener cleanup symmetry (on count equals off count)', () => {
    const socket = new MockSocket();
    const approvalEvents = [
      'approval_requested',
      'approval_approved',
      'approval_rejected',
      'approval_returned',
      'approval_escalated',
      'approval_delegated',
    ] as const;

    const cleanup = bindRealtimeDispatchHubForTest(socket, createTestConfig());
    let onCount = 0;
    for (const ev of approvalEvents) {
      onCount += socket.listenerCount(ev);
    }
    assert.equal(onCount, APPROVAL_SOCKET_EVENT_COUNT);

    cleanup();
    let offCount = 0;
    for (const ev of approvalEvents) {
      offCount += socket.listenerCount(ev);
    }
    assert.equal(offCount, 0);
    assert.equal(onCount, APPROVAL_SOCKET_EVENT_COUNT);
  });

  it('approval_requested invalidates approval keys and mobile-approvals for matching tenant', () => {
    const socket = new MockSocket();
    const keys: unknown[][] = [];
    const queryClient = {
      invalidateQueries: ({ queryKey }: { queryKey: readonly unknown[] }) => {
        keys.push([...queryKey]);
      },
    } as unknown as QueryClient;

    bindRealtimeDispatchHubForTest(
      socket,
      createTestConfig({ queryClient, currentTenantId: 'tenant-a' })
    );

    socket.emit('approval_requested', { tenantId: 'tenant-a' });
    assert.equal(keys.length, 9);
    for (const expected of APPROVAL_INVALIDATION_QUERY_KEYS) {
      assert.ok(keys.some((k) => k[0] === expected[0]));
    }
    assert.ok(keys.some((k) => k[0] === MOBILE_APPROVALS_QUERY_KEY[0]));
  });

  for (const event of [
    'approval_requested',
    'approval_approved',
    'approval_rejected',
    'approval_returned',
    'approval_escalated',
    'approval_delegated',
  ] as const) {
    it(`${event} invalidates 8 approval keys and mobile-approvals`, () => {
      const socket = new MockSocket();
      const keys: unknown[][] = [];
      const queryClient = {
        invalidateQueries: ({ queryKey }: { queryKey: readonly unknown[] }) => {
          keys.push([...queryKey]);
        },
      } as unknown as QueryClient;

      bindRealtimeDispatchHubForTest(
        socket,
        createTestConfig({ queryClient, currentTenantId: 'tenant-a', currentUserId: 'user-a' })
      );

      socket.emit(event, {
        tenantId: 'tenant-a',
        sourceUserId: 'other-user',
      });
      assert.equal(keys.length, 9);
      assert.ok(keys.some((k) => k[0] === MOBILE_APPROVALS_QUERY_KEY[0]));
    });
  }

  it('approval_requested skips invalidation for foreign tenant (including mobile-approvals)', () => {
    const socket = new MockSocket();
    const keys: unknown[][] = [];
    const queryClient = {
      invalidateQueries: ({ queryKey }: { queryKey: readonly unknown[] }) => {
        keys.push([...queryKey]);
      },
    } as unknown as QueryClient;

    bindRealtimeDispatchHubForTest(
      socket,
      createTestConfig({ queryClient, currentTenantId: 'tenant-a' })
    );

    socket.emit('approval_requested', { tenantId: 'tenant-b', sourceUserId: 'user-a' });
    assert.equal(keys.length, 0);
  });

  it('handleApprovalEvent does not filter on sourceUserId', () => {
    const hubSrc = readFileSync(
      join(process.cwd(), 'services/realtime/RealtimeDispatchHub.ts'),
      'utf8'
    );
    const match = hubSrc.match(/function handleApprovalEvent[\s\S]*?\n\}/);
    assert.ok(match);
    assert.doesNotMatch(match![0], /sourceUserId/);
  });

  it('procurement hooks do not register entity_* socket listeners', () => {
    for (const file of [
      'hooks/usePurchaseOrders.ts',
      'hooks/useGoodsReceipts.ts',
      'hooks/useQuotationComparison.ts',
    ]) {
      const src = readFileSync(join(process.cwd(), file), 'utf8');
      assert.doesNotMatch(src, /socket\.on\('entity_/);
      assert.doesNotMatch(src, /getRealtimeSocket/);
    }
  });

  it('workflow hooks do not register approval_* socket listeners', () => {
    const src = readFileSync(join(process.cwd(), 'hooks/useWorkflow.ts'), 'utf8');
    assert.doesNotMatch(src, /socket\.on\(/);
    assert.doesNotMatch(src, /getRealtimeSocket/);
    assert.match(src, /invalidateApprovalQueries/);
  });

  it('useMobileNotifications has no approval socket listeners', () => {
    const src = readFileSync(
      join(process.cwd(), 'modules/executive-mobile/hooks/useMobileNotifications.ts'),
      'utf8'
    );
    assert.doesNotMatch(src, /socket\.on/);
    assert.doesNotMatch(src, /approval_/);
    assert.doesNotMatch(src, /getRealtimeSocket/);
  });

  it('useMobileCommandCenter has no socket listeners', () => {
    const src = readFileSync(
      join(process.cwd(), 'modules/executive-mobile/hooks/useMobileCommandCenter.ts'),
      'utf8'
    );
    assert.doesNotMatch(src, /socket\.on/);
    assert.doesNotMatch(src, /getRealtimeSocket/);
  });

  it('useRealtimeQuerySync.ts is removed (no duplicate socket invalidation path)', () => {
    assert.throws(
      () => readFileSync(join(process.cwd(), 'hooks/useRealtimeQuerySync.ts'), 'utf8'),
      /ENOENT/
    );
  });

  it('Sidebar uses getRealtimeSocket only (no connectRealtimeSocket)', () => {
    const src = readFileSync(join(process.cwd(), 'components/layout/Sidebar.tsx'), 'utf8');
    assert.match(src, /getRealtimeSocket/);
    assert.doesNotMatch(src, /connectRealtimeSocket/);
  });

  it('ChatModal uses getRealtimeSocket only (no connectRealtimeSocket)', () => {
    const src = readFileSync(join(process.cwd(), 'components/chat/ChatModal.tsx'), 'utf8');
    assert.match(src, /getRealtimeSocket/);
    assert.doesNotMatch(src, /connectRealtimeSocket/);
  });

  it('RealtimeDispatchHub is sole connectRealtimeSocket owner outside core/socket', () => {
    const hubSrc = readFileSync(join(process.cwd(), 'services/realtime/RealtimeDispatchHub.ts'), 'utf8');
    assert.match(hubSrc, /connectRealtimeSocket/);
  });
});

describe('notification_created query keys', () => {
  it('uses expected React Query keys', () => {
    assert.deepEqual(USER_NOTIFICATIONS_QUERY_KEY, ['user-notifications']);
  });
});
