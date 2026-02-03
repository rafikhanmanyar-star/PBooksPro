# Test Clear Transactions Endpoint

## After Server Redeploys

1. **Check Server Health:**
   - Go to: `https://pbookspro-api.onrender.com/health`
   - Should return: `{ "status": "ok", ... }`

2. **Test Route Registration:**
   You can verify the route is loaded by checking the server logs in Render dashboard.
   The logs should show the route being registered when server starts.

3. **Test from UI:**
   - Login as Admin user
   - Go to Settings > Data Management
   - Click "Clear Transactions" button
   - Modal should open
   - Type "Clear transaction" and confirm
   - Should succeed (no 404 error)

## Common Issues

### If 404 Still Occurs:
1. **Server not redeployed:**
   - Check Render dashboard for deployment status
   - Manually trigger deploy if needed

2. **Build failed:**
   - Check Render build logs for TypeScript errors
   - Verify all imports are correct

3. **Route not imported:**
   - Verify `server/api/index.ts` imports the route correctly
   - Check line 76: `import dataManagementRouter from './routes/data-management.js';`
   - Note the `.js` extension (required for ES modules)

### If Admin Check Fails:
- Verify your user has `role = 'Admin'` in the database
- Check AuthContext is providing user.role correctly

