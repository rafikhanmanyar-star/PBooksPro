# App icon for Electron

Place your application icon here so the desktop app and installer use it instead of the default Electron icon.

## Windows

- **File:** `icon.ico`
- **Format:** ICO (multi-size recommended: 16×16, 32×32, 48×48, 256×256)
- **Location:** `electron/assets/icon.ico`

## macOS (optional)

- **File:** `icon.icns`
- **Format:** ICNS
- **Location:** `electron/assets/icon.icns`

## How to create the icon

1. **From your SVG** (e.g. `public/icon.svg`):
   - Use an online converter (e.g. cloudconvert.com, convertio.co) to export **ICO** for Windows.
   - Or use ImageMagick:  
     `magick convert -background none public/icon.svg -define icon:auto-resize=256,48,32,16 electron/assets/icon.ico`

2. **From a 256×256 PNG:**
   - Many ICO converters accept PNG and output multi-size ICO.
   - Or: `magick convert icon-256.png electron/assets/icon.ico`

3. After adding `icon.ico`, rebuild the app:
   - Dev: `npm run electron` or `npm run electron:staging`
   - Installer: `npm run electron:staging:installer` or `npm run electron:production:installer`

The window title bar and taskbar will use this icon; the built `.exe` and installer will use it too.
