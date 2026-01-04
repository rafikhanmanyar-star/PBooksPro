# How to Start Admin Portal

## Quick Start

### Step 1: Open a NEW Terminal Window

**Important**: Keep your backend server running in the current terminal, and open a **NEW** terminal window for the admin portal.

### Step 2: Navigate to Admin Folder

```powershell
cd "H:\AntiGravity projects\V1.1.3\MyProjectBooks\admin"
```

### Step 3: Install Dependencies (First Time Only)

```powershell
npm install
```

This only needs to be done once. You'll see it installing React, Vite, and other packages.

### Step 4: Start the Admin Portal

```powershell
npm run dev
```

### Step 5: Wait for "Ready" Message

You should see:
```
VITE v7.x.x  ready in xxx ms

➜  Local:   http://localhost:5174/
➜  Network: use --host to expose
```

### Step 6: Open in Browser

Open: `http://localhost:5174`

---

## Troubleshooting

### Port 5174 Already in Use

If you see "port 5174 is already in use":

**Option 1: Kill the process using port 5174**
```powershell
# Find the process
netstat -ano | findstr :5174

# Kill it (replace PID with the number from above)
taskkill /PID <PID> /F

# Or use this one-liner:
Get-NetTCPConnection -LocalPort 5174 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess | ForEach-Object { Stop-Process -Id $_ -Force }
```

**Option 2: Use a different port**
Edit `admin/vite.config.ts` and change:
```typescript
server: {
  port: 5175,  // Change to different port
}
```

### "npm: command not found"

Make sure Node.js is installed:
```powershell
node --version
npm --version
```

If not installed, download from: https://nodejs.org/

### "Cannot find module" Errors

Reinstall dependencies:
```powershell
cd admin
rm -r node_modules  # Or delete node_modules folder manually
npm install
```

### Admin Portal Shows Blank Page

1. **Check browser console** (F12 → Console tab)
2. **Check Vite terminal** for compilation errors
3. **Hard refresh**: Press `Ctrl + F5`
4. **Clear browser cache**: `Ctrl + Shift + Delete`

### Admin Portal Can't Connect to API

1. **Make sure backend is running** on `http://localhost:3000`
2. **Test API**: Open `http://localhost:3000/health` in browser
3. **Check CORS**: Make sure `server/.env` has:
   ```
   CORS_ORIGIN=http://localhost:5173,http://localhost:5174
   ```

---

## Complete Setup Checklist

- [ ] Backend server running on port 3000
- [ ] Database migration completed (`npm run migrate`)
- [ ] Admin user created (`npm run create-admin`)
- [ ] Admin portal dependencies installed (`npm install` in admin folder)
- [ ] Admin portal running on port 5174 (`npm run dev` in admin folder)
- [ ] Can access `http://localhost:5174` in browser
- [ ] Can login with admin/admin123

---

## Quick Command Reference

```powershell
# Terminal 1: Backend Server
cd "H:\AntiGravity projects\V1.1.3\MyProjectBooks\server"
npm run dev

# Terminal 2: Admin Portal
cd "H:\AntiGravity projects\V1.1.3\MyProjectBooks\admin"
npm run dev
```

Both should be running simultaneously!

