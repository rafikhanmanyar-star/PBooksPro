# Native Database Backend Usage Guide

## Overview

The application now supports a high-performance native SQLite backend using `better-sqlite3` in the Electron main process. This provides significant performance improvements for large datasets (3000+ transactions).

## Architecture

- **Native Backend**: `better-sqlite3` in Electron main process (`electron/db.cjs`)
- **IPC Communication**: Renderer process communicates via IPC (`electron/main.cjs`, `electron/preload.cjs`)
- **Service Layer**: `services/database/nativeDatabaseService.ts` wraps IPC calls
- **Repository Layer**: `TransactionsRepository` supports both native and sql.js backends

## Feature Flag

The native backend is **automatically enabled** if available. To disable it:

```javascript
// In browser console or app settings
localStorage.setItem('useNativeDatabase', 'false');
```

To re-enable:
```javascript
localStorage.setItem('useNativeDatabase', 'true');
```

## Usage

### Option 1: Use Paginated Hook (Recommended for Large Datasets)

```typescript
import { useNativeTransactions } from '../hooks/useNativeTransactions';

function MyComponent() {
  const { 
    transactions, 
    isLoading, 
    hasMore, 
    loadMore,
    isNativeEnabled 
  } = useNativeTransactions({
    projectId: 'project-123',
    pageSize: 100,
    enabled: true
  });

  return (
    <div>
      {isNativeEnabled && <p>✅ Using native backend</p>}
      {transactions.map(tx => (
        <div key={tx.id}>{tx.description}</div>
      ))}
      {hasMore && (
        <button onClick={loadMore}>Load More</button>
      )}
    </div>
  );
}
```

### Option 2: Use Repository Directly

```typescript
import { TransactionsRepository } from '../services/database/repositories';

const repo = new TransactionsRepository();

// Check if native is enabled
if (repo.isNativeEnabled()) {
  // Use paginated queries
  const page1 = await repo.findAllPaginated({ 
    projectId: 'project-123',
    limit: 100,
    offset: 0 
  });
  
  // Get totals
  const totals = await repo.getTotals({ projectId: 'project-123' });
} else {
  // Falls back to sql.js (loads all)
  const all = repo.findAll();
}
```

### Option 3: Use Native Service Directly

```typescript
import { getNativeDatabaseService } from '../services/database/nativeDatabaseService';

const nativeService = getNativeDatabaseService();

if (nativeService.isNativeAvailable()) {
  const transactions = await nativeService.listTransactions({
    projectId: 'project-123',
    limit: 100,
    offset: 0
  });
  
  const totals = await nativeService.getTotals({ projectId: 'project-123' });
}
```

## Migration Status

### ✅ Completed
- Native database schema (matches sql.js schema)
- IPC handlers for transactions
- Service layer for native backend
- Repository support for native backend
- Pagination hooks

### 🔄 Current Behavior
- **Initial Load**: Still uses sql.js (loads all transactions into state)
- **Components**: Can optionally use `useNativeTransactions` hook for paginated access
- **Backward Compatible**: Falls back to sql.js if native backend unavailable

### 🚧 Future Improvements
- Migrate initial load to use native backend with pagination
- Add data migration from sql.js to native database
- Implement write operations via native backend
- Add more IPC methods (count, search, filters)

## Performance Benefits

- **Faster Queries**: Native SQLite is 10-100x faster than sql.js
- **Lower Memory**: Only loads visible data (pagination)
- **Better Indexing**: Native indexes are more efficient
- **WAL Mode**: Write-Ahead Logging for better concurrent performance

## Testing

1. **Enable Native Backend**:
   ```javascript
   localStorage.setItem('useNativeDatabase', 'true');
   ```

2. **Check Console**: Look for `✅ Native database service available`

3. **Test Pagination**: Use `useNativeTransactions` hook in a component

4. **Monitor Performance**: Check browser DevTools Performance tab

## Troubleshooting

### Native Backend Not Available
- Check that Electron is running (not browser)
- Verify `electronAPI` is exposed in window
- Check console for error messages

### Data Not Showing
- Native database may be empty (needs migration from sql.js)
- Check that `native_finance_db.sqlite` exists in userData directory
- Verify IPC handlers are registered in `electron/main.cjs`

### Performance Issues
- Ensure indexes are created (check `electron/db.cjs`)
- Use pagination instead of loading all data
- Check WAL mode is enabled

