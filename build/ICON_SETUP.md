# Icon Setup for Electron Builder

## Current Configuration

The Electron Builder is configured to use `build/icon.ico` for:
- Application EXE icon
- Installer icon
- Uninstaller icon
- Installer header icon

## Icon File Requirements

For Windows builds, the `.ico` file should:
1. **Contain multiple sizes** (16x16, 32x32, 48x48, 256x256) - Windows uses different sizes for different contexts
2. **Be at least 256x256 pixels** - Required for high-DPI displays
3. **Be in proper ICO format** - Not just a renamed PNG file

## Converting SVG to ICO

If you need to convert `icon.svg` to `icon.ico` with multiple sizes:

### Option 1: Online Converter (Recommended)
1. Go to https://convertio.co/svg-ico/ or https://cloudconvert.com/svg-to-ico
2. Upload `icon.svg`
3. Select multiple sizes (16, 32, 48, 256)
4. Download and save as `build/icon.ico`

### Option 2: ImageMagick (Command Line)
```bash
# Install ImageMagick first, then:
magick convert icon.svg -define icon:auto-resize=256,128,96,64,48,32,16 icon.ico
```

### Option 3: Using GIMP or Photoshop
1. Open `icon.svg` in GIMP/Photoshop
2. Export as ICO format
3. Select multiple sizes during export
4. Save as `build/icon.ico`

## Verification

After building, check:
1. The EXE file should show your custom icon in Windows Explorer
2. The installer should use your icon
3. Desktop shortcut should show your icon

## Troubleshooting

If Electron Builder is still using the default icon:
1. **Check file exists**: Verify `build/icon.ico` exists
2. **Check file format**: Open the .ico file in an image viewer to verify it's a valid ICO
3. **Rebuild**: Delete `dist` folder and rebuild: `npm run electron:build:win`
4. **Check path**: The icon path in `package.json` should be `"icon.ico"` (relative to buildResources)

## Current Icon Path Configuration

In `package.json`:
- `buildResources`: `"build"` (directory containing icon.ico)
- `win.icon`: `"icon.ico"` (relative to buildResources)
- `nsis.installerIcon`: `"icon.ico"`
- `nsis.uninstallerIcon`: `"icon.ico"`
- `nsis.installerHeaderIcon`: `"icon.ico"`

