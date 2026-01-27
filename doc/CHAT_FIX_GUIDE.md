# Chat Messaging Fix - Online Users

## Issue Summary
The chat feature was not sending messages to online users in the organization due to a critical bug in the WebSocket client service that caused duplicate listener registration.

## Root Cause
The WebSocket client (`services/websocket/websocketClient.ts`) had a flaw in how it managed event listeners:

### Problem 1: Duplicate Listener Registration on Reconnect
When the WebSocket connection was established or re-established, the `connect` event handler would register all listeners from the internal `listeners` Map. However, it did NOT remove existing listeners first, causing duplicates to accumulate with each reconnection.

**Impact**: Messages could be processed multiple times, or event handlers could conflict with each other, preventing proper message delivery.

### Problem 2: No Duplicate Check in `on()` Method
The `on()` method would add callbacks to the listeners Map without checking if they were already registered. If a component called `wsClient.on('chat:message', handler)` multiple times, the handler would be registered multiple times.

**Impact**: Same message could trigger the handler multiple times, or race conditions could prevent proper message handling.

## Fix Applied

### Change 1: Clear Listeners Before Re-registration
**File**: `services/websocket/websocketClient.ts` (Lines 52-58)

```typescript
// Clear only custom event listeners to prevent duplicates
// Don't remove system listeners like 'connect', 'disconnect', etc.
if (this.socket) {
  this.listeners.forEach((callbacks, event) => {
    this.socket?.removeAllListeners(event);
  });
}
```

This ensures that before registering listeners on reconnect, we remove all existing custom event listeners (but NOT system listeners like 'connect', 'disconnect', etc.).

### Change 2: Prevent Duplicate Callback Registration
**File**: `services/websocket/websocketClient.ts` (Lines 110-114)

```typescript
// Check if this callback is already registered to prevent duplicates
const callbacks = this.listeners.get(event)!;
if (callbacks.has(callback)) {
  return; // Already registered, skip
}
```

This ensures that the same callback function cannot be registered twice for the same event.

## How to Verify the Fix

### Prerequisites
1. Make sure the backend server is running (`npm run dev` in the `server` directory)
2. Make sure the frontend is running (`npm run dev` in the root directory)
3. Have at least 2 user accounts in the same organization

### Testing Steps

#### Step 1: Check WebSocket Connection
1. Open the application in your browser
2. Open Browser Developer Tools (F12)
3. Go to the Console tab
4. Look for: `✅ WebSocket connected`
5. If you see this message, WebSocket is working

#### Step 2: Verify Online Users Detection
1. Log in with User A in one browser/tab
2. Log in with User B in another browser/tab (incognito mode or different browser)
3. In User A's sidebar, you should see "Online Users: 2" (or the count of online users)
4. Click on the "Chat" button in the sidebar

#### Step 3: Send Chat Messages
1. In User A's chat window:
   - You should see User B in the online users list
   - Click on User B's name
   - Type a message and press Send
2. In User B's browser:
   - You should see a notification badge or unread message count
   - Open the chat window
   - You should see User A in the list with an unread indicator
   - Click on User A to view the message

#### Step 4: Test Real-Time Delivery
1. Keep both chat windows open (User A and User B)
2. Send a message from User A
3. The message should appear instantly in User B's chat window (no page refresh needed)
4. Send a reply from User B
5. It should appear instantly in User A's chat window

#### Step 5: Test After Reconnection
1. In User A's browser console, type: `getWebSocketClient().disconnect()`
2. Wait 2 seconds
3. Type: `getWebSocketClient().connect()`
4. Wait for "✅ WebSocket connected" message
5. Send a message from User A to User B
6. Verify it's still delivered properly

### Expected Results
- ✅ Messages are delivered instantly to online users
- ✅ No duplicate messages appear
- ✅ Messages work even after reconnection
- ✅ No console errors related to WebSocket
- ✅ Unread message count updates correctly

### Troubleshooting

#### Messages Still Not Sending
1. **Check Backend Logs**:
   - Look for: `User ${userId} not connected, message will not be delivered`
   - This means the recipient is not actually connected via WebSocket

2. **Check Authentication**:
   - In browser console: `localStorage.getItem('auth_token')`
   - Should return a valid JWT token
   - If null, user is not authenticated

3. **Check WebSocket URL**:
   - File: `services/websocket/websocketClient.ts` (Line 10)
   - Should be: `https://pbookspro-api.onrender.com` (for production)
   - Or your local backend URL for development

4. **Check CORS Configuration**:
   - Backend file: `server/api/index.ts`
   - Make sure frontend URL is in `CORS_ORIGIN` environment variable

#### Multiple Messages Received
- This should be fixed now, but if it still occurs:
  - Clear browser cache
  - Restart the frontend development server
  - Check browser console for duplicate "✅ WebSocket connected" messages

#### WebSocket Not Connecting
1. **Check Backend Server**:
   - Make sure `server` is running: `npm run dev` in server directory
   - Check for: `🔌 WebSocket server initialized` in server logs

2. **Check Network**:
   - In Browser DevTools > Network tab
   - Filter by "WS" (WebSocket)
   - Should see a WebSocket connection to the backend
   - Status should be "101 Switching Protocols" (success)

3. **Check Firewall/Proxy**:
   - Some networks block WebSocket connections
   - Try on a different network if possible

## Technical Details

### Architecture
```
Frontend (Browser)
    ↓
WebSocketClient (services/websocket/websocketClient.ts)
    ↓ socket.io-client
Backend WebSocket Server (server/services/websocketService.ts)
    ↓ socket.io
ChatModal/Sidebar (listen for 'chat:message' events)
```

### Message Flow
1. User A sends message via ChatModal
2. ChatModal calls API: `POST /api/tenants/chat/send`
3. Backend validates recipient exists in same tenant
4. Backend calls `wsService.emitToUser(tenantId, recipientId, 'chat:message', data)`
5. WebSocket server finds all sockets for recipientId
6. WebSocket emits message to those sockets
7. Frontend WebSocketClient receives 'chat:message' event
8. ChatModal/Sidebar event handlers process the message
9. Message is saved locally and displayed in UI

### Key Files Modified
- `services/websocket/websocketClient.ts` - Fixed listener management

### Related Files (Not Modified)
- `components/chat/ChatModal.tsx` - Chat UI
- `components/layout/Sidebar.tsx` - Online users & chat button
- `server/api/routes/tenants.ts` - Chat API endpoint
- `server/services/websocketService.ts` - Backend WebSocket service
- `server/services/websocketHelper.ts` - WebSocket event constants

## Additional Notes

### Chat Messages Storage
- Chat messages are stored **locally only** in IndexedDB
- They are NOT synced to the cloud database
- This is by design for privacy and performance
- Messages are delivered via WebSocket in real-time
- If a user is offline, they will NOT receive messages sent while offline

### Online User Detection
- A user is considered "online" if `login_status = TRUE` in the database
- The `login_status` flag is set when user logs in
- It should be cleared when user logs out (check logout logic)
- Online user count is fetched every 30 seconds in Sidebar

### Security
- WebSocket connections require JWT authentication
- Users can only see/message other users in their organization (tenant)
- Messages are tenant-scoped using Row Level Security

## Next Steps

If the issue persists after this fix:
1. Check if users' `login_status` flag is being set correctly on login
2. Verify WebSocket authentication is working (check backend logs)
3. Test with network tab open to see WebSocket frames
4. Enable verbose logging in WebSocketClient for debugging

## Date Fixed
January 12, 2026
