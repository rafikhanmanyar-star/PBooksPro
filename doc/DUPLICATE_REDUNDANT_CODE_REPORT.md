# Duplicate, Redundant, and Unused Code Report

This report identifies duplicate, redundant, and unused code that can be safely removed from the project.

---

## 🔴 CRITICAL: Duplicate WebSocket Client Implementations

### Issue
Two separate WebSocket client implementations exist with different APIs:

1. **`services/websocketClient.ts`** - `WebSocketClient` class
   - Used in: `context/AppContext.tsx` (line 2943)
   - Exports: `WebSocketClient` class, `getWebSocketClient()` function
   - More comprehensive implementation with event handlers

2. **`services/websocket/websocketClient.ts`** - `WebSocketClientService` class  
   - Used in: `components/layout/Sidebar.tsx`, `components/chat/ChatModal.tsx`
   - Exports: `WebSocketClientService` class, `getWebSocketClient()` function
   - Simpler implementation

### Impact
- Code duplication
- Inconsistent API usage across the codebase
- Potential confusion for developers
- Both implementations serve the same purpose

### Recommendation
**Consolidate to one implementation:**
- Keep `services/websocketClient.ts` (more feature-complete)
- Update `Sidebar.tsx` and `ChatModal.tsx` to use `services/websocketClient.ts`
- Remove `services/websocket/websocketClient.ts`
- Update all imports to use the consolidated version

### Files to Update
- `components/layout/Sidebar.tsx` (line 11)
- `components/chat/ChatModal.tsx` (line 7)
- Delete: `services/websocket/websocketClient.ts`

---

## 🟡 DEPRECATED: SyncService.ts

### Issue
**File:** `services/SyncService.ts`

This file is marked as `@deprecated` and contains only placeholder code. The PeerJS-based peer-to-peer synchronization has been replaced with Socket.IO-based real-time synchronization.

### Current State
- File contains only placeholder exports
- Marked as deprecated in comments
- No actual functionality

### Recommendation
**Remove the file entirely** if no imports exist, or verify it's not imported anywhere.

### Verification Result
✅ **VERIFIED:** `SyncService` is NOT imported anywhere in the codebase.
- Only `settingsSyncService` is used (different service)
- `SyncService.ts` exports are never imported
- Safe to delete

---

## 🟡 DEPRECATED: ImportPage.tsx Component

### Issue
**File:** `components/settings/ImportPage.tsx`

This component is marked as `@deprecated` and replaced by `ImportExportWizard`. The import is commented out in `App.tsx` (line 39).

### Current State
- Marked as deprecated in file header
- Import is commented out in `App.tsx`
- File is kept "for reference only"

### Recommendation
**Remove the file** since:
- It's not imported anywhere (commented out)
- Replacement (`ImportExportWizard`) is in use
- Keeping deprecated code adds maintenance burden

### Files to Update
- Delete: `components/settings/ImportPage.tsx`
- Remove commented line in `App.tsx` (line 39): `// const ImportPage = React.lazy(() => import('./components/settings/ImportPage'));`

---

## 🟢 TEST FILES: Potentially Redundant Test Scripts

### Issue
Multiple test files exist that may be redundant or outdated:

#### JavaScript Test Files:
1. `test-console-simple.js` - Simple console test
2. `test-console-direct.js` - Direct console test  
3. `test-pm-cycle-allocations-production.js` - Production test
4. `test-pm-cycle-allocations.js` - Full test
5. `test-pm-cycle-allocations-simple.js` - Simple test
6. `test-pm-cycle-via-react-context.js` - React context test

#### HTML Test Files:
1. `test-runner.html` - Test runner
2. `test-runner-fixed.html` - Fixed test runner
3. `test-staging-connection.html` - Staging connection test

### Recommendation
**Review and consolidate:**
- Keep only the most current/useful test files
- Remove outdated or duplicate test files
- Document which test files are actively maintained

### Action Required
Review each test file to determine:
- Which are actively used
- Which are outdated
- Which can be consolidated

---

## 🟢 UNUSED: Commented Import in App.tsx

### Issue
**File:** `App.tsx` (line 39)

