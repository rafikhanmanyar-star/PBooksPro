# PERF-P3.1 — Deferred Bundle 503 Investigation

Generated: 2026-06-23T03:39:07.789Z

> Evidence-only investigation. No application behavior changes.

## Section 1 — Deferred Bundle Failure Timeline

Representative client-side sequence (from code paths + ATP-class incidents):

```
T+0s    Login primary bootstrap completes (chunked offset=0)
        → invoices, bills, contacts loaded in static chunk
        → vendors NOT in static chunk (BULK_DEFERRED_ENTITIES)
T+2s    User opens Accounting / Project / Procurement
        → usePageGroupDeferredBootstrap passes gate (primary idle/healthy)
        → GET /state/bulk?entities=invoices,bills OR bills,vendors
T+2s    Concurrent dashboard metrics / socket refresh / other API holds pool
T+2s    shedIfPoolSaturated: idle=0 waiting≥12 → 503 POOL_SATURATED (no handler run)
T+2s    Client withBulkLoadResilience retries (up to 3×, shared backoff)
T+5s    Overlay stays hidden (PERF-P3 soft failure) but Network tab shows 503
```

**Live capture:** paste `scripts/perf/deferred-bundle-probe.browser.js` in DevTools, reproduce nav, export JSON.
**Server timeline:** grep Render logs for `[BULK_STATE_ERROR] ... entities=bills,vendors` and matching `pool={...}`.

## Section 2 — Coordinator Coverage

| Request | Coordinator Attached? | Detail |
|---------|----------------------|--------|
| `GET /state/bulk?entities=bills,vendors` | Gate: **Yes**; Primary: **No** | Yes — dedupeBulkRequest on exact endpoint string; Partial — label loadStateBulk shared across all entity bundles |
| `GET /state/bulk?entities=invoices,bills` | Gate: **Yes**; Primary: **No** | Yes — dedupeBulkRequest on exact endpoint string; Partial — label loadStateBulk shared across all entity bundles |

### Coordinator call chain (deferred path)

1. `awaitDeferredBootstrapGate()` — Wait if primary bootstrap running; suppress if unhealthy (`hooks/usePageGroupDeferredBootstrap.ts`)
2. `getAppStateApiService().loadStateBulk(stillMissing.join(","))` — Deferred bundle HTTP — NOT runPrimaryBootstrap (`hooks/usePageGroupDeferredBootstrap.ts`)
3. `dedupeBulkRequest(tenantId, endpoint, ...)` — Identical tenant+endpoint shares one in-flight promise (`services/api/appStateApi.ts loadStateBulk`)
4. `withCoalescedBulkRetry(tenantId, "loadStateBulk", ...)` — Same retry label for ALL deferred bundles (coarse coalesce) (`services/api/appStateApi.ts`)
5. `withBulkLoadResilienceImpl → awaitSharedBackoff` — Shared backoff per tenant across bulk loaders (`services/api/appStateApi.ts`)

**Conclusion:** Deferred bundles participate in PERF-P3 **gate + dedupe + retry/backoff**, but **not** in `runPrimaryBootstrap`. They remain legitimate, post-login pool consumers.

## Section 3 — Deduplication Coverage

| Bundle | Dedupe Hit? | Condition |
| ------ | ----------- | --------- |
| `invoices,bills` | **Hit** only while identical in-flight | Same tenant+endpoint key |
| `invoices,bills` | **Miss** | Sequential nav after prior request finished or failed |
| `bills,vendors` | **Miss** vs `vendors,bills` | VENDORS group order differs from PROJECT group |
| `bills,vendors` | **Hit** | Same group re-entry while first request in-flight |

### Page groups that emit target bundles

- **`bills,vendors`**: TRANSACTIONS, PROJECT, ACCOUNTING
  - Also emitted as 'vendors,bills' from VENDORS group → separate dedupe key, dedupe MISS
- **`invoices,bills`**: DASHBOARD, TRANSACTIONS, RENTAL, ACCOUNTING
  - Stable 'invoices,bills' when only those two missing across DASHBOARD/RENTAL/ACCOUNTING

