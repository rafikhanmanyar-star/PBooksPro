# pBooksPro — Electron Auto-Update Implementation Plan

## Overview

Implement a working Electron auto-update feature using `electron-updater` with GitHub Releases as the update source. This allows the desktop app to check for updates, download them, and install them — all from within the app UI.

This plan is based on the successfully working implementation in the MyShop project.

---

## Architecture Summary

```
┌─────────────────────────────────────────────────────────┐
│  GitHub Releases                                        │
│  ┌──────────────┐ ┌───────────┐ ┌────────────────────┐  │
│  │ latest.yml   │ │ .exe/.7z  │ │ .exe.blockmap      │  │
│  └──────┬───────┘ └─────┬─────┘ └─────────┬──────────┘  │
│         │               │                 │              │
└─────────┼───────────────┼─────────────────┼──────────────┘
          │               │                 │
          ▼               ▼                 ▼
┌─────────────────────────────────────────────────────────┐
│  Electron Main Process (main.js)                        │
│  ┌──────────────────────────┐                           │
│  │ electron-updater         │                           │
│  │ • checkForUpdates()      │──── IPC ────┐             │
│  │ • downloadUpdate()       │             │             │
│  │ • quitAndInstall()       │             │             │
│  └──────────────────────────┘             │             │
│                                           ▼             │
│  ┌──────────────────────────┐  ┌────────────────────┐   │
│  │ IPC Handlers             │  │ Preload (bridge)   │   │
│  │ • get-app-version        │  │ contextBridge      │   │
│  │ • check-for-updates      │◄─│ .exposeInMainWorld │   │
│  │ • start-update-download  │  └─────────┬──────────┘   │
│  │ • quit-and-install       │            │              │
│  └──────────────────────────┘            │              │
└──────────────────────────────────────────┼──────────────┘
                                           │
                                           ▼
┌─────────────────────────────────────────────────────────┐
│  Renderer Process (React UI)                            │
│  ┌──────────────────────────────────────┐               │
│  │ Settings / About Page                │               │
│  │ • Show current version               │               │
│  │ • "Check for updates" button         │               │
│  │ • Download progress bar              │               │
│  │ • "Restart to install" button        │               │
│  │ • Status messages (error/up-to-date) │               │
│  └──────────────────────────────────────┘               │
└─────────────────────────────────────────────────────────┘
```

---

## PART 1: Dependencies (package.json)

Ensure the **root** `package.json` has:

**In `dependencies` (NOT devDependencies — it must ship with the packaged app):**

```json
"electron-updater": "^6.3.9"
```

**In `devDependencies`:**

```json
"electron-builder": "^26.7.0",
"electron": "^28.2.0"
```

**Add these npm scripts** (adapt paths to match pBooksPro structure):

```json
"release": "powershell -ExecutionPolicy Bypass -File ./build-and-push.ps1",
"release:minor": "powershell -ExecutionPolicy Bypass -File ./build-and-push.ps1 -BumpType minor",
"release:major": "powershell -ExecutionPolicy Bypass -File ./build-and-push.ps1 -BumpType major"
```

---

## PART 2: electron-builder Configuration

In the electron-builder config (either in `package.json` under `"build"` key, or in a separate `electron-builder.json` file), ensure:

```json
{
  "appId": "com.pbookspro.app",
  "productName": "pBooksPro",
  "publish": {
    "provider": "github"
  },
  "directories": {
    "output": "release"
  },
  "win": {
    "target": ["nsis"]
  },
  "nsis": {
    "oneClick": false,
    "allowToChangeInstallationDirectory": true,
    "shortcutName": "pBooksPro",
    "artifactName": "${productName}-Setup-${version}.${ext}"
  }
}
```

**CRITICAL:** The `"publish": { "provider": "github" }` field is what tells `electron-updater` WHERE to look for updates. Without it, update checking will fail silently or error out.

### Handling Large Installers (>100 MB)

GitHub Releases has a **100 MB per-asset limit** for uploads. Since pBooksPro's installer exceeds this, choose one of these strategies (in order of recommendation):

#### Option A: `nsis-web` target (STRONGLY RECOMMENDED)

