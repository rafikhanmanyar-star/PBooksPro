# PowerShell Execution Policy Fix

If you encounter this error when running npm commands:
```
npm : File D:\Program Files\nodejs\npm.ps1 cannot be loaded because running scripts is disabled on this system.
```

## Quick Solutions

### Option 1: Use Batch Files (Easiest)
Use the provided `.bat` files instead:

- **Development**: Double-click `electron-dev.bat` or run:
  ```cmd
  electron-dev.bat
  ```

- **Build Installer + Portable**: Double-click `electron-build.bat` or run:
  ```cmd
  electron-build.bat
  ```

- **Build Portable Only**: Double-click `electron-build-portable.bat` or run:
  ```cmd
  electron-build-portable.bat
  ```

### Option 2: Use npm.cmd Directly
Instead of `npm`, use `npm.cmd`:

```cmd
npm.cmd run electron:dev
npm.cmd run electron:build:win
```

### Option 3: Use Command Prompt (cmd.exe)
Open **Command Prompt** (not PowerShell) and run:
```cmd
npm run electron:dev
npm run electron:build:win
```

### Option 4: Fix PowerShell Execution Policy (Permanent)

Run PowerShell **as Administrator** and execute:

```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

Then restart PowerShell and try again.

## Why This Happens

Windows PowerShell has security policies that prevent scripts from running. The `npm.ps1` file is a PowerShell script, so it gets blocked. The batch files (`.bat`) use `npm.cmd` which doesn't have this restriction.

## Recommended Approach

For Windows users, **use the batch files** (`electron-dev.bat`, `electron-build.bat`) - they're simpler and avoid PowerShell issues entirely.