Commented out import for deprecated `ImportPage`:
```typescript
// const ImportPage = React.lazy(() => import('./components/settings/ImportPage'));
```

### Recommendation
**Remove the commented line** since `ImportPage` is deprecated and not used.

---

## 🟢 POTENTIAL: Duplicate Utility Functions

### Issue
Some utility functions may have duplicate implementations across files:

1. **Date Formatting:**
   - `utils/dateUtils.ts` - `formatDate()`, `formatDateTime()`
   - Check if similar functions exist elsewhere

2. **Number Formatting:**
   - `utils/numberUtils.ts` - `formatNumber()`, `formatCurrency()`, `formatRoundedNumber()`
   - Check if similar functions exist elsewhere

3. **Name Normalization:**
   - `services/importSchemas.ts` - `normalizeName()` function
   - `services/importService.ts` - Similar normalization logic
   - Verify if these can be consolidated

### Recommendation
**Review for consolidation:**
- Ensure utility functions are in `utils/` directory
- Remove duplicate implementations
- Import from centralized utilities

---

## 🟢 POTENTIAL: Unused Exports/Imports

### Issue
Some files may export functions that are never imported.

### Recommendation
**Use TypeScript compiler to find unused exports:**
```bash
# Enable in tsconfig.json:
"noUnusedLocals": true,
"noUnusedParameters": true,
```

Or use tools like:
- `ts-prune` - Find unused exports
- `depcheck` - Find unused dependencies

---

## 📋 SUMMARY: Files to Remove

### High Priority (Completed)
1. ✅ `services/websocket/websocketClient.ts` - Removed after consolidating to `services/websocketClient.ts`
2. ✅ `components/settings/ImportPage.tsx` - Removed (deprecated)
3. ✅ `services/SyncService.ts` - Removed (deprecated, no imports)
4. ✅ Commented import in `App.tsx` (line 39) - Removed

### Medium Priority (Partial)
5. ⚠️ Test files - Review and remove outdated ones
   - ✅ Removed HTML test files: `test-runner.html`, `test-runner-fixed.html`, `test-staging-connection.html`

### Low Priority (Review)
6. ✅ Duplicate utility functions - Consolidated name normalization into `utils/stringUtils.ts`
7. 📝 Unused exports - Use tools to identify

---

## 🔧 RECOMMENDED ACTION PLAN

### Phase 1: Safe Removals (Completed)
1. ✅ Removed commented `ImportPage` import from `App.tsx`
2. ✅ Deleted `components/settings/ImportPage.tsx`
3. ✅ Deleted `services/SyncService.ts`

### Phase 2: Consolidation (Completed)
1. ✅ Consolidated WebSocket clients
   - Updated `Sidebar.tsx` and `ChatModal.tsx` to use `services/websocketClient.ts`
   - Deleted `services/websocket/websocketClient.ts`
   - Pending: Test WebSocket functionality

### Phase 3: Cleanup (In Progress)
1. ⚠️ Review and remove redundant test files (HTML files removed)
2. ✅ Consolidated duplicate utility functions (name normalization)
3. ⚠️ Ran `tsc --noEmit --noUnusedLocals --noUnusedParameters` to find unused exports
   - Blocked by many existing type errors (mostly admin UI Lucide types + other TS issues)
   - Unused warnings were reported but mixed with type errors; needs cleanup to get a clean unused-export list

---

## 📊 ESTIMATED IMPACT

- **Files to Delete:** 3-4 files (verified safe)
- **Lines of Code to Remove:** ~700-1000 lines
- **Risk Level:** Low (all marked as deprecated or duplicate)
- **Testing Required:** WebSocket functionality after consolidation

---

## ✅ VERIFICATION CHECKLIST

Before removing files, verify:
- [x] ✅ No imports of `SyncService` exist (VERIFIED)
- [x] ✅ No imports of `ImportPage` exist (VERIFIED - only commented line)
- [ ] WebSocket functionality works with consolidated client
- [ ] Test files are not actively used
- [ ] Backup code if needed for reference

---

**Generated:** $(date)
**Last Updated:** Review before removal