Creates a small web installer stub + separate `.7z` resource packages. Auto-update works natively.

```json
{
  "win": {
    "target": ["nsis-web"]
  },
  "nsisWeb": {
    "oneClick": false,
    "allowToChangeInstallationDirectory": true,
    "shortcutName": "pBooksPro",
    "artifactName": "${productName}-WebSetup-${version}.${ext}"
  }
}
```

This produces:
- A small `.exe` web installer (< 5 MB) — well under the limit
- One or more `.7z` resource files — upload ALL to the GitHub Release
- `latest.yml` — upload this too

**Why this is best:**
- Web installer stub is tiny — no upload issues
- `electron-updater` supports it natively — auto-update just works
- Users get smaller initial downloads
- Differential updates work correctly

#### Option B: Maximum compression (try first — simplest change)

Add `"compression": "maximum"` to the electron-builder config:

```json
{
  "compression": "maximum"
}
```

Uses LZMA ultra compression. Build times will be longer but may reduce the installer below 100 MB.

#### Option C: Split and upload (last resort)

Split the installer with 7-Zip, upload parts. **WARNING:** This breaks electron-updater's automatic download flow. See the build script section (Part 6) for implementation details.

### Decision Tree

1. Try **Option B** first (`"compression": "maximum"`) — simplest change
2. If still >100 MB, use **Option A** (`nsis-web` target) — best long-term solution
3. Only use **Option C** (split) as a last resort — breaks auto-update flow

---

## PART 3: Electron Main Process (main.js)

Add/fix these elements in the main process file:

### A) Conditional import of electron-updater (top of file)

```javascript
let autoUpdater = null;
let updateCheckIntervalId = null;
let lastNotifiedUpdateVersion = null;

if (app.isPackaged) {
  try {
    autoUpdater = require('electron-updater').autoUpdater;
  } catch (_) {}
}
```

**IMPORTANT:** Only require `electron-updater` when `app.isPackaged` is true. In dev mode there's no update to find and it will error.

### B) Helper to safely send status to renderer

```javascript
function sendUpdateStatus(...args) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update-status', ...args);
  }
}
```

### C) IPC handler setup function — call AFTER `createWindow()`

```javascript
function setupUpdaterIPC() {
  ipcMain.handle('get-app-version', () => app.getVersion());

  ipcMain.handle('check-for-updates', async () => {
    if (!app.isPackaged || !autoUpdater) {
      sendUpdateStatus({
        status: 'unavailable',
        message: 'Updates only work in the installed app.'
      });
      return;
    }
    try {
      sendUpdateStatus({ status: 'checking' });
      await autoUpdater.checkForUpdates();
    } catch (err) {
      sendUpdateStatus({
        status: 'error',
        message: err && err.message ? err.message : String(err)
      });
    }
  });

  ipcMain.handle('start-update-download', () => {
    if (autoUpdater) return autoUpdater.downloadUpdate();
  });

  ipcMain.handle('quit-and-install', () => {
    if (autoUpdater) autoUpdater.quitAndInstall(false, true);
  });

  if (autoUpdater) {
    autoUpdater.autoDownload = false;

    autoUpdater.on('update-available', (info) => {
      sendUpdateStatus({ status: 'available', version: info.version });
      if (info.version && info.version !== lastNotifiedUpdateVersion) {
        lastNotifiedUpdateVersion = info.version;
        const win = mainWindow && !mainWindow.isDestroyed() ? mainWindow : null;
        dialog.showMessageBox(win, {
          type: 'info',
          title: 'Update available',
          message: `pBooksPro ${info.version} is available.`,
          detail: 'Would you like to download and install it now?',
          buttons: ['Download and install', 'Later'],
          defaultId: 0,
          cancelId: 1,
        }).then(({ response }) => {
          if (response === 0) autoUpdater.downloadUpdate();
        });
      }
    });

    autoUpdater.on('update-not-available', () => {
      sendUpdateStatus({ status: 'not-available' });
    });

    autoUpdater.on('download-progress', (p) => {
      sendUpdateStatus({ status: 'downloading', percent: p.percent });
    });

    autoUpdater.on('update-downloaded', () => {
      sendUpdateStatus({ status: 'downloaded' });
    });

    autoUpdater.on('error', (err) => {
      sendUpdateStatus({
        status: 'error',
        message: err && err.message ? err.message : String(err)
      });
    });
  }
}
```

