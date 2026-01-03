# Troubleshooting Admin App - No Response

## Check These Steps

### 1. Verify Vite Server is Running

In the terminal where you ran `npm run dev`, you should see:
```
VITE v7.3.0  ready in 509 ms
➜  Local:   http://localhost:5174/
```

If you don't see this, the server isn't running properly.

### 2. Check Browser Console

1. Open `http://localhost:5174` in your browser
2. Press **F12** to open Developer Tools
3. Go to **Console** tab
4. Look for any red error messages

Common errors:
- **404 errors** - Files not found
- **CORS errors** - API connection issues
- **Module not found** - Missing dependencies

### 3. Check Network Tab

1. Open Developer Tools (F12)
2. Go to **Network** tab
3. Refresh the page (F5)
4. Look for failed requests (red)

### 4. Verify Backend is Running

Make sure the backend server is still running:
- Check terminal where you ran `npm run dev` in the `server` folder
- Should see: `🚀 API server running on port 3000`

### 5. Try These Fixes

#### Fix 1: Clear Browser Cache
- Press `Ctrl + Shift + Delete`
- Clear cached images and files
- Refresh the page

#### Fix 2: Hard Refresh
- Press `Ctrl + F5` or `Ctrl + Shift + R`
- This forces a full page reload

#### Fix 3: Check if Port is Actually Listening
```powershell
netstat -ano | findstr :5174
```
Should show the port is in use.

#### Fix 4: Restart Admin App
1. Stop the admin app (Ctrl+C in terminal)
2. Restart: `npm run dev`
3. Wait for "ready" message
4. Try browser again

#### Fix 5: Check for TypeScript Errors
```powershell
cd admin
npm run build
```
This will show any compilation errors.

### 6. Alternative: Check Vite Output

Look at the terminal where Vite is running. You might see:
- Compilation errors
- Module resolution errors
- TypeScript errors

### 7. Test Direct File Access

Try accessing the Vite dev server directly:
- `http://localhost:5174/src/main.tsx` (should show the file or 404)

### 8. Check Browser Compatibility

Make sure you're using a modern browser:
- Chrome/Edge (recommended)
- Firefox
- Safari

### 9. Try Different Browser

Sometimes browser extensions or settings can block localhost:
- Try a different browser
- Try incognito/private mode

### 10. Check Firewall/Antivirus

Sometimes security software blocks localhost connections:
- Temporarily disable firewall/antivirus
- Or add exception for localhost:5174

## Quick Diagnostic Commands

```powershell
# Check if port is listening
netstat -ano | findstr :5174

# Check if Vite process is running
Get-Process | Where-Object {$_.ProcessName -like "*node*"}

# Check admin app files
cd admin
Get-ChildItem src -Recurse | Select-Object Name
```

## Expected Behavior

When you open `http://localhost:5174`, you should see:
1. **Login page** with username/password fields
2. **No errors** in browser console
3. **Page loads** within 1-2 seconds

If you see a blank page:
- Check browser console (F12) for errors
- Check Network tab for failed requests
- Check Vite terminal for compilation errors

## Still Not Working?

Share:
1. What you see in the browser (blank page? error message?)
2. Any errors from browser console (F12)
3. Any errors from Vite terminal
4. Screenshot if possible

