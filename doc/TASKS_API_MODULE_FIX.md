# Tasks API Module Import Fix

## Issue
Build error on Render deployment:
```
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/opt/render/project/src/server/dist/services/databaseService' 
imported from /opt/render/project/src/server/dist/services/taskNotificationService.js
```

## Root Cause
ES modules require explicit file extensions (`.js`) in import statements. The task service files were missing the `.js` extension in their imports.

## Fix Applied

### 1. `server/services/taskNotificationService.ts`
**Before:**
```typescript
import { getDatabaseService } from './databaseService';
import { getWebSocketService } from './websocketService';
import { WS_EVENTS } from './websocketHelper';
```

**After:**
```typescript
import { getDatabaseService } from './databaseService.js';
import { getWebSocketService } from './websocketService.js';
import { WS_EVENTS } from './websocketHelper.js';
```

### 2. `server/services/taskPerformanceService.ts`
**Before:**
```typescript
import { getDatabaseService } from './databaseService';
```

**After:**
```typescript
import { getDatabaseService } from './databaseService.js';
```

## Verification

✅ **TypeScript Build**: `npm run build` succeeds without errors
✅ **Linter**: No linter errors found
✅ **Import Consistency**: All imports now match the pattern used by other service files

## Files Modified

- `server/services/taskNotificationService.ts` - Added `.js` extensions to all imports
- `server/services/taskPerformanceService.ts` - Added `.js` extension to import

## Next Steps

1. Commit the changes:
   ```bash
   git add server/services/taskNotificationService.ts server/services/taskPerformanceService.ts
   git commit -m "Fix: Add .js extensions to ES module imports in task services"
   ```

2. Push and redeploy:
   ```bash
   git push origin <your-branch>
   ```

3. The Render deployment should now succeed without module resolution errors.

---

**Note**: This is a common issue when using ES modules in Node.js. All relative imports must include the `.js` extension, even when importing TypeScript files (the extension refers to the compiled output).
