# Local-only build: import / dependency notes

This project is **local-only** (`isLocalOnlyMode()` in `config/apiUrl.ts` always returns `true`). The following summarizes what still imports cloud-era modules and why.

## `getAppStateApiService` / `services/api/appStateApi.ts`

- **Still imported** by: `context/AppContext.tsx` (after cleanup: only if any cloud helper remains), `components/transactions/TransactionForm.tsx`, `components/bills/BillBulkPaymentModal.tsx`, `components/vendors/VendorBillPaymentModal.tsx`, `components/projectManagement/ProjectPMPaymentModal.tsx`, `components/projectManagement/ProjectSettingsPage.tsx`, `components/rentalManagement/RentalSettingsPage.tsx`, `components/settings/AssetsManagement.tsx`, `components/settings/ImportExportWizard.tsx`, and others.
- **Runtime behavior**: Each call site that talks to HTTP is guarded with `if (!isLocalOnlyMode())` or equivalent; the **cloud branch is unreachable** in shipped builds. Local paths use `dispatch` + SQLite persistence.
- **Deletion**: Removing `appStateApi.ts` entirely requires replacing those guarded branches with dispatch-only flows or deleting the `else` blocks. Do that in a follow-up pass after verifying each screen.

## `CloudLoginPage`

- **Imported by**: `App.tsx` only (rendered when `!isAuthenticated && !isLocalOnlyMode()`), which is **never** true in this product. Safe to remove the import and the branch entirely.

## `getSchemaSyncService` / `services/database/schemaSync.ts`

- **Imported by**: `App.tsx` inside `initializeServices`, only when `!isLocalOnlyMode()` — **unreachable**. Import and init block can be removed from `App.tsx`.

## `apiClient` (`services/api/client.ts`)

- Still used by: `AuthContext` (cloud paths, skipped when local-only), `documentUploadService`, `whatsappChatService`, `license`, optional tooling, and **scripts**.
- **Local-only**: Prefer gating with `isLocalOnlyMode()` or direct SQLite/local paths instead of `auth_token` heuristics.

## Payroll

- `services/api/payrollApi.ts` delegates to local `storageService` / DB when `isLocalOnlyMode()` is true; HTTP paths are dead.

## `services/syncQueue` (removed path)

- `context/AppContext.tsx` imports `syncQueueStub` from `services/sync/localOnlyStubs.ts` as `getSyncQueue` so cloud-only init code compiles; in local-only builds that branch does not run.

## `services/database/migration.ts`

- Provides `needsMigration()` / `runAllMigrations()` for the initialization flow. Current implementation is a **no-op** (`needsMigration` → `false`). Extend here if you reintroduce localStorage → SQLite migration.
