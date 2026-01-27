# Test Staging API Directly (Without CORS Issues)

The HTML test file may show "Failed to fetch" due to CORS when opened locally. Use these methods instead:

## Method 1: Test Directly in Browser (Easiest)

Just open these URLs directly in your browser:

### Health Check
```
https://pbookspro-api-staging.onrender.com/health
```

**Expected response:**
```json
{
  "status": "ok",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "database": "connected"
}
```

### Version Info
```
https://pbookspro-api-staging.onrender.com/api/app-info/version
```

**Expected response:**
```json
{
  "version": "1.1.2",
  "buildDate": "...",
  "environment": "staging"
}
```

### Root Endpoint
```
https://pbookspro-api-staging.onrender.com/
```

---

## Method 2: PowerShell (Windows)

Open PowerShell and run:

```powershell
# Test health endpoint
$health = Invoke-RestMethod -Uri "https://pbookspro-api-staging.onrender.com/health"
Write-Host "Status: $($health.status)"
Write-Host "Database: $($health.database)"

# Test version endpoint
$version = Invoke-RestMethod -Uri "https://pbookspro-api-staging.onrender.com/api/app-info/version"
Write-Host "Version: $($version.version)"
Write-Host "Environment: $($version.environment)"
```

---

## Method 3: curl (if installed)

```bash
# Health check
curl https://pbookspro-api-staging.onrender.com/health

# Version info
curl https://pbookspro-api-staging.onrender.com/api/app-info/version
```

---

## Method 4: Check Render Dashboard Logs

1. Go to Render Dashboard
2. Click on `pbookspro-api-staging` service
3. Go to "Logs" tab
4. Look for:
   - `✅ Connected to PostgreSQL database`
   - `✅ Database migrations completed successfully`
   - `==> Your service is live 🎉`

---

## What "Failed to fetch" Means

### If HTML file shows "Failed to fetch":

**Reason**: Browser blocks CORS requests when opening HTML files locally (file:// protocol)

**Solutions**:
1. ✅ **Open URL directly in browser** (Method 1 above)
2. ✅ **Use PowerShell/curl** (Method 2/3 above)
3. ✅ **Check Render Dashboard** for actual status

### If direct URL access also fails:

**Possible causes**:
1. **Service is sleeping** (Render free tier)
   - First request may take 30-60 seconds
   - Wait for response or check logs

2. **Service is down**
   - Check Render Dashboard
   - Service status should be "Active"

3. **Wrong URL**
   - Verify: `https://pbookspro-api-staging.onrender.com`
   - Check Render Dashboard for correct URL

---

## Quick Verification Steps

1. ✅ **Open health URL in browser**: `https://pbookspro-api-staging.onrender.com/health`
2. ✅ **Check response**: Should show `"database": "connected"`
3. ✅ **If database shows "connected"**: ✅ Database connection is working!
4. ✅ **If database shows "disconnected"**: Check DATABASE_URL in Render Dashboard

---

## Expected Results

### ✅ Working:
```json
{
  "status": "ok",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "database": "connected"
}
```

### ❌ Not Working:
```json
{
  "status": "ok",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "database": "disconnected"
}
```

If database shows "disconnected", the DATABASE_URL might not be set correctly in Render Dashboard.
