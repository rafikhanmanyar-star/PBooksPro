# Build Assets

This directory contains build assets for Electron packaging.

## Icon Requirements

For Windows builds, you need an `.ico` file:

1. **Create or convert an icon:**
   - Size: 256x256 or 512x512 pixels
   - Format: `.ico` (Windows icon format)
   - You can use online converters like:
     - https://convertio.co/svg-ico/
     - https://cloudconvert.com/svg-to-ico
     - Or use ImageMagick: `magick convert icon.svg -resize 256x256 icon.ico`

2. **Place the icon here:**
   - File name: `icon.ico`
   - Location: `build/icon.ico`

3. **If you don't have an icon:**
   - The app will still build, but Windows will use a default icon
   - You can add an icon later and rebuild

## Current Icon

If you have `icon.svg` in the root directory, you can convert it to `.ico` format using any of the tools mentioned above.

