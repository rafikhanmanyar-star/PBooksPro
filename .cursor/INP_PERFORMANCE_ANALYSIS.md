# INP (Interaction to Next Paint) Performance Analysis

## Reported Issue
- **Metric**: Interaction to Next Paint (INP)
- **Value**: 14,416 ms (poor)
- **Target**: < 200 ms for good UX

INP measures the delay from a user interaction (click, tap, keypress) until the browser paints the next frame. A 14+ second delay indicates the main thread is blocked for a long time.

---

## Hypotheses (to validate with instrumentation)

### H1: SET_STATE triggers massive synchronous React reconciliation
**Mechanism**: When `refreshFromApi` completes after login, it dispatches `SET_STATE` with the full merged app state (transactions, contacts, invoices, bills, etc.). The reducer does `return { ...state, ...action.payload }`, replacing the entire state. React then re-renders the entire component tree. With hundreds of transactions, contacts, etc., reconciliation can take many seconds.

**Evidence to capture**: Time from `dispatch(SET_STATE)` until reducer return; payload size (entity counts).

### H2: mergeById + state object spread is CPU-heavy on main thread
**Mechanism**: `refreshFromApi` runs `mergeById` for ~20 entity arrays. Each merge creates Maps and iterates. Then `const mergedState = { ...currentState, ...updates }` creates many new object references. With large arrays (e.g., 408 transactions, 341 contacts), this blocks the main thread.

**Evidence to capture**: Time spent in mergeById; time from merge start to dispatch.

### H3: Bidirectional sync runDownstream blocks main thread
**Mechanism**: On login, `runSync` runs upstream then downstream. Downstream loops over `entities` and calls `appStateRepo.upsertEntity()` for each item. If IndexedDB/SQLite operations are synchronous or the loop is tightly coupled to main thread work, this could block.

**Evidence to capture**: Time for upstream vs downstream; number of entities applied.

### H4: loadState() response processing blocks main thread
**Mechanism**: `loadState()` makes 22 parallel API calls. When they resolve, the merge logic and state update run on the main thread. Large JSON payloads (already parsed by fetch) plus merge could cause a long task.

**Evidence to capture**: Time from first API resolve to dispatch; total entity counts received.

### H5: Contention between sync and refreshFromApi
**Mechanism**: Both `bidir.runSync()` and `refreshFromApi()` run when `isAuthenticated` becomes true. They may overlap, causing CPU contention and extending the main-thread block.

**Evidence to capture**: Overlap of runSync and refreshFromApi; which finishes first.

---

## Key Code Paths

1. **AuthContext** (`context/AuthContext.tsx` ~224-227): On login, `bidir.runSync(tenantId)` runs.
2. **AppContext** (`context/AppContext.tsx` ~2745-2751): When `isAuthenticated` becomes true, `refreshFromApi()` runs.
3. **refreshFromApi** (~2659-2730): Calls `loadState()`, merges, dispatches `SET_STATE`.
4. **loadState** (`services/api/appStateApi.ts` ~178): 22 parallel `findAll()` calls.
5. **Reducer** (`context/AppContext.tsx` ~444-445): `SET_STATE` case does `return { ...state, ...action.payload }`.
