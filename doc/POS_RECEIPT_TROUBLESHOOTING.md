# POS Receipt Printing Troubleshooting Guide

## Issues Fixed

### ✅ Issue 1: Sales History Error (FIXED)
**Error**: `TypeError: Cannot read properties of undefined (reading 'toLowerCase')`

**Cause**: The `customerName` field was undefined for some sales records.

**Fix**: Added null-safe checks using optional chaining (`?.`) in the filter function.

**Status**: ✅ **RESOLVED** - Sales History (F9) now works without errors.

---

### ✅ Issue 2: Printer Using Old Format (FIXED)
**Problem**: Print preview showed new format but printer used old format without barcode.

**Cause**: Thermal printer instance was cached and not updating when settings changed.

**Fix**: Modified `POSContext.tsx` to recreate the thermal printer instance whenever print settings change.

**Status**: ✅ **RESOLVED** - Printer now always uses the latest template with barcode.

**How to Verify**:
1. Open browser console (F12)
2. Look for: `🖨️ Thermal printer initialized with settings:`
3. Print a receipt
4. Check that barcode appears on printed receipt

---

### ⚠️ Issue 3: Paper Cutter Not Working
**Problem**: Paper doesn't cut automatically after printing.

**Cause**: Paper cutting is controlled by the **printer driver**, not the application.

**Status**: ⚠️ **REQUIRES PRINTER CONFIGURATION**

## How to Enable Automatic Paper Cutting

### Step 1: Access Printer Settings
1. Open **Windows Settings** (Win + I)
2. Go to **Devices** → **Printers & Scanners**
3. Find your thermal printer in the list
4. Click on it, then click **Manage**

### Step 2: Configure Printer Driver
1. Click **Printing Preferences**
2. Look for one of these tabs:
   - **Device Settings**
   - **Advanced**
   - **Options**
   - **Paper/Quality**

### Step 3: Enable Cutter
Look for one of these settings:
- **Cutter**: Set to "Cut at end of job" or "Auto-cut"
- **Auto-cutter**: Enable or set to "On"
- **Paper cut**: Set to "Partial cut" or "Full cut"
- **Cut method**: Select "Auto" or "After print"

### Step 4: Apply and Test
1. Click **Apply** then **OK**
2. Return to the POS application
3. Print a test receipt
4. Paper should now cut automatically

## Common Printer Models

### Xprinter XP-80C / XP-58
1. Printing Preferences → **Device Settings**
2. Find **"Cutter"** option
3. Set to: **"Cut at end of job"**

### EPSON TM-T20 / TM-T82
1. Printing Preferences → **Advanced** tab
2. Find **"Auto Cutter"** under Paper/Output
3. Set to: **"Enabled"** or **"Partial Cut"**

### Star TSP100 / TSP143
1. Printing Preferences → **Options** tab
2. Find **"Auto Cut"**
3. Set to: **"Enabled"**

### Generic ESC/POS Printers
1. Printing Preferences → **Device Settings**
2. Look for **"Paper Cut"** or **"Cutter"**
3. Enable or set to **"Auto"**

## Alternative: Manual Cutting

If your printer doesn't support auto-cutting:

### Option 1: Manual Tear
- Use the tear bar on the printer
- The receipt has a "[ CUT HERE ]" marker

### Option 2: Scissors
- Cut along the dashed line
- Look for "*** END OF RECEIPT ***" marker

## Verification Steps

After configuring the printer driver:

1. **Test Print from Windows**:
   - Right-click printer → Print Test Page
   - Check if it auto-cuts

2. **Test from POS**:
   - Complete a sale
   - Print receipt
   - Verify auto-cut happens

3. **Check Console**:
   - Open browser console (F12)
   - Look for: `📄 Receipt printed - Paper will be cut automatically if printer cutter is enabled`

## Why Can't the App Control Cutting?

The browser's print API doesn't support sending raw ESC/POS commands like:
```
\x1D\x56\x00  (GS V 0 - Full cut)
\x1D\x56\x01  (GS V 1 - Partial cut)
```

These commands can only be sent via:
- Direct USB/Serial communication (not available in browsers)
- Printer driver configuration (recommended)
- Native desktop applications

**Our Solution**: Configure the printer driver to auto-cut at end of job.

## Additional Tips

### Tip 1: Set as Default Printer
Make your thermal printer the Windows default:
1. Settings → Printers & Scanners
2. Click your thermal printer
3. Click "Set as default"

### Tip 2: Silent Printing
For direct printing without preview:
1. Launch Chrome with: `chrome.exe --kiosk-printing`
2. Or use the print dialog and select "Print"

### Tip 3: Check Printer Status
- Ensure printer is online
- Check paper is loaded correctly
- Verify USB/Network connection
- Update printer drivers if needed

### Tip 4: Test with Different Paper
- Some printers only auto-cut with specific paper widths
- Verify you're using 80mm thermal paper
- Check paper roll is installed correctly

## Still Not Working?

### Check Printer Manual
- Look for "Auto-cut" or "Cutter" settings
- Some printers require DIP switch configuration
- Refer to manufacturer documentation

### Contact Printer Support
- Provide printer model number
- Ask about auto-cut configuration
- Request driver updates if available

### Alternative Solutions
1. **Use a different printer** that supports auto-cut
2. **Manual cutting** using tear bar or scissors
3. **Desktop app** that can send raw ESC/POS commands

## Summary

| Issue | Status | Action Required |
|-------|--------|-----------------|
| Sales History Error | ✅ Fixed | None - automatic |
| Old Print Format | ✅ Fixed | Refresh page after settings change |
| Paper Cutter | ⚠️ Driver Config | Configure printer driver settings |

## Quick Checklist

- [ ] Refresh browser after changing print settings
- [ ] Check console for printer initialization message
- [ ] Verify barcode appears on printed receipt
- [ ] Configure printer driver for auto-cut
- [ ] Test auto-cut with Windows test page
- [ ] Verify paper is 80mm thermal paper
- [ ] Check printer is set as default

---

**Last Updated**: February 2026
**Related Docs**: 
- `POS_BARCODE_PRINTER_GUIDE.md`
- `AUTOMATIC_PAPER_CUTTING_IMPLEMENTATION.md`
- `POS_RECEIPT_CONFIGURATION_GUIDE.md`
