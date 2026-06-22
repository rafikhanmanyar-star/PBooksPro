/**
 * Pool connection ownership tracker — investigation instrumentation.
 *
 * Enabled by PBOOKS_PERF_POOL_OWNERSHIP=1.
 *
 * Wraps pool.connect() after pool creation to measure:
 *   - which HTTP route owns each connection
 *   - how long it holds it
 *   - pool state at acquire time
 *
 * Logs [POOL_HOLD] when holdMs > HOLD_WARN_MS (default 500) or
 * pool.waitingCount > 0 at acquire time.
 *
 * Maintains an in-memory ring buffer (last 200 events) of the longest-held
 * connections. Dump via getPoolOwnershipReport().
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import type pg from 'pg';

export interface OwnershipContext {
  requestId: string;
  method: string;
  route: string;
  /** High-res timestamp when this context was created (for elapsed math). */
  createdAt: number;
}

export interface HoldEvent {
  requestId: string;
  method: string;
  route: string;
  acquireAt: number;         // Date.now() ms
  releaseAt: number;         // Date.now() ms
  holdMs: number;
  waitMs: number;            // time spent in pool.connect() queue
  poolTotalAtAcquire: number;
  poolIdleAtAcquire: number;
  poolWaitingAtAcquire: number;
  poolIdleAtRelease: number;
  poolWaitingAtRelease: number;
}

const HOLD_WARN_MS = parseInt(process.env.PBOOKS_PERF_POOL_HOLD_WARN_MS || '500', 10);
const RING_BUFFER_SIZE = 200;

const ownershipStorage = new AsyncLocalStorage<OwnershipContext>();

/** Ring buffer of recent hold events, sorted by insertation order. */
const holdRing: HoldEvent[] = [];

export function poolOwnershipEnabled(): boolean {
  const v = process.env.PBOOKS_PERF_POOL_OWNERSHIP;
  return v === '1' || v === 'true' || v === 'yes';
}

/** Set current request context. Call from a middleware early in the chain. */
export function runWithOwnershipContext<T>(ctx: OwnershipContext, fn: () => T): T {
  return ownershipStorage.run(ctx, fn) as T;
}

function getOwnershipContext(): OwnershipContext {
  return ownershipStorage.getStore() ?? {
    requestId: 'background',
    method: '-',
    route: 'background',
    createdAt: Date.now(),
  };
}

function pushHoldEvent(evt: HoldEvent): void {
  if (holdRing.length >= RING_BUFFER_SIZE) holdRing.shift();
  holdRing.push(evt);
}

type ConnectCallback = (err: Error | null, client: pg.PoolClient, done: (release?: unknown) => void) => void;

function wrapClientRelease(
  client: pg.PoolClient,
  ctx: OwnershipContext,
  acquireAt: number,
  waitMs: number,
  pre: { total: number; idle: number; waiting: number },
  pool: pg.Pool
): void {
  const originalRelease = client.release.bind(client);
  (client as unknown as { release: typeof client.release }).release = function instrumentedRelease(
    err?: Error | boolean
  ) {
    const releaseAt = Date.now();
    const holdMs = releaseAt - acquireAt;
    const postIdle = pool.idleCount;
    const postWaiting = pool.waitingCount;

    if (holdMs > HOLD_WARN_MS || pre.waiting > 0) {
      const evt: HoldEvent = {
        requestId: ctx.requestId,
        method: ctx.method,
        route: ctx.route,
        acquireAt,
        releaseAt,
        holdMs,
        waitMs,
        poolTotalAtAcquire: pre.total,
        poolIdleAtAcquire: pre.idle,
        poolWaitingAtAcquire: pre.waiting,
        poolIdleAtRelease: postIdle,
        poolWaitingAtRelease: postWaiting,
      };
      pushHoldEvent(evt);
      console.log(
        `[POOL_HOLD] route="${ctx.method} ${ctx.route}" requestId=${ctx.requestId}` +
        ` acquireAt=${acquireAt} releaseAt=${releaseAt}` +
        ` holdMs=${holdMs} waitMs=${waitMs}` +
        ` atAcquire={total:${pre.total},idle:${pre.idle},waiting:${pre.waiting}}` +
        ` atRelease={idle:${postIdle},waiting:${postWaiting}}`
      );
      if (holdMs > 2_000) {
        console.error(`[POOL_HOLD_LONG] 🔴 route="${ctx.method} ${ctx.route}" holdMs=${holdMs} requestId=${ctx.requestId}`);
      } else if (holdMs > HOLD_WARN_MS) {
        console.warn(`[POOL_HOLD_WARN] 🟡 route="${ctx.method} ${ctx.route}" holdMs=${holdMs} requestId=${ctx.requestId}`);
      }
    }

    return originalRelease(err as Error);
  };
}

