# DB State Loader / Saver Contract

To avoid races and duplicate inits between AppContext and `useDatabaseState`:

## Saver (single owner of persist)

- **Owner:** `useDatabaseState` is the single owner of writing app state to the database.
- **API:** The hook exposes `saveNow(value?, options?)` so callers can request an immediate flush without bypassing the hook.
- **AppContext** must not call `appStateRepo.saveState(...)` directly for normal or cloud-merge flows. It should call `saveNow(state)` or `saveNow(fullState, { disableSyncQueueing: true })` so the hook remains the only code path that persists.

## Loader

- **Initial load:** The hook loads state from the DB on mount (effect with `loadState()`). AppContext’s offline init path also explicitly calls `appStateRepo.loadState()` and `setStoredState(loadedState)` so that `isInitializing` is set to false only after state is in React (no “DB ready but state not yet loaded” flash).
- **Cloud / tenant switch:** AppContext loads from API, merges, calls `setStoredState(fullState)` then `await saveNow(fullState, { disableSyncQueueing: true })` so a single write runs and no debounced save can overwrite with stale state.

## Rules

1. Only the hook (or code paths it exposes via `saveNow`) should call `appStateRepo.saveState(...)` for the main app state key.
2. AppContext may call `appStateRepo.loadState()` for offline init or migration; it should then set state via `setStoredState` and use `saveNow` for any subsequent persist.
3. Do not fire-and-forget `saveState` from AppContext; always go through the hook’s `saveNow` so ordering and debounce are consistent.
