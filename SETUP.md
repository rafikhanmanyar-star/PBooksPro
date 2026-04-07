# PBooks Pro – Setup After PC Reset / Fresh Install

Use this guide when setting up the project on a new or reset Windows PC.

---

## 1. Install Node.js (required)

1. Download **Node.js LTS** (20.x or 22.x):  
   https://nodejs.org/
2. Run the installer. Ensure **“Add to PATH”** is checked.
3. Close and reopen PowerShell/terminal, then verify:
   ```powershell
   node --version
   npm --version
   ```

---

## 2. Install project dependencies

From the project root:

```powershell
cd "f:\AntiGravity projects\PBooksPro -Local DB only"
npm install
```

This will:

- Install all npm packages (React, Vite, Electron, better-sqlite3, etc.)
- Run **postinstall**, which rebuilds the **better-sqlite3** native module for Electron

If you see errors about **Visual Studio** or **node-gyp** during `npm install` or when running the app:

- You can try continuing; sometimes prebuilt binaries work.
- If the app fails with `NODE_MODULE_VERSION` or similar when you launch it, install **Visual Studio Build Tools**:
  1. https://visualstudio.microsoft.com/downloads/#build-tools-for-visual-studio-2022  
  2. Install **“Desktop development with C++”**.
  3. Then run: `npm run rebuild:native`

---

## 3. Run the app (local-only, no server)

```powershell
npm run test:local-only
```

This script:

- Sets local-only and Electron build env vars
- Rebuilds native modules (if needed)
- Builds the frontend and launches the Electron app with local SQLite

Data is stored in: `%APPDATA%\pbooks-pro\pbookspro\PBooksPro.db`

---

## Export tenant data to Excel (from Render PostgreSQL)

To export all data for a tenant from the Render PostgreSQL database to an Excel file (e.g. for backup or to import into local DB later):

1. Set the database URL (use `.env` or PowerShell):
   ```powershell
   $env:DATABASE_URL="postgresql://user:password@host/database"
   ```
2. Run:
   ```powershell
   npm run export-tenant-to-excel
   ```
   Or with tenant ID and output path:
   ```powershell
   node scripts/export-tenant-to-excel.cjs "tenant_1767873389330_fce675e2" ./my-export.xlsx
   ```
   Default tenant: `tenant_1767873389330_fce675e2`. Output is written to the project root (or the path you give).

To **import** that tenant’s data into your **local SQLite** DB (direct copy, no Excel step), use:
`npm run copy-tenant-from-production` (see script usage in `scripts/copy-tenant-from-production.cjs`).

---

## Delete Rkbuilders rental data (before re-import)

If you use the **rkbuilders** company DB and need to clear rental agreements and rental invoices (e.g. to fix data and re-import from Excel):

1. **Close the PBooks Pro app** so the DB file is not locked.
2. From the project root run:
   ```powershell
   npm run delete-rkbuilders-rental-data
   ```
   Or with dry-run (only show what would be deleted):
   ```powershell
   node scripts/delete-rkbuilders-rental-agreements-and-invoices.cjs --dry-run
   ```
3. Re-open the app and import your updated rental agreements and rental invoices.

The script uses the DB at `%APPDATA%\pbooks-pro\pbookspro\data\companies\rkbuilders.db` unless you pass a path:  
`node scripts/delete-rkbuilders-rental-agreements-and-invoices.cjs "C:\path\to\rkbuilders.db"`

---

## Quick reference

| Step              | Command / action                                      |
|-------------------|--------------------------------------------------------|
| Install Node.js   | Download from nodejs.org (LTS), add to PATH            |
| Install deps      | `npm install`                                         |
| Run app           | `npm run test:local-only`                             |
| Rebuild native    | `npm run rebuild:native` (if you install Build Tools) |
| Export tenant     | `npm run export-tenant-to-excel` (set `DATABASE_URL`) |

No `.env` file is required for local-only mode; the scripts set the needed variables.