/**
 * Monkey-patch pool.connect() once after pool creation.
 *
 * pg v8 Pool.connect() supports two call signatures:
 *   (a) Promise mode:   pool.connect() → Promise<PoolClient>
 *   (b) Callback mode:  pool.connect(cb) → void  [used internally by pool.query()]
 *
 * We instrument both. Callback mode is used by pool.query() internally; we wrap
 * the done() callback to record hold time. Promise mode is used by route handlers
 * and middleware; we wrap client.release() directly.
 */
export function installPoolOwnershipTracker(pool: pg.Pool): void {
  if (!poolOwnershipEnabled()) return;

  const originalConnect = pool.connect.bind(pool) as {
    (): Promise<pg.PoolClient>;
    (cb: ConnectCallback): void;
  };

  (pool as unknown as { connect: unknown }).connect = function instrumentedConnect(
    cb?: ConnectCallback
  ): Promise<pg.PoolClient> | void {
    const ctx = getOwnershipContext();
    const pre = { total: pool.totalCount, idle: pool.idleCount, waiting: pool.waitingCount };
    const acquireStart = Date.now();

    if (typeof cb === 'function') {
      // Callback mode — used internally by pool.query()
      originalConnect(function(err, client, done) {
        const acquireEnd = Date.now();
        const waitMs = acquireEnd - acquireStart;

        if (err) {
          cb(err, client, done);
          return;
        }

        // Wrap done() to track release time
        const wrappedDone = function(release?: unknown) {
          const releaseAt = Date.now();
          const holdMs = releaseAt - acquireEnd;
          const postIdle = pool.idleCount;
          const postWaiting = pool.waitingCount;

          if (holdMs > HOLD_WARN_MS || pre.waiting > 0) {
            const evt: HoldEvent = {
              requestId: ctx.requestId,
              method: ctx.method,
              route: ctx.route,
              acquireAt: acquireEnd,
              releaseAt,
              holdMs,
              waitMs,
              poolTotalAtAcquire: pre.total,
              poolIdleAtAcquire: pre.idle,
              poolWaitingAtAcquire: pre.waiting,
              poolIdleAtRelease: postIdle,
              poolWaitingAtRelease: postWaiting,
            };
            pushHoldEvent(evt);
            console.log(
              `[POOL_HOLD] route="${ctx.method} ${ctx.route}" requestId=${ctx.requestId}` +
              ` holdMs=${holdMs} waitMs=${waitMs}` +
              ` atAcquire={total:${pre.total},idle:${pre.idle},waiting:${pre.waiting}}` +
              ` atRelease={idle:${postIdle},waiting:${postWaiting}}`
            );
          }

          done(release);
        };

        cb(null, client, wrappedDone);
      });
      return;
    }

    // Promise mode — used by route handlers and middleware via await pool.connect()
    return (async () => {
      const client = await originalConnect();
      const acquireEnd = Date.now();
      const waitMs = acquireEnd - acquireStart;
      wrapClientRelease(client, ctx, acquireEnd, waitMs, pre, pool);
      return client;
    })();
  };

  console.log(`[POOL_OWNERSHIP] Connection ownership tracker installed (holdWarnMs=${HOLD_WARN_MS})`);
}

/**
 * Return the top-N longest-held connections seen since process start,
 * plus all events in the ring buffer with waitingCount > 0 at acquire.
 */
export function getPoolOwnershipReport(topN = 20): {
  topByHold: HoldEvent[];
  withQueueAtAcquire: HoldEvent[];
  ringSize: number;
} {
  const sorted = [...holdRing].sort((a, b) => b.holdMs - a.holdMs);
  return {
    topByHold: sorted.slice(0, topN),
    withQueueAtAcquire: holdRing.filter((e) => e.poolWaitingAtAcquire > 0),
    ringSize: holdRing.length,
  };
}

/** Middleware factory — wraps each request in an ownership context. */
export function poolOwnershipMiddleware() {
  return function setOwnershipCtx(
    req: { requestId?: string; method: string; originalUrl?: string; url?: string },
    _res: unknown,
    next: () => void
  ): void {
    if (!poolOwnershipEnabled()) { next(); return; }
    const ctx: OwnershipContext = {
      requestId: (req.requestId as string | undefined) ?? 'unknown',
      method: req.method ?? 'GET',
      route: req.originalUrl ?? req.url ?? '/',
      createdAt: Date.now(),
    };
    runWithOwnershipContext(ctx, next);
  };
}
