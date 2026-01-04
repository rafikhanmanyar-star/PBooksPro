# Fix PostgreSQL PATH on Windows

## Problem
PostgreSQL is installed but `psql` command is not recognized. This means PostgreSQL's `bin` folder is not in your system PATH.

## Solution: Add PostgreSQL to PATH

### Method 1: Using GUI (Easiest - Recommended)

1. **Open Environment Variables**
   - Press `Win + X` (or right-click Start button)
   - Click "System"
   - Click "Advanced system settings" (on the right)
   - OR search "Environment Variables" in Windows search

2. **Edit PATH Variable**
   - In "System Properties" window, click "Environment Variables..." button
   - Under "System variables" (bottom section), find and select "Path"
   - Click "Edit..."

3. **Add PostgreSQL Path**
   - Click "New" button
   - Add this path (adjust version number if different):
     ```
     C:\Program Files\PostgreSQL\16\bin
     ```
   - If you have PostgreSQL 15, use:
     ```
     C:\Program Files\PostgreSQL\15\bin
     ```
   - Click "OK" on all windows

4. **Restart PowerShell**
   - Close your current PowerShell window
   - Open a NEW PowerShell window
   - Test: `psql --version`

### Method 2: Using PowerShell (Quick Fix)

Run these commands in PowerShell **as Administrator**:

```powershell
# Check your PostgreSQL version first
# Common locations:
# C:\Program Files\PostgreSQL\16\bin
# C:\Program Files\PostgreSQL\15\bin
# C:\Program Files\PostgreSQL\14\bin

# Add to PATH (replace 16 with your version)
$env:Path += ";C:\Program Files\PostgreSQL\16\bin"

# Verify it's added
$env:Path -split ';' | Select-String "PostgreSQL"

# Test
psql --version
```

**Note:** This only works for the current session. Use Method 1 for permanent fix.

### Method 3: Find Your PostgreSQL Installation

If you're not sure which version you have:

1. **Check Program Files**
   ```powershell
   Get-ChildItem "C:\Program Files\PostgreSQL" | Select-Object Name
   ```

2. **Or check in File Explorer**
   - Open `C:\Program Files\PostgreSQL`
   - See which version folder exists (e.g., `16`, `15`, `14`)

3. **Then add that specific path to PATH**

---

## Verify Installation

After adding to PATH and restarting PowerShell:

```powershell
# Check version
psql --version

# Should show something like:
# psql (PostgreSQL) 16.x
```

---

## Alternative: Use Full Path (Temporary)

If you don't want to modify PATH, you can use the full path:

```powershell
# Connect to PostgreSQL
& "C:\Program Files\PostgreSQL\16\bin\psql.exe" -U postgres

# Create database
& "C:\Program Files\PostgreSQL\16\bin\createdb.exe" -U postgres pbookspro
```

---

## Quick Test Commands

After fixing PATH:

```powershell
# Test PostgreSQL connection
psql -U postgres

# Create database
createdb -U postgres pbookspro

# Connect to database
psql -U postgres -d pbookspro
```

---

## Troubleshooting

### Still not working after adding to PATH?

1. **Make sure you restarted PowerShell** (completely closed and reopened)
2. **Check the path is correct:**
   ```powershell
   Test-Path "C:\Program Files\PostgreSQL\16\bin\psql.exe"
   ```
   Should return `True`

3. **Verify PATH was added:**
   ```powershell
   $env:Path -split ';' | Select-String "PostgreSQL"
   ```

4. **Try refreshing environment:**
   ```powershell
   $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
   ```

### Wrong PostgreSQL version in path?

- Check which version you have:
  ```powershell
  Get-ChildItem "C:\Program Files\PostgreSQL"
  ```
- Update the PATH with the correct version number

---

## Next Steps

Once `psql --version` works:

1. ✅ PostgreSQL is accessible
2. Create database: `createdb -U postgres pbookspro`
3. Update `server/.env` with connection string
4. Run migration: `cd server && npm run migrate`

