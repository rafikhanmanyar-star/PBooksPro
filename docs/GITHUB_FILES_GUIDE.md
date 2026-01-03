# GitHub Files Guide - Update Server & Releases

This guide explains what files are necessary to push to GitHub for the update server and release folders.

## Update Server Folder (`update-server/`)

### Required Files to Commit to GitHub:

1. **`server.cjs`** - Main server file (REQUIRED)
   - Handles HTTP requests for updates
   - Proxies files from GitHub Releases if not found locally

2. **`package.json`** - Node.js configuration (REQUIRED)
   - Defines dependencies and scripts
   - Used for deployment (Render, etc.)

3. **`releases/latest.yml`** - Update metadata (REQUIRED)
   - **CRITICAL**: This file tells electron-updater what version is available
   - Must be updated each time you release a new version
   - Contains version number, file URLs, checksums, and release date
   - Example content:
     ```yaml
     version: 1.0.8
     files:
       - url: PBooksPro Setup 1.0.8.exe
         sha512: [checksum]
         size: [file size]
     path: PBooksPro Setup 1.0.8.exe
     sha512: [checksum]
     releaseDate: '2025-12-20T13:31:35.489Z'
     ```

4. **`releases/*.exe.blockmap`** - Differential update files (RECOMMENDED)
   - Enables faster incremental updates
   - One file per .exe installer
   - Example: `PBooksPro Setup 1.0.8.exe.blockmap`

5. **`render.yaml`** - Deployment configuration (REQUIRED if deploying to Render)
   - Configures cloud deployment settings

6. **`README.md`** - Documentation (OPTIONAL but recommended)
   - Explains how to use the update server

7. **`start-server.bat`** - Windows convenience script (OPTIONAL)
   - Makes it easier to start the server locally on Windows
   - Simply runs `node server.cjs` with a nice window
   - **Can be kept or removed** - your choice
   - Cloud deployments don't use it (they run `node server.cjs` directly)
   - Harmless to keep in GitHub, helpful for Windows developers

### Files NOT to Commit:

- **`releases/*.exe`** - Installer files (DO NOT COMMIT)
  - These are too large for Git (typically 100+ MB)
  - Should be uploaded to GitHub Releases instead
  - The server proxies these from GitHub Releases when needed

### Recommended .gitignore entries for update-server:

```gitignore
# Large installer files (upload to GitHub Releases instead)
*.exe
*.dmg
*.AppImage
*.deb
*.rpm

# Keep these files:
!releases/latest.yml
!releases/*.blockmap

# Node modules
node_modules/
npm-debug.log

# Environment variables
.env
```

## Release Folder (Main Project Build Output)

### Files Generated During Build:

When you run `npm run electron:build:win`, electron-builder creates files in the output directory (configured in package.json as `C:/MyProjectsProBuild/release` or locally as `release/`):

1. **`PBooksPro Setup X.X.X.exe`** - Windows installer (100+ MB)
   - Main installer executable
   - **Action**: Upload to GitHub Releases as an asset

2. **`latest.yml`** - Update metadata
   - Same format as in update-server/releases/
   - **Action**: Copy to `update-server/releases/latest.yml` and commit to update-server repo

3. **`PBooksPro Setup X.X.X.exe.blockmap`** - Differential update data
   - Enables incremental updates
   - **Action**: Copy to `update-server/releases/` and commit to update-server repo

4. **`win-unpacked/`** - Unpacked application folder (DO NOT COMMIT)
   - Used for testing, not for distribution

### Release Folder Git Status:

The `release/` folder is typically in `.gitignore` (as it should be), so these files are NOT committed to your main project repository.

## Workflow for Publishing Updates

### Step 1: Build Your Application
```bash
npm run electron:build:win
```

This creates files in the `release/` folder (or configured output directory).

### Step 2: Create GitHub Release

1. Go to your GitHub repository
2. Click "Releases" → "Draft a new release"
3. Create a tag (e.g., `v1.0.9`)
4. Upload these files as assets:
   - `PBooksPro Setup 1.0.9.exe` (main installer)
   - Optionally: `PBooksPro Setup 1.0.9.exe.blockmap`

### Step 3: Update Update Server Repository

1. Copy `latest.yml` from build output to `update-server/releases/latest.yml`
2. Copy `.blockmap` file to `update-server/releases/` (if using)
3. Commit and push to update-server repository:
   ```bash
   cd update-server
   git add releases/latest.yml releases/*.blockmap
   git commit -m "Update to version 1.0.9"
   git push
   ```

## Summary: What to Push to GitHub

### Update-Server Repository:
✅ **Commit these:**
- `server.cjs`
- `package.json`
- `render.yaml` (if using Render)
- `releases/latest.yml` ← **MUST be updated with each release**
- `releases/*.exe.blockmap` ← **One per version**
- `README.md`

❌ **Don't commit:**
- `*.exe` files (too large, upload to GitHub Releases instead)
- `node_modules/`

### Main Project Repository:
- The `release/` folder is in `.gitignore` (correct behavior)
- Build artifacts are uploaded to GitHub Releases, not committed

## Key Points:

1. **`latest.yml` is critical** - Without it, electron-updater won't know if updates are available
2. **`.exe` files go to GitHub Releases** - Not in the repository (too large)
3. **`.blockmap` files enable faster updates** - Commit these to update-server repo
4. **Update server proxies from GitHub** - The server.cjs code can fetch from GitHub Releases if files aren't found locally

## Verification:

After pushing, verify your update server can access:
- `https://your-update-server.com/latest.yml` ← Should return the latest.yml content
- `https://your-update-server.com/PBooksPro Setup X.X.X.exe` ← Should proxy from GitHub Releases
