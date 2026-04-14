# Interaction performance (INP)

## Problem

Slow **INP** (Interaction to Next Paint) usually comes from **long tasks on the main thread** right after input: large synchronous search, unbatched `dispatch` + re-renders, and console I/O on the hot path.

## Changes (after)

| Area | Before | After |
|------|--------|--------|
| **Global search (`SearchModal`)** | Ran full entity search on **every keystroke** via `useEffect` + `handleSearch` | **280ms debounced** query; work runs inside **`startTransition`**; **O(1) maps** for accounts/categories/contacts/vendors/contracts; pure builder in `searchModalResults.ts` |
| **Search result rows** | New inline `onClick` closures per row | **`SearchResultButton`** with stable **`handlePick`** wrapped in **`startTransition`** |
| **Header navigation** | `dispatch(SET_PAGE)` on breadcrumb / notifications on the direct click path | **`startNavTransition`** for Home, notification navigations, installment-plan edits, **Clear all** |
| **Org users (`/users`)** | Fetched immediately on auth | Scheduled with **`requestIdleCallback`** (see `scheduleIdleWork` in `utils/interactionScheduling.ts`) |
| **Nav perf logging** | `console.log` synchronously when enabled | Deferred via **`requestIdleCallback`** (`utils/navPerfLogger.ts`) |

## Utilities

- `utils/interactionScheduling.ts` — `scheduleAfterNextPaint`, `scheduleIdleWork`, `cancelScheduledIdle`

## Measuring INP (before vs after)

1. Chrome DevTools → **Performance** → enable **Web Vitals** / record while interacting.
2. Or **Lighthouse** (timespan / user flows where supported).
3. Compare the same flows: open search, type several characters, pick a result; click **Home**; open notifications and **Clear all**.

Lab targets: **INP &lt; 200ms** on mid-range hardware is achievable for these paths when data size is moderate; very large `transactions` arrays can still make the transition-bound search non-trivial—consider server-side search if needed.

## CLS note

Search empty/result areas use **`min-h-[120px]`** so the modal body does not jump height when switching between “typing”, “no results”, and “results”.