### D) In `app.whenReady()`, AFTER creating the window

```javascript
createWindow();
setupUpdaterIPC();

if (autoUpdater && app.isPackaged) {
  const oneMinuteMs = 60 * 1000;
  updateCheckIntervalId = setInterval(() => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      autoUpdater.checkForUpdates().catch(() => {});
    }
  }, oneMinuteMs);
}
```

### E) Clean up interval on window close

```javascript
app.on('window-all-closed', () => {
  if (updateCheckIntervalId) {
    clearInterval(updateCheckIntervalId);
    updateCheckIntervalId = null;
  }
  // ... rest of cleanup
  app.quit();
});
```

---

## PART 4: Preload Script (preload.js)

Expose the update API to the renderer via `contextBridge`:

```javascript
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  onUpdateStatus: (callback) => {
    const handler = (_event, ...args) => callback(...args);
    ipcRenderer.on('update-status', handler);
    return () => ipcRenderer.removeListener('update-status', handler);
  },
  startUpdateDownload: () => ipcRenderer.invoke('start-update-download'),
  quitAndInstall: () => ipcRenderer.invoke('quit-and-install'),
});
```

**IMPORTANT:** If a preload script already exists, MERGE these methods into the existing `electronAPI` object rather than replacing it.

---

## PART 5: Renderer UI (Settings/About page — React/TypeScript)

### A) TypeScript global declaration

Put at the top of the component file or in a `.d.ts` file:

```typescript
declare global {
  interface Window {
    electronAPI?: {
      getAppVersion: () => Promise<string>;
      checkForUpdates: () => Promise<void>;
      onUpdateStatus: (cb: (payload: {
        status: string;
        message?: string;
        version?: string;
        percent?: number;
      }) => void) => () => void;
      startUpdateDownload: () => Promise<void>;
      quitAndInstall: () => Promise<void>;
    };
  }
}
```

### B) Component state and effects

```typescript
const [appVersion, setAppVersion] = useState<string | null>(null);
const [updateStatus, setUpdateStatus] = useState<{
  status: string;
  message?: string;
  version?: string;
  percent?: number;
} | null>(null);
const isElectron = typeof window !== 'undefined' && !!window.electronAPI;

useEffect(() => {
  if (!isElectron || !window.electronAPI) return;
  window.electronAPI.getAppVersion().then(setAppVersion);
}, [isElectron]);

useEffect(() => {
  if (!isElectron || !window.electronAPI) return;
  const unsub = window.electronAPI.onUpdateStatus((payload) =>
    setUpdateStatus(payload)
  );
  return unsub;
}, [isElectron]);

const handleCheckForUpdates = useCallback(() => {
  if (!window.electronAPI) return;
  setUpdateStatus({ status: 'checking' });
  window.electronAPI.checkForUpdates();
}, []);

const handleDownloadUpdate = useCallback(() => {
  if (!window.electronAPI) return;
  window.electronAPI.startUpdateDownload();
}, []);

const handleQuitAndInstall = useCallback(() => {
  if (!window.electronAPI) return;
  window.electronAPI.quitAndInstall();
}, []);
```

### C) JSX UI

Place in the Settings or About section. Adapt styling to match pBooksPro's design system:

