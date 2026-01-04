# Fix "Port Already in Use" Error

## Quick Fix

If you get `EADDRINUSE: address already in use :::3000`, it means another process is using port 3000.

### Option 1: Kill the Process (Recommended)

**Windows PowerShell:**
```powershell
# Find the process using port 3000
netstat -ano | findstr :3000

# Kill the process (replace PID with the number from above)
taskkill /PID <PID> /F

# Example:
taskkill /PID 7376 /F
```

**Or use a single command:**
```powershell
# Kill process on port 3000
Get-NetTCPConnection -LocalPort 3000 | Select-Object -ExpandProperty OwningProcess | ForEach-Object { Stop-Process -Id $_ -Force }
```

### Option 2: Change the Port

Edit `server/.env` and change the port:
```env
PORT=3001
```

Then restart the server.

### Option 3: Find What's Using the Port

```powershell
# See what process is using port 3000
netstat -ano | findstr :3000

# Get process details
Get-Process -Id <PID>
```

## Common Causes

1. **Previous server instance still running** - Most common
2. **Another application using port 3000**
3. **Multiple terminal windows with server running**

## Prevention

Always stop the server properly:
- Press `Ctrl+C` in the terminal running the server
- Or close the terminal window

## Quick Command Reference

```powershell
# Kill process on port 3000 (one-liner)
Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess | ForEach-Object { Stop-Process -Id $_ -Force }

# Check if port is free
netstat -ano | findstr :3000
# If no output, port is free
```

