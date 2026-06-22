# Connection Pool Analysis Report (Phase 3)

**Environment:** _  
**Date:** _  
**Pool max (PG_POOL_MAX):** _  

---

## Scenarios

Run `npm run perf:cloud:pool -- --scenario <login|dashboard|reports|payroll>` with `PBOOKS_PERF_POOL_SAMPLE=1`.

| Scenario | Peak activeCount | Peak waitingCount | Saturated samples |
|----------|----------------:|------------------:|------------------:|
| Login | | | |
| Dashboard | | | |
| Reports | | | |
| Payroll | | | |

---

## Pool metrics definitions

| Metric | Source |
|--------|--------|
| **activeCount** | `total - idle` (connections in use) |
| **idleCount** | `pool.idleCount` |
| **waitingCount** | `pool.waitingCount` (queued acquires) |

---

## Slow routes under pressure

_From `perf-baseline` poolSamples.slowAcquireRoutes or server logs `[POOL_STALL]`_

| Route | Max request ms | Count ≥1s |
|-------|---------------:|----------:|

---

## Recommendations (deferred until sign-off)

_Do not implement — document investigation leads only._
