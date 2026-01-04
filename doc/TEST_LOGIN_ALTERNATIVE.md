# Alternative Ways to Test Admin Login

## Method 1: Use Browser DevTools Network Tab

1. Open `http://localhost:5174` in browser
2. Press **F12** to open DevTools
3. Go to **Network** tab
4. Try to login with:
   - Username: `admin`
   - Password: `admin123`
5. Look for the request to `/api/admin/auth/login`
6. Click on it to see:
   - **Request** (what was sent)
   - **Response** (what came back)
   - **Status code** (200 = success, 401 = unauthorized, etc.)

## Method 2: Check Browser Console Errors

1. Open `http://localhost:5174`
2. Press **F12** → **Console** tab
3. Try to login
4. Look for any **red error messages**
5. Share the error message you see

## Method 3: Use PowerShell to Test API

Open PowerShell and run:

```powershell
$body = @{
    username = "admin"
    password = "admin123"
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:3000/api/admin/auth/login" -Method Post -Body $body -ContentType "application/json"
```

This will show you the login response directly.

## Method 4: Check What Error You're Getting

When you try to login in the admin portal, what happens?

- Does it show an error message? What does it say?
- Does the page just stay on the login screen?
- Does it show "Signing in..." but never completes?

## Method 5: Verify Backend is Accessible

1. Open a new browser tab
2. Go to: `http://localhost:3000/health`
3. You should see JSON: `{"status":"ok",...}`

If this doesn't work, the backend isn't running.

## Common Issues

### "Invalid credentials"
- Password might be wrong (we just reset it, so should be fine)
- Check if admin user is active in database

### "Failed to fetch" or Network Error
- Backend server not running
- Wrong API URL
- CORS issue

### No response / Loading forever
- Backend server not responding
- Network connection issue

## What to Share

Please tell me:
1. **What error message** you see (if any)
2. **What happens** when you click "Sign In"
3. **Any red errors** in browser console (F12)
4. **Network tab** - status code of the login request