```tsx
<div>
  <h3>Desktop App</h3>
  {appVersion && (
    <p>Current version: <strong>{appVersion}</strong></p>
  )}
  {isElectron ? (
    <div>
      <button
        onClick={handleCheckForUpdates}
        disabled={
          updateStatus?.status === 'checking' ||
          updateStatus?.status === 'downloading'
        }
      >
        {updateStatus?.status === 'checking' ||
        updateStatus?.status === 'downloading'
          ? 'Checking…'
          : 'Check for updates'}
      </button>

      {updateStatus?.status === 'available' && updateStatus?.version && (
        <div>
          <p>New version {updateStatus.version} available.</p>
          <button onClick={handleDownloadUpdate}>
            Download and install
          </button>
        </div>
      )}

      {updateStatus?.status === 'downloading' && (
        <p>
          Downloading…{' '}
          {updateStatus.percent != null
            ? `${Math.round(updateStatus.percent)}%`
            : ''}
        </p>
      )}

      {updateStatus?.status === 'downloaded' && (
        <div>
          <p>Update ready. Restart the app to install.</p>
          <button onClick={handleQuitAndInstall}>
            Restart to install
          </button>
        </div>
      )}

      {updateStatus?.status === 'not-available' && (
        <p>You're on the latest version.</p>
      )}

      {(updateStatus?.status === 'error' ||
        updateStatus?.status === 'unavailable') &&
        updateStatus?.message && (
          <p style={{ color: 'orange' }}>{updateStatus.message}</p>
        )}
    </div>
  ) : (
    <p>Update check is available in the installed desktop app only.</p>
  )}
</div>
```

---

## PART 6: Build & Release Script (build-and-push.ps1)

Automates: version bump -> build -> git commit/push -> GitHub Release with asset upload.

```powershell
param(
    [ValidateSet("patch", "minor", "major")]
    [string]$BumpType = "patch",
    [string]$Message = "",
    [switch]$SkipRelease
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path

function Bump-Version {
    param([string]$Version, [string]$Type)
    $parts = $Version -split '\.'
    $major = [int]$parts[0]; $minor = [int]$parts[1]; $patch = [int]$parts[2]
    switch ($Type) {
        "major" { $major++; $minor = 0; $patch = 0 }
        "minor" { $minor++; $patch = 0 }
        "patch" { $patch++ }
    }
    return "$major.$minor.$patch"
}

function Update-PackageVersion {
    param([string]$FilePath, [string]$NewVersion)
    $content = Get-Content $FilePath -Raw
    $updated = $content -replace '"version"\s*:\s*"[^"]*"', "`"version`": `"$NewVersion`""
    Set-Content -Path $FilePath -Value $updated -NoNewline
    Write-Host "  Updated $FilePath -> v$NewVersion" -ForegroundColor Cyan
}

# --- Step 1: Version bump ---
Write-Host "[1/5] Incrementing version ($BumpType)..." -ForegroundColor Yellow
$rootPkg = Get-Content "$ProjectRoot\package.json" -Raw | ConvertFrom-Json
$currentVersion = $rootPkg.version
$newVersion = Bump-Version -Version $currentVersion -Type $BumpType
Write-Host "  $currentVersion -> $newVersion" -ForegroundColor Green

# Update ALL package.json files (adapt paths to your project structure)
Update-PackageVersion -FilePath "$ProjectRoot\package.json" -NewVersion $newVersion
# Add more Update-PackageVersion calls for client/server/etc. package.json files

# --- Step 2: Build ---
Write-Host "[2/5] Building..." -ForegroundColor Yellow
Push-Location $ProjectRoot
try {
    # Adapt these build commands to pBooksPro's build process
    npm run build
    npx electron-builder --win  # or: -c electron-builder.json
    if ($LASTEXITCODE -ne 0) { throw "Build failed!" }
} finally { Pop-Location }

# --- Step 3: Git commit ---
Write-Host "[3/5] Committing..." -ForegroundColor Yellow
Push-Location $ProjectRoot
try {
    git add -A
    $status = git status --porcelain
    if (-not [string]::IsNullOrWhiteSpace($status)) {
        $commitMsg = if ([string]::IsNullOrWhiteSpace($Message)) {
            "build: v$newVersion - release build"
        } else { "$Message (v$newVersion)" }
        git commit -m $commitMsg
    }
} finally { Pop-Location }

# --- Step 4: Push ---
Write-Host "[4/5] Pushing..." -ForegroundColor Yellow
Push-Location $ProjectRoot
try {
    git push origin
    if ($LASTEXITCODE -ne 0) { throw "Push failed!" }
} finally { Pop-Location }

