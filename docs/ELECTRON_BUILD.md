# Electron Build Guide

This guide explains how to build PBooksPro as a Windows executable with auto-update functionality.

## Prerequisites

1. **Node.js** (v18 or higher)
2. **npm** or **yarn**
3. **Windows OS** (for Windows builds)

## Setup

### 1. Install Dependencies

```bash
npm install
```

This will install all dependencies including Electron, electron-builder, and electron-updater.

### 2. Prepare Icon (Optional but Recommended)

1. Convert your `icon.svg` to `build/icon.ico`:
   - Use an online converter (https://convertio.co/svg-ico/)
   - Or use ImageMagick: `magick convert icon.svg -resize 256x256 build/icon.ico`
   - Size: 256x256 or 512x512 pixels

2. Place the icon at: `build/icon.ico`

If you skip this step, the app will still build but use a default Windows icon.

## Development Mode

Run the app in development mode with Electron:

```bash
npm run electron:dev
```

This will:
1. Start the Vite dev server
2. Launch Electron when the server is ready
3. Open DevTools automatically

## Building Executables

### Build Windows Installer (Recommended for Auto-Update)

```bash
npm run electron:build:win
```

This creates:
- **Installer**: `release/PBooksPro Setup 1.0.0.exe` (NSIS installer with auto-update support)

### Build and Publish Update

```bash
npm run electron:build:win:publish
```

This builds and publishes the update files to your configured update server.

### Build Portable Only (No Auto-Update)

```bash
npm run electron:build:win:portable
```

Creates only the portable executable. **Note:** Portable versions do not support auto-update.

## Output Location

All built files are in the `release/` directory:
```
release/
├── PBooksPro Setup 1.0.0.exe  (Installer)
├── PBooksPro-1.0.0-portable.exe  (Portable, if built)
├── latest.yml  (Update metadata for auto-updater)
├── PBooksPro Setup 1.0.0.exe.blockmap  (Differential update data)
└── win-unpacked/  (Unpacked files for testing)
```

## Auto-Update System

The application includes built-in auto-update functionality that checks for and downloads new versions automatically.

### How It Works

1. **On App Launch**: The app checks for updates 5 seconds after startup
2. **Manual Check**: Users can click the version button in the bottom-right corner to manually check
3. **Download**: When an update is available, users can choose to download it
4. **Install**: After download completes, users are prompted to restart and install

### Update Flow

```
┌────────────────────┐
│  App Starts        │
└────────┬───────────┘
         ↓
┌────────────────────┐
│ Check for Updates  │ (after 5 second delay)
└────────┬───────────┘
         ↓
   ┌─────┴─────┐
   │  Update   │
   │ Available?│
   └─────┬─────┘
     Yes ↓   No → "Up to date" message
┌────────────────────┐
│ Show Update Banner │
│ "Download Update"  │
└────────┬───────────┘
         ↓
┌────────────────────┐
│ User Clicks        │
│ "Download"         │
└────────┬───────────┘
         ↓
┌────────────────────┐
│ Show Progress Bar  │
└────────┬───────────┘
         ↓
┌────────────────────┐
│ Download Complete  │
│ "Restart & Install"│
└────────┬───────────┘
         ↓
┌────────────────────┐
│ App Restarts       │
│ Update Applied     │
└────────────────────┘
```

### Configuring Update Server

The update server URL is configured in `package.json`:

```json
{
  "build": {
    "publish": {
      "provider": "generic",
      "url": "https://your-update-server.com/releases/",
      "channel": "latest"
    }
  }
}
```

#### Option 1: Generic HTTP Server

Upload these files to your web server:
- `PBooksPro Setup X.X.X.exe`
- `latest.yml`
- `PBooksPro Setup X.X.X.exe.blockmap` (for differential updates)

Example directory structure on server:
```
https://your-server.com/releases/
├── latest.yml
├── PBooksPro Setup 1.0.0.exe
├── PBooksPro Setup 1.0.0.exe.blockmap
├── PBooksPro Setup 1.0.1.exe
└── PBooksPro Setup 1.0.1.exe.blockmap
```

#### Option 2: GitHub Releases

Change the publish configuration in `package.json`:

```json
{
  "build": {
    "publish": {
      "provider": "github",
      "owner": "your-github-username",
      "repo": "finance-tracker-pro"
    }
  }
}
```

Then set your GitHub token:
```bash
set GH_TOKEN=your_github_personal_access_token
npm run electron:build:win:publish
```

#### Option 3: Amazon S3

```json
{
  "build": {
    "publish": {
      "provider": "s3",
      "bucket": "your-bucket-name",
      "region": "us-east-1"
    }
  }
}
```

### Version Management

1. Update version in `package.json`:
```json
{
  "version": "1.0.1"
}
```

2. Build and publish:
```bash
npm run electron:build:win:publish
```

3. Upload generated files to your update server

### Files Required for Auto-Update

After building, upload these files to your update server:

| File | Description |
|------|-------------|
| `latest.yml` | Contains version info, required for update checks |
| `*.exe` | The installer file |
| `*.exe.blockmap` | Optional, enables differential/delta updates (smaller downloads) |

## Distribution

### Installer Version (Recommended)
- Users can install the app like any Windows application
- Creates Start Menu and Desktop shortcuts
- **Supports auto-update**
- Stores data in: `%APPDATA%\PBooksPro\`
- Can be uninstalled via Windows Settings

### Portable Version
- No installation required
- Can run from USB drive or any folder
- **Does NOT support auto-update**
- Stores data in: `[App Folder]\PBooksPro\`
- Self-contained executable

## Database Storage in Electron

When running as an Electron app, the database is stored in:

**Windows:**
```
%APPDATA%\PBooksPro\finance_db.sqlite
```

Or for portable version:
```
[App Folder]\PBooksPro\finance_db.sqlite
```

The OPFS storage will use Electron's app data directory instead of browser storage.

## Troubleshooting

### Build Fails

1. **Clear cache:**
   ```bash
   npm run build
   rm -rf release
   npm run electron:build:win
   ```

2. **Check Node version:**
   ```bash
   node --version  # Should be v18+
   ```

3. **Reinstall dependencies:**
   ```bash
   rm -rf node_modules package-lock.json
   npm install
   ```

### App Won't Start

1. **Check console for errors:**
   - Run `npm run electron:dev` to see errors

2. **Verify build output:**
   - Check that `dist/` folder exists and has `index.html`

3. **Check database initialization:**
   - The app should create the database automatically on first run

### Auto-Update Issues

1. **Update check fails:**
   - Verify update server URL is correct in `package.json`
   - Ensure `latest.yml` is accessible at the URL
   - Check CORS headers if using a custom server

2. **Download fails:**
   - Check network connectivity
   - Verify the installer file exists on the server
   - Check file permissions on the server

3. **Install fails:**
   - Ensure user has write permissions to the app directory
   - Check if antivirus is blocking the update
   - Try running the installer manually

4. **Testing updates locally:**
   - You can use a local HTTP server for testing
   - Run `npx serve release` to serve update files locally
   - Update the publish URL to `http://localhost:3000`

### Icon Not Showing

1. **Verify icon exists:**
   - Check `build/icon.ico` exists
   - File should be valid `.ico` format

2. **Rebuild:**
   ```bash
   npm run electron:build:win
   ```

## Advanced Configuration

### Customize Build Settings

Edit `package.json` → `build` section:

```json
{
  "build": {
    "appId": "com.financetracker.pro",
    "productName": "PBooksPro",
    "win": {
      "target": ["nsis"],
      "icon": "build/icon.ico"
    },
    "nsis": {
      "oneClick": false,
      "allowToChangeInstallationDirectory": true,
      "differentialPackage": true
    }
  }
}
```

### Differential Updates

Differential updates only download changed blocks, making updates faster:

- Enabled by default with `differentialPackage: true` in NSIS config
- Requires `.blockmap` files to be uploaded alongside installers
- Users on slow connections will benefit the most

### Pre-release/Beta Channel

For beta testing, add a separate channel:

```json
{
  "build": {
    "publish": [
      {
        "provider": "generic",
        "url": "https://your-server.com/releases/stable/",
        "channel": "latest"
      },
      {
        "provider": "generic",
        "url": "https://your-server.com/releases/beta/",
        "channel": "beta"
      }
    ]
  }
}
```

## Testing the Build

1. **Test installer:**
   - Run `release/PBooksPro Setup 1.0.0.exe`
   - Install to a test location
   - Verify app runs correctly

2. **Test auto-update:**
   - Install version 1.0.0
   - Publish version 1.0.1 to your update server
   - Open the app and check for updates
   - Verify update downloads and installs correctly

3. **Test database:**
   - Create some test data
   - Close and reopen app
   - Verify data persists

## Code Signing (Recommended for Production)

For production distribution, you should code sign the executable to avoid Windows SmartScreen warnings:

1. Get a code signing certificate from a trusted CA
2. Add to `package.json`:
```json
{
  "build": {
    "win": {
      "certificateFile": "path/to/certificate.pfx",
      "certificatePassword": "password"
    }
  }
}
```

Or set environment variables:
```bash
set CSC_LINK=path/to/certificate.pfx
set CSC_KEY_PASSWORD=password
npm run electron:build:win
```

## Support

For issues:
1. Check browser console (DevTools in Electron: Ctrl+Shift+I)
2. Check Electron logs
3. Verify all dependencies are installed
4. Check database initialization logs
5. For update issues, check the update server accessibility
