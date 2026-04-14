# Performance optimization (2026)

## What changed

| Area | Before | After |
|------|--------|--------|
| **Navigation code-splitting** | `lazyWithRetry` + LRU page cache (already present) | Same; removed unused `renderPage` helper; **Suspense** fallbacks use **`PageRouteSkeleton`** with fixed `min-height` to reduce CLS while chunks load |
| **Data caching** | Ledger paginated loads were manual `useState` + `useEffect` | **TanStack React Query**: `useInfiniteQuery` + count query for native ledger; default **`staleTime` 5m**, **`gcTime` 10m** (`config/queryClient.ts`) |
| **Invoices / reports (API)** | Ad-hoc `fetch` / `apiClient.get` per screen | **`useInvoicesApiListQuery`** (optional, API mode) and **`useOrgUsersQuery`** for marketing report `/users` (cached, no repeat calls on revisit within stale window) |
| **Large tables** | Ledger already used **`VirtualizedLedgerTable`** (`react-window`) | **Vendor → All bills**: debounced search (**300ms**), **`List`** virtualization when row count ≥ **45** |
| **Search** | Ledger already debounced | All bills table search debounced |

## Measuring (LCP / CLS / INP)

1. Build production assets: `npm run build`, serve `dist/` (or run Electron build).
2. Chrome DevTools → **Lighthouse** (desktop + throttled mobile) or **Performance** panel.
3. Compare **before** vs **after** using the same machine, profile, and dataset; record cold load vs repeat navigation to ledger and vendor bills.

**Targets (lab conditions, representative hardware):** LCP &lt; 2.5s, CLS &lt; 0.1, INP &lt; 200ms — require real runs on your data volume; this refactor moves the app in that direction (fewer main-thread table nodes, fewer repeat API/DB hits, stable route placeholders).

## Invalidating cached ledger data

After writes that change transactions, invalidate from app code when needed:

```ts
import { getQueryClient } from '../config/queryClient';
import { queryKeys } from '../hooks/queries/queryKeys';

getQueryClient().invalidateQueries({ queryKey: queryKeys.ledger.all });
```

## Files to know

- `config/queryClient.ts` — QueryClient singleton and default cache times  
- `hooks/queries/queryKeys.ts` — shared keys for ledger / invoices / reports  
- `hooks/usePaginatedTransactions.ts` — ledger infinite + count queries  
- `components/ui/PageRouteSkeleton.tsx` — route-level skeleton  
- `components/vendors/AllBillsTable.tsx` — debounce + virtualization  
