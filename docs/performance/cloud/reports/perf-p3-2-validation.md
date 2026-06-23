# PERF-P3.2 — Deferred Bundle Deduplication & Empty Slice Stabilization

Generated: 2026-06-23T03:42:49.502Z

## Before vs After

| Behavior | Before PERF-P3.2 | After PERF-P3.2 |
| -------- | ---------------- | --------------- |
| Entity order in URL | `vendors,bills` ≠ `bills,vendors` dedupe keys | Canonical sort → single key |
| Empty slice `vendors=[]` | Treated as unloaded → reload every nav | `loadedSlices` → suppress reload |
| Same bundle, new page group | New in-flight key per group | Session `loadedBundles` + canonical in-flight key |
| Bootstrap hydrated slices | Re-fetched if length 0 | `markDeferredSlicesFromPartial` after init |

## Static implementation checklist

- [x] **services/api/deferredBundleState.ts**
- [x] **hooks/usePageGroupDeferredBootstrap.ts**
- [x] **services/api/appStateApi.ts**
- [x] **context/AppContext.tsx**

## Scenario validation

### Scenario A — Tenant with no vendors

| Step | Expected | Mechanism |
| ---- | -------- | --------- |
| First Project/Accounting visit | Single `GET /state/bulk?entities=bills,vendors` (or subset) | `resolveDeferredMissingEntities` |
| API returns `vendors: []` | `markDeferredBundleLoadSuccess` marks slice + bundle | No length check |
| Subsequent navigation | `emptySliceSuppressions` ++, no network | `isDeferredSliceLoaded(vendors)` |

### Scenario B — Rapid Accounting → Project → Procurement → Accounting

| Step | Expected | Mechanism |
| ---- | -------- | --------- |
| Overlapping same bundle | 1 network request | `dedupeBulkRequest` + `inFlightRef` on canonical bundle |
| Revisit Accounting | Cache hit | `loadedBundles.has("bills,invoices,...")` |

### Scenario C — Mixed ordering `vendors,bills` vs `bills,vendors`

- **Scenario C — canonical keys match**: PASS — bills,vendors === bills,vendors
- **Endpoint canonicalization**: PASS — identical dedupe endpoint for order variants

## Metrics (runtime)

In browser console after navigation:

```javascript
import { getDeferredBundleMetrics } from './services/api/deferredBundleState';
getDeferredBundleMetrics();
// { deferredBundleHits, deferredBundleMisses, emptySliceSuppressions, canonicalizedBundleRequests }
```

Watch `[DEFERRED_BUNDLE]` log lines for canonicalized / suppressed / cache hit events.

## Manual test steps

1. Login to staging; open DevTools Network filtered to `/state/bulk?entities=`
2. Navigate Accounting → Project → Vendors; confirm at most one request per canonical bundle
3. Re-navigate same modules; confirm cache hits in console (`bundle cache hit`)
4. Tenant with zero vendors: one vendor bundle request total per session