# --- Step 5: GitHub Release ---
if (-not $SkipRelease) {
    Write-Host "[5/5] Creating GitHub Release..." -ForegroundColor Yellow

    $ghCmd = Get-Command gh -ErrorAction SilentlyContinue
    if (-not $ghCmd) {
        Write-Host "  GitHub CLI (gh) not installed." -ForegroundColor Red
        Write-Host "  Install: winget install GitHub.cli && gh auth login" -ForegroundColor Cyan
        exit 1
    }

    $tagName = "v$newVersion"
    $installerName = "pBooksPro-Setup-$newVersion.exe"  # adapt to your artifactName
    $installerPath = "$ProjectRoot\release\$installerName"
    $latestYmlPath = "$ProjectRoot\release\latest.yml"
    $blockmapPath = "$installerPath.blockmap"

    # Fallback: find any matching .exe if exact name differs
    if (-not (Test-Path $installerPath)) {
        $fallback = Get-ChildItem "$ProjectRoot\release" -Filter "pBooksPro*.exe" -ErrorAction SilentlyContinue |
            Where-Object { $_.Name -notmatch "unpacked" } |
            Sort-Object LastWriteTime -Descending | Select-Object -First 1
        if ($fallback) { $installerPath = $fallback.FullName }
    }

    if (-not (Test-Path $installerPath)) {
        Write-Host "  Installer not found!" -ForegroundColor Red; exit 1
    }
    if (-not (Test-Path $latestYmlPath)) {
        Write-Host "  latest.yml not found!" -ForegroundColor Red; exit 1
    }

    # --- Handle large installers (>100 MB) ---
    $maxSizeMB = 95
    $installerSizeMB = (Get-Item $installerPath).Length / 1MB

    if ($installerSizeMB -gt $maxSizeMB) {
        Write-Host "  Installer is $([math]::Round($installerSizeMB,1)) MB (exceeds $maxSizeMB MB)." -ForegroundColor Yellow

        # If using nsis-web, upload all .7z parts + web setup exe
        $webSetupParts = Get-ChildItem "$ProjectRoot\release" -Filter "*.7z" -ErrorAction SilentlyContinue
        if ($webSetupParts) {
            Write-Host "  nsis-web artifacts detected. Uploading all parts..." -ForegroundColor Cyan
            $releaseAssets = @($installerPath, $latestYmlPath)
            foreach ($part in $webSetupParts) { $releaseAssets += $part.FullName }
            if (Test-Path $blockmapPath) { $releaseAssets += $blockmapPath }
        } else {
            # Fallback: split with 7-Zip
            Write-Host "  Splitting with 7-Zip..." -ForegroundColor Cyan
            $splitDir = "$ProjectRoot\release\split"
            if (Test-Path $splitDir) { Remove-Item $splitDir -Recurse -Force }
            New-Item -ItemType Directory -Path $splitDir | Out-Null

            $sevenZip = if (Test-Path "C:\Program Files\7-Zip\7z.exe") {
                "C:\Program Files\7-Zip\7z.exe"
            } else { "7z" }

            & $sevenZip a -v"$($maxSizeMB)m" "$splitDir\$($installerName).7z" $installerPath
            if ($LASTEXITCODE -ne 0) { throw "7-Zip split failed!" }

            $splitParts = Get-ChildItem $splitDir -Filter "*.7z.*" | Sort-Object Name

            $reassembleScript = @"
@echo off
echo Reassembling $installerName ...
"C:\Program Files\7-Zip\7z.exe" x "$($installerName).7z.001" -o"."
if %errorlevel% neq 0 (echo ERROR: 7-Zip required. Install from https://7-zip.org & pause & exit /b 1)
echo Done! Run $installerName to install.
pause
"@
            Set-Content "$splitDir\reassemble-installer.bat" $reassembleScript

            $releaseAssets = @("$splitDir\reassemble-installer.bat", $latestYmlPath)
            foreach ($part in $splitParts) { $releaseAssets += $part.FullName }
            if (Test-Path $blockmapPath) { $releaseAssets += $blockmapPath }

            Write-Host "  WARNING: Split mode breaks auto-update. Consider nsis-web instead." -ForegroundColor Yellow
        }
    } else {
        $releaseAssets = @($installerPath, $latestYmlPath)
        if (Test-Path $blockmapPath) { $releaseAssets += $blockmapPath }
    }

    Push-Location $ProjectRoot
    try {
        gh release create $tagName $releaseAssets --title $tagName --notes "pBooksPro v$newVersion"
        if ($LASTEXITCODE -ne 0) { throw "gh release create failed!" }
        Write-Host "  Release $tagName created!" -ForegroundColor Green
    } finally { Pop-Location }
} else {
    Write-Host "[5/5] Skipping release (-SkipRelease)." -ForegroundColor DarkGray
}

Write-Host "`nDone! v$newVersion`n" -ForegroundColor Green
```

---

## Update Status Flow Diagram

```
User clicks               Main Process              GitHub Releases
"Check for updates"
       |
       v
  IPC: check-for-updates
       |
       v
  autoUpdater.checkForUpdates()  ------->  Fetches latest.yml
       |                                        |
       |                              +---------+----------+
       |                              v                    v
       |                        Version matches      Version is newer
       |                              |                    |
       v                              v                    v
  'update-not-available'        'update-available'
       |                              |
       |                    +---------+----------+
       |                    v                    v
       |              User: "Later"       User: "Download"
       |                    |                    |
       |                    |                    v
       |                    |        autoUpdater.downloadUpdate()
       |                    |                    |
       |                    |                    v
       |                    |         'download-progress' (0-100%)
       |                    |                    |
       |                    |                    v
       |                    |           'update-downloaded'
       |                    |                    |
       |                    |                    v
       |                    |         User: "Restart to install"
       |                    |                    |
       |                    |                    v
       |                    |         autoUpdater.quitAndInstall()
       |                    |                    |
       v                    v                    v
  UI shows status     UI dismissed        App restarts with new version
```

---

## Checklist / Common Issues

Before testing, verify each of these:

- [ ] `electron-updater` is in `dependencies` (NOT `devDependencies`)
- [ ] `"publish": { "provider": "github" }` exists in electron-builder config
- [ ] `autoUpdater.autoDownload` is set to `false`
- [ ] `latest.yml` is uploaded to every GitHub Release
- [ ] The `.exe` installer is uploaded to every GitHub Release
- [ ] Preload script exposes all 5 methods via `contextBridge.exposeInMainWorld`
- [ ] `BrowserWindow` has `webPreferences: { nodeIntegration: false, contextIsolation: true, preload: ... }`
- [ ] `app.getVersion()` reads correct version from `package.json`
- [ ] `mainWindow` is checked for `!mainWindow.isDestroyed()` before `.send()`
- [ ] `setupUpdaterIPC()` is called AFTER `createWindow()`
- [ ] GitHub repo is public (or `GH_TOKEN` is configured for private repos)
- [ ] Installer size is handled: if >100 MB, use `nsis-web` target or `"compression": "maximum"`
- [ ] `gh` CLI is installed and authenticated (`gh auth login`)
- [ ] `repository.url` in `package.json` matches the actual GitHub repo

---

## Files to Create / Modify

| File | Action | Purpose |
|------|--------|---------|
| `package.json` | Modify | Add `electron-updater` dep + release scripts |
| `electron-builder.json` (or `package.json` build key) | Modify | Add `publish.provider`, handle >100MB |
| `electron/main.js` (or equivalent) | Modify | Add updater IPC + auto-check logic |
| `electron/preload.js` (or equivalent) | Modify | Expose `electronAPI` via contextBridge |
| Settings/About component (`.tsx`) | Modify | Add version display + update UI |
| `build-and-push.ps1` | Create | Automated release script |

---

## Implementation Order

1. **Dependencies** — Add `electron-updater` to `dependencies` in `package.json`
2. **electron-builder config** — Add `publish.provider: github` and handle large installer size
3. **Main process** — Add conditional import, IPC handlers, auto-updater events, periodic check
4. **Preload script** — Expose the 5 electronAPI methods
5. **Renderer UI** — Add version display, check/download/install buttons, status messages
6. **Build script** — Create `build-and-push.ps1` for automated releases
7. **Test** — Build a release, create GitHub Release, install, verify "Check for updates" works
