# Quick Start - Building Windows Executable

## Step 1: Install Dependencies

```bash
npm install
```

This installs Electron, electron-builder, and all required dependencies.

## Step 2: (Optional) Add Icon

Convert `icon.svg` to `build/icon.ico`:
- Use https://convertio.co/svg-ico/ or similar
- Place at: `build/icon.ico`
- Size: 256x256 or 512x512 pixels

## Step 3: Build Executable

### Option A: Build Installer + Portable
```bash
npm run electron:build:win
```

### Option B: Build Portable Only
```bash
npm run electron:build:win:portable
```

## Step 4: Find Your Executable

Check the `release/` folder:
- **Installer**: `Finance Tracker Pro Setup 1.0.0.exe`
- **Portable**: `Finance Tracker Pro-1.0.0-portable.exe`

## Development Mode

To test the app with Electron before building:

```bash
npm run electron:dev
```

This runs the Vite dev server and launches Electron automatically.

## Troubleshooting

If build fails:
1. Make sure you ran `npm install`
2. Check Node.js version: `node --version` (should be v18+)
3. Clear and rebuild: `npm run build && npm run electron:build:win`

For detailed information, see: `docs/ELECTRON_BUILD.md`

