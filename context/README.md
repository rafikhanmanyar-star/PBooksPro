# App state architecture (C6)

PBooksPro centralizes client state in a Redux-style reducer. **C6** splits the former monolithic `AppContext.tsx` into focused modules so changes are safer and selective subscriptions are easier to adopt.

## Module layout

| Module | Role |
|--------|------|
| `appInitialState.ts` | Default `AppState`, system accounts/categories, invoice HTML template |
| `appStateStore.ts` | Module-level store for `useSyncExternalStore` selective hooks |
| `appRepositoryLoader.ts` | Lazy `AppStateRepository` import (avoids init cycles) |
| `reducers/appReducerEffects.ts` | Pure helpers: transaction side-effects, contract status, audit log entries |
| `reducers/appReducer.ts` | Main `appReducer(state, action)` switch |
| `reducers/appStateMerge.ts` | Server baseline merge helpers for sync/refresh |
| `AppContext.tsx` | Provider: init, persistence, API sync, socket, dispatch wrapper |
| `domains/*.ts` | Bundled selective hooks (`useFinanceDomain`, `useRentalDomain`, …) |

## Consumption patterns

1. **Legacy (wide re-renders):** `useAppContext()` — still supported; 160+ components use it.
2. **Selective slices:** `useStateSelector`, `useTransactions`, etc. in `hooks/useSelectiveState.ts`.
3. **Domain bundles (recommended for new code):**

```tsx
import { useFinanceDomain } from '../context/domains';

function MyScreen() {
  const { transactions, bills, dispatch } = useFinanceDomain();
  // ...
}
```

## Migration guidance

- Prefer `useFinanceDomain` / `useRentalDomain` when a screen touches one business area.
- Use `useDispatchOnly()` when a component only dispatches and never reads state.
- Do not duplicate server-fetched report data in AppContext when React Query hooks exist (`modules/project-profitability`, etc.).

## Provider responsibilities (stay in AppContext)

- SQLite / API hydration and `saveNow` persistence
- Realtime socket merge and optimistic API writes
- Payroll payslip sync side-effects after transaction actions
- Initialization / error screens

Pure state transitions belong in `reducers/`; I/O belongs in the provider.
