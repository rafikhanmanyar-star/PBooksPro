# PBooks Pro – Electron Desktop App & Windows Installer

This guide covers building and distributing the PBooks Pro desktop app for Windows using Electron.

> **Deployment overview:** API, website, and admin deploy automatically to Render on GitHub push. The main app is delivered as a desktop install (Electron), not via web. See [DEPLOYMENT.md](./DEPLOYMENT.md) for the full architecture.

## Prerequisites

- Node.js 18+
- npm 9+

## Windows Build: Symlink Error ("A required privilege is not held")

If `npm run electron:staging` or `electron:production` fails with:

```
ERROR: Cannot create symbolic link : A required privilege is not held by the client
```

The project disables executable signing/editing (`signAndEditExecutable: false`) to avoid this. If you still see it:

1. **Run as Administrator**: Open PowerShell or CMD as Administrator, then run the build.
2. **Enable Developer Mode** (Windows 11): Settings → System → For developers → Developer Mode.
3. **Manual workaround** (no admin): Download https://github.com/electron-userland/electron-builder-binaries/releases/tag/winCodeSign-2.6.0 as ZIP, extract `winCodeSign` folder into `%LOCALAPPDATA%\electron-builder\Cache\winCodeSign\winCodeSign-2.6.0` (skip any symlink errors when extracting).

## Scripts

| Command | Description |
|--------|-------------|
| `npm run electron` | Build and run the app in Electron (uses localhost API) |
| `npm run electron:dev` | Same as above, with DevTools open |
| `npm run electron:pack` | Build and create unpacked app in `release/` (for testing) |
| `npm run electron:production` | Build production installer (connects to api.pbookspro.com) |
| `npm run electron:production:installer` | Build production NSIS installer only |
| `npm run electron:staging` | Build staging installer (connects to staging API only) |
| `npm run electron:staging:installer` | Build staging NSIS installer only |
| `npm run electron:dist` | Alias for `electron:production` |
| `npm run electron:installer` | Alias for `electron:production:installer` |

## API Configuration

The desktop app connects to the PBooks Pro API. **Each build has a fixed API URL** – staging and production builds are completely separate:

- **Production** (`electron:production`, `electron:production:installer`): Uses `https://api.pbookspro.com/api` – production API and database only.
- **Staging** (`electron:staging`, `electron:staging:installer`): Uses `https://pbookspro-api-staging.onrender.com/api` – staging API and database only. Output in `release-staging/`. App name: "PBooks Pro (Staging)" so it can be installed alongside production.
- **Local/dev** (`npm run electron`): Uses `http://localhost:3000/api`. Run the API server separately.

The staging client will **never** connect to production API or database. The production client will **never** connect to staging.

## Building the Windows Installer

1. Install dependencies:
   ```bash
   npm install
   ```

2. Run a full build and create the installer:
   - **Production**: `npm run electron:production:installer` → output in `release/`
   - **Staging**: `npm run electron:staging:installer` → output in `release-staging/`

3. Outputs:
   - **Production** (`release/`): `PBooks Pro Setup 1.1.6.exe`, `PBooks Pro 1.1.6.exe` (portable)
   - **Staging** (`release-staging/`): `PBooks Pro (Staging) Setup 1.1.6.exe`, `PBooks Pro (Staging) 1.1.6.exe` (portable)

## App Icon (Optional)

To use a custom icon for the Windows app (window, taskbar, and built `.exe`):

1. Add an `.ico` file at **`electron/assets/icon.ico`** (multi-size ICO recommended: 16×16, 32×32, 48×48, 256×256).
2. The main process and `package.json` are already configured to use it. Rebuild the app (`npm run electron` or `npm run electron:staging`).
3. See **`electron/assets/README.md`** for how to generate the ICO from `public/icon.svg` or a PNG.

## Architecture

- **Main process** (`electron/main.cjs`): Creates the window, loads the built web app, and runs the SQLite bridge.
- **SQLite bridge** (`electron/sqliteBridge.cjs`): Provides file-based persistence for the local database. Data is stored at `{userData}/pbookspro/finance_sqljs.bin`—no browser storage (OPFS/IndexedDB/localStorage) issues.
- **Preload** (`electron/preload.cjs`): Exposes `electronAPI` and `sqliteBridge` to the renderer.
- **Renderer**: The existing React/Vite app from `dist/`, using sql.js with Electron file storage.

The app uses `file://` to load the built assets, so the Vite build uses `base: './'` when `VITE_ELECTRON_BUILD=true` for correct resolution.

## Inspecting the Local DB in DBeaver

The local SQLite database is stored at:

**Windows (installed app):**
```
%APPDATA%\PBooks Pro\pbookspro\finance_sqljs.bin
```
(e.g. `C:\Users\YourName\AppData\Roaming\PBooks Pro\pbookspro\finance_sqljs.bin`)

**Staging build** (if installed):
```
%APPDATA%\PBooks Pro (Staging)\pbookspro\finance_sqljs.bin
```

**Development** (`npm run electron`):
```
%APPDATA%\pbooks-pro\pbookspro\finance_sqljs.bin
```

### Connect with DBeaver

1. **Close PBooks Pro** so the file is not locked.
2. In DBeaver: **Database** → **New Database Connection** → **SQLite**.
3. **Path**: Browse to the file above (or paste the full path).
4. If DBeaver rejects `.bin`, copy the file to a new location and rename it to `finance_local.db`.
5. Click **Test Connection**, then **Finish**.

You can then browse tables (`accounts`, `contacts`, `transactions`, `invoices`, `sync_metadata`, etc.) alongside your cloud PostgreSQL connections.
