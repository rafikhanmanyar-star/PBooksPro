# Setup Guide - SQL Database Migration

## Prerequisites

After migrating to SQL database, ensure the following:

### 1. Install Dependencies

The migration adds `sql.js` as a dependency. Install it if not already installed:

```bash
npm install sql.js
```

### 2. SQL.js WASM Files

SQL.js requires WebAssembly files to function. You have two options:

#### Option A: Use CDN (Recommended for Development)

The database service is configured to use the CDN by default. No additional setup needed.

#### Option B: Use Local Files (Recommended for Production)

1. Download sql.js files:
   ```bash
   npm install sql.js
   ```

2. Copy WASM files to public folder:
   ```bash
   cp node_modules/sql.js/dist/sql-wasm.wasm public/
   ```

3. Update `vite.config.ts` to copy files:
   ```typescript
   import { defineConfig } from 'vite';
   import react from '@vitejs/plugin-react';

   export default defineConfig({
     plugins: [react()],
     publicDir: 'public',
     // Ensure sql.js files are accessible
     assetsInclude: ['**/*.wasm'],
   });
   ```

### 3. First Run

On first run after migration:

1. The app will automatically detect if migration is needed
2. If old localStorage data exists, it will be migrated automatically
3. A backup of old data will be created in localStorage
4. The app will show a loading screen during migration

### 4. Verify Migration

After first run, verify migration:

1. Open browser DevTools
2. Check Console for migration messages
3. Check Application > Local Storage:
   - Should see `finance_db` (SQL database)
   - Should see `migrated_to_sql: "true"`
   - May see backup keys like `finance_app_state_v4_backup_*`

## Troubleshooting

### SQL.js Not Loading

**Error**: "Failed to load sql.js" or "WASM file not found"

**Solution**:
1. Ensure sql.js is installed: `npm install sql.js`
2. For production, copy WASM files to public folder
3. Check network tab for failed requests
4. Verify CDN is accessible (if using CDN)

### Migration Not Running

**Problem**: App doesn't migrate on first load

**Solution**:
1. Clear browser cache and localStorage
2. Manually trigger migration:
   ```javascript
   localStorage.removeItem('migrated_to_sql');
   localStorage.removeItem('finance_db');
   // Reload page
   ```

### Database Errors

**Error**: "Database not initialized"

**Solution**:
- Ensure database service is initialized before use
- Check that sql.js loaded successfully
- Verify browser supports WebAssembly

## Development

### Running in Development

```bash
npm run dev
```

The app will:
1. Initialize database on first load
2. Run migration if needed
3. Use CDN for sql.js (if local files not available)

### Building for Production

```bash
npm run build
```

Ensure:
1. sql.js WASM files are in `public/` folder
2. Files are copied during build
3. Test backup/restore functionality

## Testing Migration

To test migration:

1. **Create test data in old format**:
   ```javascript
   localStorage.setItem('finance_app_state_v4', JSON.stringify({
     version: 4,
     accounts: [{ id: '1', name: 'Test', type: 'Bank', balance: 0 }],
     // ... other data
   }));
   ```

2. **Clear migration flag**:
   ```javascript
   localStorage.removeItem('migrated_to_sql');
   localStorage.removeItem('finance_db');
   ```

3. **Reload app** - Migration should run automatically

4. **Verify data**:
   ```javascript
   // Check database exists
   const db = localStorage.getItem('finance_db');
   console.log('Database exists:', !!db);
   
   // Check migration flag
   const migrated = localStorage.getItem('migrated_to_sql');
   console.log('Migrated:', migrated);
   ```

## Performance

### Database Size

- Small apps: < 1 MB
- Medium apps: 1-5 MB
- Large apps: 5-10 MB

### Optimization

1. **Regular Cleanup**: Remove old backups from localStorage
2. **Data Archiving**: Archive old transactions periodically
3. **Index Usage**: Queries use indexes automatically

## Browser Compatibility

### Supported Browsers

- Chrome/Edge: ✅ Full support
- Firefox: ✅ Full support
- Safari: ✅ Full support (iOS 11+)
- Opera: ✅ Full support

### Requirements

- WebAssembly support
- localStorage support
- Modern JavaScript (ES6+)

## Security

### Data Storage

- Database is stored in browser localStorage
- Data is not encrypted by default
- Consider encryption for sensitive data

### Backup Security

- Backups contain all application data
- Store backups securely
- Don't share backups publicly

## Support

For issues:
1. Check browser console
2. Review migration logs
3. Verify sql.js installation
4. Check localStorage contents
