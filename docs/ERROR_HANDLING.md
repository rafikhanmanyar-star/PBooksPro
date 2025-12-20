# Error Handling & Logging System

## Overview

The application now includes comprehensive error handling and logging capabilities to prevent blank pages and provide better debugging information.

## Components

### 1. Error Logger Service (`services/errorLogger.ts`)

Centralized error logging service that:
- Logs errors to browser console
- Saves errors to SQL database (`error_log` table)
- Stores errors in localStorage as backup
- Provides error statistics and querying

**Usage:**
```typescript
import { getErrorLogger } from './services/errorLogger';

// Log an error
await getErrorLogger().logError(error, {
  errorType: 'custom_error',
  componentStack: 'ComponentName',
  additionalInfo: { key: 'value' }
});

// Get error logs
const logs = getErrorLogger().getLogs(100); // Last 100 errors

// Get statistics
const stats = getErrorLogger().getStatistics();

// Clear logs
await getErrorLogger().clearLogs();
```

### 2. Error Boundary Component (`components/ErrorBoundary.tsx`)

React error boundary that:
- Catches React component errors
- Displays user-friendly error UI
- Logs errors automatically
- Provides recovery options (Try Again, Reload)

**Features:**
- Beautiful error UI with gradient background
- Expandable error details
- Try Again button (resets error state)
- Reload Page button
- Technical details for debugging

### 3. Global Error Handlers

Automatic error handlers for:
- **Unhandled errors**: Catches all JavaScript errors
- **Unhandled promise rejections**: Catches async errors
- **Database errors**: Logs database operation failures
- **Initialization errors**: Logs app startup failures

## Error Types

Errors are categorized by type:

- `react_error_boundary` - React component errors
- `unhandled` - Unhandled JavaScript errors
- `unhandled_promise_rejection` - Async errors
- `database_initialization` - Database setup errors
- `database_load` - Database read errors
- `database_save` - Database write errors
- `initialization` - App initialization errors
- `render_failure` - React render failures

## Error Log Storage

### Database Storage
Errors are stored in the `error_log` table:
- `id` - Auto-increment ID
- `message` - Error message
- `stack` - Error stack trace
- `component_stack` - React component stack
- `timestamp` - When error occurred

### LocalStorage Backup
Last 100 errors are also stored in localStorage as `error_logs` for:
- Access when database is unavailable
- Quick debugging
- Cross-session error tracking

## Error UI

### Error Boundary UI
When a React error occurs, users see:
- Clear error message
- "Try Again" button (resets error state)
- "Reload Page" button
- Expandable technical details
- Link to error log viewer

### Initialization Errors
During app startup, errors show:
- Progress indicator
- Error message
- Option to continue with limited functionality

## Error Recovery

### Automatic Recovery
- Database errors fall back to initial state
- Initialization errors allow app to continue
- Component errors can be reset with "Try Again"

### Manual Recovery
- Reload page button
- Clear error logs option
- Reset error boundary state

## Error Log Viewer

Access error logs in Settings:
- View all errors
- Filter by type
- Search error messages
- View error details
- Clear error logs
- Export error logs

## Best Practices

### For Developers

1. **Always use try-catch** for async operations
2. **Log errors** using error logger service
3. **Provide user feedback** for recoverable errors
4. **Use error boundaries** around major components
5. **Test error scenarios** during development

### Error Logging Example

```typescript
try {
  // Your code
} catch (error) {
  // Log error
  getErrorLogger().logError(error, {
    errorType: 'operation_failed',
    componentStack: 'ComponentName',
    additionalInfo: { operation: 'saveData' }
  });
  
  // Show user-friendly message
  showToast('Failed to save data. Please try again.');
}
```

## Troubleshooting

### Blank White Page

If you see a blank page:

1. **Check browser console** - Look for JavaScript errors
2. **Check error logs** - View error log in Settings
3. **Check network tab** - Verify all resources loaded
4. **Clear cache** - Try clearing browser cache
5. **Check localStorage** - Verify database exists

### Common Errors

**"Database not initialized"**
- Database service failed to initialize
- Check sql.js loading
- Verify WebAssembly support

**"Migration failed"**
- Data migration encountered error
- Check old localStorage data
- Try manual migration

**"Failed to load state"**
- Database read failed
- Check database integrity
- Verify database exists

## Error Statistics

Get error statistics:
```typescript
const stats = getErrorLogger().getStatistics();
// Returns:
// {
//   total: 150,           // Total errors
//   byType: {             // Errors by type
//     'database_load': 10,
//     'react_error_boundary': 5,
//     ...
//   },
//   recent: 5             // Errors in last 24 hours
// }
```

## Error Log Limits

- **Database**: Up to 1000 errors (configurable)
- **LocalStorage**: Last 100 errors
- **In-memory**: Last 1000 errors

Old errors are automatically trimmed to prevent storage issues.

## Security & Privacy

- Error logs may contain sensitive information
- Don't share error logs publicly
- Clear logs before sharing screenshots
- Error logs are stored locally only

## Future Enhancements

Potential improvements:
- Error reporting to remote server
- Error grouping and deduplication
- Error analytics dashboard
- Automatic error recovery
- Error notification system