### Dedupe scenario matrix

| Scenario | Bundle | Dedupe Hit? |
| -------- | ------ | ----------- |
| Two tabs same bundle concurrently | `invoices,bills` | Yes — same key |
| Nav PROJECT then VENDORS (bills+vendors missing) | `bills,vendors vs vendors,bills` | No — entity order differs in query string |
| Sequential nav after prior 503 failed | `invoices,bills` | No — prior promise rejected; map entry cleared in finally |
| DASHBOARD then RENTAL (only invoices+bills missing) | `invoices,bills` | Yes if overlapping in-flight; else miss after first completes |

## Section 4 — Pool State During 503

Server logs at shed (already instrumented in `stateRoutes.ts`):

```
[POOL_SHED] route=GET /state/bulk -> 503 (idle=0 waiting=N total=20)
[BULK_STATE_ERROR] ... entities=bills,vendors pool={total:20,idle:0,waiting:N}
```

| Route | Idle | Waiting | Meaning |
| ----- | ---- | ------- | ------- |
| `GET /state/bulk?entities=bills,vendors` | **0** | **≥12** (default) | Fast-fail shed before `getBulkAppState` runs |
| `GET /state/bulk?entities=invoices,bills` | **0** | **≥12** | Same shed path |

**Typical timing vs bootstrap:** Failures occur **after** primary bootstrap completes — deferred nav while pool already busy (dashboard queries, incremental sync, multi-user).

| Time (relative) | Metrics (client `getBootstrapCoordinator().getMetrics()`) |
| --------------- | -------------------------------------------------------- |
| Primary bootstrap running | `activeBootstraps≥1`, deferred `suppressedDeferredBootstraps` increments |
| Primary complete, user navigates | `activeBootstraps` stable; deferred fires; `deduplicatedBulkRequests` only on overlap |
| 503 on deferred bundle | `coalescedRetries` may increment; primary metrics unchanged |

## Section 5 — Root Cause

### Why do `bills,vendors` and `invoices,bills` still produce intermittent 503 after PERF-P3?

1. **PERF-P3 scope was primary bootstrap amplification**, not elimination of deferred on-demand loads. Deferred `loadStateBulk` is still issued after login when page groups need slices with `length === 0`.

2. **`vendors` is intentionally deferred server-side** (`BULK_DEFERRED_ENTITIES`). Any Project / Procurement / Accounting navigation that needs vendors triggers `bills,vendors` or `vendors,bills` bundles — expected post-login traffic.

3. **`invoices,bills` deferred requests** fire when those slices appear empty — including tenants with **zero rows** (empty array still passes `length === 0`), partial bootstrap after soft failure, or navigation before static chunk merge visible in React state.

4. **Dedupe is exact-string on endpoint** (`tenantId|/state/bulk?entities=…`). `bills,vendors` ≠ `vendors,bills`; sequential nav after completion = miss; 503 retry cycles re-open new network work.

5. **Each deferred bundle still uses guarded bulk loaders** (up to 6 parallel pool connections + global 8 bootstrap slots). Under multi-tab / dashboard / socket refresh load, `idle=0` and `waiting≥12` triggers **POOL_SATURATED** shed — by design to avoid 524s.

6. **503 retries (3×)** keep intermittent failures visible in DevTools even though PERF-P3 **overlay recovery** prevents UI blocking.

### Empty-slice re-fetch loop (amplifies intermittent 503)

```typescript
missing = needed.filter(key => lengths[key] === 0)
// Zero-row tenant (empty bills/invoices arrays) still counts as missing → deferred bundle fires on every page visit
// catch {} clears inFlightRef → next navigation re-issues same bundle
```

## Appendix — Investigation probes

- Browser: `scripts/perf/deferred-bundle-probe.browser.js` (console paste, export JSON)
- Re-run static analysis: `node scripts/perf/perf-p3-1-deferred-bundle-investigation.mjs`
