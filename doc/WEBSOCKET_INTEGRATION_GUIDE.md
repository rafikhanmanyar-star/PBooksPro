# WebSocket Real-Time Synchronization Integration Guide

## Overview

The WebSocket implementation provides real-time synchronization for multi-user collaboration within the same tenant. When one user makes changes, all other users in the same organization see the updates immediately.

## Architecture

### Server-Side

1. **WebSocket Service** (`server/services/websocketService.ts`)
   - Manages Socket.IO server instance
   - Handles authentication via JWT
   - Manages tenant-scoped rooms
   - Tracks connected clients

2. **WebSocket Helper** (`server/services/websocketHelper.ts`)
   - Helper function to emit events to tenants
   - Event name constants
   - Easy integration with API routes

3. **Integration with Express** (`server/api/index.ts`)
   - HTTP server created from Express app
   - WebSocket service initialized with HTTP server
   - CORS configuration for WebSocket

### Client-Side

1. **WebSocket Client** (`services/websocketClient.ts`)
   - Socket.IO client connection
   - Event subscription/unsubscription
   - Automatic reconnection
   - Connection state management

## Usage

### Server-Side: Emitting Events

In API routes, emit events after successful operations:

```typescript
import { emitToTenant, WS_EVENTS } from '../../services/websocketHelper.js';

// After creating/updating/deleting a transaction
emitToTenant(req.tenantId!, WS_EVENTS.TRANSACTION_CREATED, {
  transaction: result,
  userId: req.user?.userId,
  username: req.user?.username,
});
```

### Client-Side: Connecting and Handling Events

```typescript
import { getWebSocketClient } from '../services/websocketClient';

// Connect when user logs in
const wsClient = getWebSocketClient();
wsClient.connect(token, tenantId);

// Subscribe to events
const unsubscribe = wsClient.on('transaction:created', (data) => {
  // Handle real-time update
  dispatch({ type: 'ADD_TRANSACTION', payload: data.transaction });
});

// Disconnect when user logs out
wsClient.disconnect();
```

## Integration with AppContext

To integrate with AppContext for automatic state updates:

1. Connect WebSocket when user authenticates
2. Subscribe to relevant events
3. Dispatch actions to update state
4. Disconnect when user logs out

Example integration in AppContext:

```typescript
useEffect(() => {
  if (auth.isAuthenticated && auth.user && auth.tenant) {
    const wsClient = getWebSocketClient();
    const token = apiClient.getToken();
    
    if (token) {
      wsClient.connect(token, auth.tenant.id);
      
      // Subscribe to transaction events
      const unsubs = [
        wsClient.on('transaction:created', (data) => {
          if (!data._isRemote) { // Avoid duplicate updates
            dispatch({ type: 'ADD_TRANSACTION', payload: data.transaction });
          }
        }),
        wsClient.on('transaction:updated', (data) => {
          if (!data._isRemote) {
            dispatch({ type: 'UPDATE_TRANSACTION', payload: data.transaction });
          }
        }),
        wsClient.on('transaction:deleted', (data) => {
          if (!data._isRemote) {
            dispatch({ type: 'DELETE_TRANSACTION', payload: data.transactionId });
          }
        }),
      ];
      
      return () => {
        unsubs.forEach(unsub => unsub());
        wsClient.disconnect();
      };
    }
  }
}, [auth.isAuthenticated, auth.user, auth.tenant]);
```

## Available Events

### Transactions
- `transaction:created`
- `transaction:updated`
- `transaction:deleted`

### Invoices
- `invoice:created`
- `invoice:updated`
- `invoice:deleted`

### Bills
- `bill:created`
- `bill:updated`
- `bill:deleted`

### Contacts
- `contact:created`
- `contact:updated`
- `contact:deleted`

### Projects
- `project:created`
- `project:updated`
- `project:deleted`

### Accounts
- `account:created`
- `account:updated`
- `account:deleted`

### Categories
- `category:created`
- `category:updated`
- `category:deleted`

### Budgets
- `budget:created`
- `budget:updated`
- `budget:deleted`

### User Events
- `user:connected` - User connected to WebSocket
- `user:disconnected` - User disconnected from WebSocket

## Event Data Structure

All events include:
- Entity data (transaction, invoice, etc.)
- `userId` - ID of user who made the change
- `username` - Username of user who made the change
- `timestamp` - ISO timestamp of the event

Example:
```typescript
{
  transaction: { id: '...', type: '...', amount: 100, ... },
  userId: 'user_123',
  username: 'john.doe',
  timestamp: '2024-01-01T12:00:00.000Z'
}
```

## Configuration

### Server Configuration

WebSocket server URL is configured in:
- `server/services/websocketService.ts` - Server initialization
- `server/api/index.ts` - HTTP server and WebSocket integration

### Client Configuration

WebSocket client URL is configured in:
- `services/websocketClient.ts` - `WS_SERVER_URL` constant

Default: `https://pbookspro-api.onrender.com` (same as API base URL)

## Security

- **Authentication**: WebSocket connections require valid JWT token
- **Authorization**: Tenant isolation via tenant-scoped rooms
- **Data Isolation**: Users only receive events from their tenant
- **Token Validation**: Tokens are verified on connection and reconnection

## Troubleshooting

### Connection Issues

1. Check if WebSocket server is running
2. Verify JWT token is valid
3. Check CORS configuration
4. Verify tenant ID is correct

### Events Not Received

1. Verify event is being emitted from server
2. Check event subscription in client
3. Verify tenant ID matches
4. Check browser console for errors

### Disconnection Issues

1. Check network connectivity
2. Verify token hasn't expired
3. Check server logs for errors
4. Verify reconnection settings

## Performance Considerations

- WebSocket connections are lightweight
- Events are only sent to clients in the same tenant
- Automatic reconnection handles network issues
- Event handlers should be efficient to avoid blocking

## Future Enhancements

- Rate limiting for event emissions
- Event batching for high-frequency updates
- Compression for large payloads
- Metrics and monitoring
- Connection pooling optimization

