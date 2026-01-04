# Test Admin Login

## Admin User Status

✅ **Admin user exists and password is correct!**
- Username: `admin`
- Password: `admin123`
- Status: Active
- Role: super_admin

## Test Login Manually

### Option 1: Browser Console (F12)

Open browser console on `http://localhost:5174` and run:

```javascript
// Test login
fetch('http://localhost:3000/api/admin/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    username: 'admin',
    password: 'admin123'
  })
})
  .then(r => r.json())
  .then(data => {
    if (data.token) {
      console.log('✅ Login successful!', data);
      localStorage.setItem('admin_token', data.token);
    } else {
      console.log('❌ Login failed:', data);
    }
  })
  .catch(err => console.error('Error:', err));
```

### Option 2: Check Network Tab

1. Open `http://localhost:5174`
2. Press F12 → Network tab
3. Try to login
4. Look for the `/api/admin/auth/login` request
5. Check:
   - Status code (should be 200)
   - Response body
   - Any CORS errors

### Option 3: Verify Backend is Running

Make sure backend server is running:
```powershell
# Check if port 3000 is listening
netstat -ano | findstr :3000
```

## Common Issues

### Issue 1: CORS Error

If you see CORS error in console:
- Check `server/.env` has: `CORS_ORIGIN=http://localhost:5173,http://localhost:5174`
- Restart backend server after changing .env

### Issue 2: Network Error

If you see "Failed to fetch":
- Backend server not running
- Wrong API URL
- Firewall blocking connection

### Issue 3: 401 Unauthorized

If login returns 401:
- Password might be wrong (run: `npm run reset-admin`)
- Admin user might be inactive
- Database connection issue

## Verify Everything

1. ✅ Backend running: `http://localhost:3000/health`
2. ✅ Admin user exists: `npm run test-admin`
3. ✅ Admin portal running: `http://localhost:5174`
4. ✅ Try login with: admin / admin123

## Still Not Working?

Check browser console (F12) for:
- Network errors
- CORS errors
- API response errors

Share the error message from browser console.

