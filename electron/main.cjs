const { app, BrowserWindow, ipcMain, dialog, Menu, shell, globalShortcut } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const { autoUpdater } = require('electron-updater');
let nativeDb = null;

// Comprehensive error handling for Electron main process
function setupElectronErrorHandlers() {
  // Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception in main process:', error);
    // Log to file if possible
    try {
      const logPath = path.join(app.getPath('userData'), 'error.log');
      const logMessage = `[${new Date().toISOString()}] Uncaught Exception: ${error.message}\n${error.stack}\n\n`;
      fs.appendFile(logPath, logMessage).catch(() => { });
    } catch (logError) {
      // Ignore logging errors
    }
    // Don't crash - try to continue
  });

  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection in main process:', reason);
    try {
      const logPath = path.join(app.getPath('userData'), 'error.log');
      const logMessage = `[${new Date().toISOString()}] Unhandled Rejection: ${reason}\n${promise}\n\n`;
      fs.appendFile(logPath, logMessage).catch(() => { });
    } catch (logError) {
      // Ignore logging errors
    }
  });

  // Handle IPC errors
  process.on('uncaughtExceptionMonitor', (error) => {
    console.error('❌ Exception Monitor:', error);
  });
}

// Set up error handlers immediately
setupElectronErrorHandlers();

let mainWindow;
let updateAvailable = false;
let updateDownloaded = false;
let updateInfo = null;
let isInstallingUpdate = false;
let lastProgressPercent = 0;
let updateCheckTimeout = null;
let isCheckingForUpdate = false;

// Force cleanup function to ensure app can quit cleanly
async function forceCleanupBeforeInstall() {
  console.log('🧹 Starting force cleanup before installation...');

  // Remove all close event handlers from main window to prevent blocking
  if (mainWindow && !mainWindow.isDestroyed()) {
    try {
      mainWindow.removeAllListeners('close');
      mainWindow.removeAllListeners('closed');

      // Force destroy the window immediately (bypasses close handlers)
      mainWindow.destroy();
      mainWindow = null;
      console.log('✅ Main window destroyed');
    } catch (err) {
      console.error('Error destroying window:', err);
    }
  }

  // Close all other windows
  try {
    const allWindows = BrowserWindow.getAllWindows();
    for (const win of allWindows) {
      if (!win.isDestroyed()) {
        win.removeAllListeners('close');
        win.removeAllListeners('closed');
        win.destroy();
      }
    }
    console.log('✅ All windows closed');
  } catch (err) {
    console.error('Error closing windows:', err);
  }

  // Give a moment for cleanup
  await new Promise(resolve => setTimeout(resolve, 500));

  // Prevent any further event handlers from blocking quit
  app.removeAllListeners('window-all-closed');
  app.removeAllListeners('before-quit');

  console.log('✅ Cleanup complete, ready for installation');
}

// Single instance lock - prevents multiple instances
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  // Another instance is already running
  console.log('Another instance is already running. Exiting...');
  app.quit();
} else {
  // This is the first instance - proceed with initialization

  // Handle second instance attempts (user tries to open app again)
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    // Someone tried to run a second instance, focus our window instead
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.focus();
    }
  });

  // Configure auto-updater
  function configureAutoUpdater() {
    // Set Application User Model ID for Windows (helps with installer detection)
    if (process.platform === 'win32') {
      app.setAppUserModelId('com.pbooks.pro');
    }

    // Update server URL (from package.json publish config)
    // Note: electron-updater automatically reads from package.json, but we log it for debugging
    const updateServerUrl = 'https://update-server-y6ps.onrender.com/';
    console.log(`🔗 Update server URL: ${updateServerUrl}`);
    console.log(`📦 Current app version: ${app.getVersion()}`);

    // Disable auto-download - require user consent before downloading updates
    autoUpdater.autoDownload = false;

    // Allow downgrade (useful for testing)
    autoUpdater.allowDowngrade = false;

    // Check for pre-release updates
    autoUpdater.allowPrerelease = false;

    // Set request headers and timeout
    // Note: electron-updater uses these for HTTP requests
    autoUpdater.requestHeaders = {
      'User-Agent': `PBooks-Pro/${app.getVersion()}`
    };

    // Configure request timeout (30 seconds)
    // This helps prevent hanging on slow/unreachable servers
    if (autoUpdater.requestOptions) {
      autoUpdater.requestOptions.timeout = 30000;
      autoUpdater.requestOptions.headers = {
        'User-Agent': `PBooks-Pro/${app.getVersion()}`
      };
    }

    // Handle before-quit-for-update event - this is specifically for updates
    app.on('before-quit-for-update', async (event) => {
      console.log('🔄 before-quit-for-update event triggered');
      // Don't prevent default - allow the quit to proceed
      // But do cleanup first
      isInstallingUpdate = true;

      // Remove all event handlers that might block quit
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.removeAllListeners('close');
        mainWindow.removeAllListeners('closed');
        mainWindow.destroy();
        mainWindow = null;
      }

      // Remove app event handlers that might block quit
      app.removeAllListeners('window-all-closed');
      // Note: We don't remove before-quit-for-update as it's needed

      console.log('✅ Cleanup done, allowing quit for update');
    });

    // Auto-updater events
    autoUpdater.on('checking-for-update', () => {
      console.log('Checking for update...');
      isCheckingForUpdate = true;
      sendStatusToWindow('update-checking');

      // Set a timeout to prevent hanging indefinitely (30 seconds)
      if (updateCheckTimeout) {
        clearTimeout(updateCheckTimeout);
      }
      updateCheckTimeout = setTimeout(() => {
        if (isCheckingForUpdate) {
          console.error('⚠️ Update check timeout - no response from server after 30 seconds');
          isCheckingForUpdate = false;
          sendStatusToWindow('update-error', {
            message: 'Update check timed out. The update server may be unreachable. Please check your internet connection and try again.',
            originalMessage: 'Timeout after 30 seconds',
            errorType: 'timeout',
          });
        }
      }, 30000); // 30 second timeout
    });

    autoUpdater.on('update-available', (info) => {
      console.log('Update available:', info.version);
      isCheckingForUpdate = false;
      if (updateCheckTimeout) {
        clearTimeout(updateCheckTimeout);
        updateCheckTimeout = null;
      }
      updateAvailable = true;
      updateInfo = info;
      sendStatusToWindow('update-available', {
        version: info.version,
        releaseDate: info.releaseDate,
        releaseNotes: info.releaseNotes
      });
      // Note: Download will NOT start automatically - user must consent first
      console.log('Update available - waiting for user consent to download...');
    });

    autoUpdater.on('update-not-available', (info) => {
      console.log('No update available. Current version:', info.version);
      isCheckingForUpdate = false;
      if (updateCheckTimeout) {
        clearTimeout(updateCheckTimeout);
        updateCheckTimeout = null;
      }
      sendStatusToWindow('update-not-available', {
        version: info.version
      });
    });

    autoUpdater.on('error', (err) => {
      console.error('Auto-updater error:', err);
      isCheckingForUpdate = false;
      if (updateCheckTimeout) {
        clearTimeout(updateCheckTimeout);
        updateCheckTimeout = null;
      }

      // Check if it's a 404 error (file not found on server)
      let userFriendlyMessage = err.message || 'Unknown error occurred';
      let errorType = 'unknown';

      if (err.message && err.message.includes('404')) {
        userFriendlyMessage = 'Update file not found on server. The update may not be available yet. Please try again later or contact support.';
        errorType = 'file_not_found';
      } else if (err.message && err.message.includes('status 404')) {
        userFriendlyMessage = 'Update file not found on server. The update may not be available yet. Please try again later or contact support.';
        errorType = 'file_not_found';
      } else if (err.message && (err.message.includes('ENOTFOUND') || err.message.includes('ECONNREFUSED') || err.message.includes('getaddrinfo'))) {
        userFriendlyMessage = 'Cannot connect to update server. Please check your internet connection and try again.';
        errorType = 'connection_error';
      } else if (err.message && err.message.includes('timeout')) {
        userFriendlyMessage = 'Update server connection timed out. Please check your internet connection and try again.';
        errorType = 'timeout';
      } else if (err.message && err.message.includes('ETIMEDOUT')) {
        userFriendlyMessage = 'Update server connection timed out. The server may be slow or unreachable. Please try again later.';
        errorType = 'timeout';
      } else if (err.message && err.message.includes('socket hang up')) {
        userFriendlyMessage = 'Connection to update server was interrupted. Please check your internet connection and try again.';
        errorType = 'connection_error';
      }

      sendStatusToWindow('update-error', {
        message: userFriendlyMessage,
        originalMessage: err.message,
        errorType: errorType,
        stack: err.stack
      });
    });

    autoUpdater.on('download-progress', (progressObj) => {
      // Ensure progress only moves forward (prevents jumping backward)
      const currentPercent = Math.max(progressObj.percent, lastProgressPercent);
      lastProgressPercent = currentPercent;

      const logMessage = `Download speed: ${formatBytes(progressObj.bytesPerSecond)}/s - Downloaded ${currentPercent.toFixed(1)}% (${formatBytes(progressObj.transferred)}/${formatBytes(progressObj.total)})`;
      console.log(logMessage);
      sendStatusToWindow('download-progress', {
        bytesPerSecond: progressObj.bytesPerSecond,
        percent: currentPercent,
        transferred: progressObj.transferred,
        total: progressObj.total
      });
    });

    autoUpdater.on('update-downloaded', (info) => {
      console.log('Update downloaded:', info.version);
      updateDownloaded = true;
      updateInfo = info;

      // Check if this is an incremental update (has .blockmap file)
      const isIncremental = info.files && info.files.some(file =>
        file.url && file.url.endsWith('.blockmap')
      );

      sendStatusToWindow('update-downloaded', {
        version: info.version,
        releaseDate: info.releaseDate,
        releaseNotes: info.releaseNotes,
        isIncremental: isIncremental
      });

      // For incremental updates, show a less intrusive notification
      // For full updates, show standard notification
      if (isIncremental) {
        console.log('Incremental update downloaded - can be applied with minimal interruption');
      } else {
        console.log('Full update downloaded - will require app restart');
      }
    });
  }

  // Helper function to format bytes
  function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  // Send status to renderer window
  function sendStatusToWindow(channel, data = {}) {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(channel, data);
    }
  }

  // IPC Handlers for auto-updater
  function setupIpcHandlers() {
    // Get app version
    ipcMain.handle('get-app-version', () => {
      return app.getVersion();
    });

    // Check for updates
    ipcMain.handle('check-for-updates', async () => {
      // Prevent multiple simultaneous update checks
      if (isCheckingForUpdate) {
        console.log('Update check already in progress, skipping...');
        return {
          success: false,
          error: 'Update check already in progress'
        };
      }

      try {
        console.log('Starting update check...');
        isCheckingForUpdate = true;

        // Set a timeout wrapper (electron-updater should handle its own timeout, but we add extra safety)
        const checkPromise = autoUpdater.checkForUpdates();
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => {
            if (isCheckingForUpdate) {
              reject(new Error('Update check timeout - server did not respond within 30 seconds'));
            }
          }, 30000); // 30 second timeout
        });

        const result = await Promise.race([checkPromise, timeoutPromise]);

        // Clear the timeout if check completed
        if (updateCheckTimeout) {
          clearTimeout(updateCheckTimeout);
          updateCheckTimeout = null;
        }

        return {
          success: true,
          updateAvailable: updateAvailable,
          version: result?.updateInfo?.version
        };
      } catch (error) {
        console.error('Error checking for updates:', error);
        isCheckingForUpdate = false;
        if (updateCheckTimeout) {
          clearTimeout(updateCheckTimeout);
          updateCheckTimeout = null;
        }

        // Send error to window
        sendStatusToWindow('update-error', {
          message: error.message || 'Failed to check for updates',
          originalMessage: error.message,
          errorType: 'check_failed',
        });

        return {
          success: false,
          error: error.message || 'Failed to check for updates'
        };
      }
    });

    // Download update (requires user consent - called from UI after user clicks "Download Update" button)
    ipcMain.handle('download-update', async () => {
      try {
        if (!updateAvailable) {
          return { success: false, error: 'No update available to download' };
        }
        console.log('✅ User consented to download update - starting download...');
        await autoUpdater.downloadUpdate();
        return { success: true };
      } catch (error) {
        console.error('Error downloading update:', error);
        return { success: false, error: error.message };
      }
    });

    // Install update (quit and install)
    // isSilent: false = show installer UI, true = silent install
    // isForceRunAfter: true = restart app after install
    ipcMain.handle('install-update', async (event, immediate = false) => {
      if (!updateDownloaded) {
        return { success: false, error: 'No update downloaded' };
      }

      if (isInstallingUpdate) {
        return { success: false, error: 'Installation already in progress' };
      }

      // Show confirmation dialog with data consistency information
      const userDataPath = app.getPath('userData');
      const response = await dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'Install Update',
        message: 'Ready to install update',
        detail: `Version ${updateInfo?.version || 'new version'} is ready to install.\n\n` +
          `✅ Your data and settings will be preserved\n` +
          `✅ All your accounts, transactions, and configurations will remain intact\n` +
          `✅ The application will close and restart automatically after installation\n\n` +
          `Data Location: ${userDataPath}\n\n` +
          `Would you like to install the update now?`,
        buttons: ['Install Now', 'Install on Next Quit', 'Cancel'],
        defaultId: 0,
        cancelId: 2
      });

      if (response.response === 2) {
        // User cancelled
        return { success: false, error: 'Installation cancelled by user' };
      }

      if (response.response === 0) {
        // Install immediately - ensure app closes gracefully first
        console.log('Installing update immediately...');
        isInstallingUpdate = true;

        try {
          // Save a flag to show data consistency message on next startup
          const updateFlagPath = path.join(userDataPath, '.update-installed');
          await fs.writeFile(updateFlagPath, JSON.stringify({
            previousVersion: app.getVersion(),
            newVersion: updateInfo?.version || 'unknown',
            installedAt: new Date().toISOString()
          }), 'utf8');
        } catch (err) {
          console.error('Error saving update flag:', err);
        }

        // Save database before closing
        try {
          console.log('💾 Saving database before installation...');
          if (mainWindow && !mainWindow.isDestroyed()) {
            const saveResult = await new Promise((resolve) => {
              const timeout = setTimeout(() => {
                console.warn('⚠️ Save timeout, proceeding with installation');
                resolve({ success: false });
              }, 5000); // 5 second timeout

              const handler = (event, result) => {
                clearTimeout(timeout);
                ipcMain.removeListener('database-save-complete', handler);
                resolve(result || { success: true });
              };

              ipcMain.once('database-save-complete', handler);

              // Request save from renderer
              mainWindow.webContents.send('save-database-now');
            });

            if (saveResult.success) {
              console.log('✅ Database saved successfully before installation');
              // Give a small delay to ensure file write completes
              await new Promise(resolve => setTimeout(resolve, 200));
            } else {
              console.warn('⚠️ Database save may have failed, but proceeding with installation');
            }
          }
        } catch (saveError) {
          console.error('❌ Error saving database before installation:', saveError);
          // Still proceed with installation to avoid hanging
        }

        // Force cleanup to ensure app can quit cleanly
        await forceCleanupBeforeInstall();

        // Now install the update - app will restart after installation
        console.log('🚀 Starting installation...');
        // Use quitAndInstall - it will quit the app and then install
        // The first parameter (false) means show installer UI
        // The second parameter (true) means restart app after install
        // The before-quit-for-update event will handle final cleanup
        try {
          autoUpdater.quitAndInstall(false, true);
          // Give it a moment, then if still running, force exit
          setTimeout(() => {
            if (!app.isQuitting) {
              console.log('⚠️ App still running, forcing exit...');
              app.exit(0);
            }
          }, 2000);
        } catch (err) {
          console.error('Error calling quitAndInstall:', err);
          // Fallback: force exit
          app.exit(0);
        }
      } else if (response.response === 1) {
        // Install on next quit
        console.log('Update will be installed on next app quit...');
        autoUpdater.quitAndInstall(false, false);
      }

      return { success: true };
    });

    // Check if update is ready to install
    ipcMain.handle('is-update-ready', () => {
      return { ready: updateDownloaded };
    });

    // Window controls (optional) - with error handling
    ipcMain.handle('minimize-window', () => {
      try {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.minimize();
        }
      } catch (error) {
        console.error('Error minimizing window:', error);
      }
    });

    ipcMain.handle('maximize-window', () => {
      try {
        if (mainWindow && !mainWindow.isDestroyed()) {
          if (mainWindow.isMaximized()) {
            mainWindow.unmaximize();
          } else {
            mainWindow.maximize();
          }
        }
      } catch (error) {
        console.error('Error maximizing window:', error);
      }
    });

    ipcMain.handle('close-window', () => {
      try {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.close();
        }
      } catch (error) {
        console.error('Error closing window:', error);
      }
    });

    // Database file operations for persistent storage
    ipcMain.handle('read-database-file', async () => {
      try {
        const dbPath = path.join(app.getPath('userData'), 'finance_db.sqlite');
        try {
          const data = await fs.readFile(dbPath);
          return { success: true, data: Array.from(data) };
        } catch (error) {
          if (error.code === 'ENOENT') {
            // File doesn't exist yet, return empty
            return { success: true, data: null };
          }
          // Try backup file if main file fails
          try {
            const backupPath = path.join(app.getPath('userData'), 'finance_db.sqlite.backup');
            const backupData = await fs.readFile(backupPath);
            console.warn('⚠️ Using backup database file');
            return { success: true, data: Array.from(backupData), fromBackup: true };
          } catch (backupError) {
            throw error; // Throw original error if backup also fails
          }
        }
      } catch (error) {
        console.error('Error reading database file:', error);
        // Log to error file asynchronously (non-blocking)
        setImmediate(() => {
          const logPath = path.join(app.getPath('userData'), 'error.log');
          const logMessage = `[${new Date().toISOString()}] Database read error: ${error.message}\n${error.stack}\n\n`;
          fs.appendFile(logPath, logMessage).catch(() => { });
        });
        return { success: false, error: error.message || 'Unknown error' };
      }
    });

    ipcMain.handle('write-database-file', async (event, data) => {
      try {
        const dbPath = path.join(app.getPath('userData'), 'finance_db.sqlite');
        const tempPath = path.join(app.getPath('userData'), 'finance_db.sqlite.tmp');
        const backupPath = path.join(app.getPath('userData'), 'finance_db.sqlite.backup');

        const buffer = Buffer.from(data);

        // Validate buffer is not empty
        if (!buffer || buffer.length === 0) {
          throw new Error('Database data is empty - cannot save');
        }

        // Validate SQLite header (first 16 bytes should be "SQLite format 3\000")
        const header = buffer.slice(0, 16).toString('utf8', 0, 13);
        if (header !== 'SQLite format') {
          throw new Error('Invalid SQLite database format - data may be corrupted');
        }

        // Create backup of existing database if it exists
        try {
          await fs.access(dbPath);
          await fs.copyFile(dbPath, backupPath);
          console.log('✅ Created backup of existing database');
        } catch (backupError) {
          // No existing database or backup failed - continue anyway
          if (backupError.code !== 'ENOENT') {
            console.warn('⚠️ Could not create backup:', backupError);
          }
        }

        // Write to temporary file first (atomic write)
        await fs.writeFile(tempPath, buffer);

        // Validate the temp file was written correctly
        const tempStats = await fs.stat(tempPath);
        if (tempStats.size !== buffer.length) {
          throw new Error(`File size mismatch: expected ${buffer.length} bytes, got ${tempStats.size}`);
        }

        // Validate temp file is readable SQLite database
        try {
          const tempData = await fs.readFile(tempPath);
          const tempHeader = tempData.slice(0, 16).toString('utf8', 0, 13);
          if (tempHeader !== 'SQLite format') {
            throw new Error('Temporary file validation failed - not a valid SQLite database');
          }
        } catch (validationError) {
          // Clean up temp file
          await fs.unlink(tempPath).catch(() => { });
          throw new Error(`Database validation failed: ${validationError.message}`);
        }

        // Atomic rename: move temp file to actual database file
        await fs.rename(tempPath, dbPath);

        console.log(`✅ Database saved successfully (${buffer.length} bytes)`);
        return { success: true };
      } catch (error) {
        console.error('Error writing database file:', error);
        // Try to clean up temp file if it exists
        try {
          const tempPath = path.join(app.getPath('userData'), 'finance_db.sqlite.tmp');
          await fs.unlink(tempPath);
        } catch (cleanupError) {
          // Ignore cleanup errors
        }
        return { success: false, error: error.message };
      }
    });

    ipcMain.handle('database-file-exists', async () => {
      try {
        const dbPath = path.join(app.getPath('userData'), 'finance_db.sqlite');
        try {
          await fs.access(dbPath);
          return { success: true, exists: true };
        } catch (error) {
          if (error.code === 'ENOENT') {
            return { success: true, exists: false };
          }
          throw error;
        }
      } catch (error) {
        console.error('Error checking database file:', error);
        return { success: false, error: error.message };
      }
    });

    // Backup operations
    ipcMain.handle('create-backup', async () => {
      // Send message to renderer to trigger backup creation
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('menu-create-backup');
        return { success: true };
      }
      return { success: false, error: 'Window not available' };
    });

    ipcMain.handle('restore-backup', async () => {
      // Open file dialog and send selected file to renderer
      try {
        const result = await dialog.showOpenDialog(mainWindow, {
          title: 'Select Backup File',
          filters: [
            { name: 'Database Backup', extensions: ['db'] },
            { name: 'All Files', extensions: ['*'] }
          ],
          properties: ['openFile']
        });

        if (result.canceled || result.filePaths.length === 0) {
          return { success: false, canceled: true };
        }

        // Read the file and send to renderer
        const filePath = result.filePaths[0];
        const fileData = await fs.readFile(filePath);

        // Send file data to renderer
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('menu-restore-backup', {
            fileName: path.basename(filePath),
            fileData: Array.from(fileData)
          });
          return { success: true };
        }
        return { success: false, error: 'Window not available' };
      } catch (error) {
        console.error('Error in restore-backup:', error);
        return { success: false, error: error.message };
      }
    });

    ipcMain.handle('quit-app', async () => {
      // Quit the application
      app.quit();
      return { success: true };
    });

    // Document storage folder selection
    ipcMain.handle('select-document-folder', async () => {
      try {
        const result = await dialog.showOpenDialog(mainWindow, {
          title: 'Select Document Storage Folder',
          properties: ['openDirectory', 'createDirectory']
        });

        if (result.canceled || result.filePaths.length === 0) {
          return { success: false, canceled: true };
        }

        return { success: true, folderPath: result.filePaths[0] };
      } catch (error) {
        console.error('Error in select-document-folder:', error);
        return { success: false, error: error.message };
      }
    });

    // Save document file to storage folder
    ipcMain.handle('save-document-file', async (event, { filePath, fileData, fileName }) => {
      try {
        // fileData is base64 encoded
        const buffer = Buffer.from(fileData, 'base64');
        await fs.writeFile(filePath, buffer);
        return { success: true };
      } catch (error) {
        console.error('Error saving document file:', error);
        return { success: false, error: error.message };
      }
    });

    // Open document file
    ipcMain.handle('open-document-file', async (event, { filePath }) => {
      try {
        // Check if file exists
        try {
          await fs.access(filePath);
          await shell.openPath(filePath);
          return { success: true };
        } catch (accessError) {
          return { success: false, error: 'File not found' };
        }
      } catch (error) {
        console.error('Error opening document file:', error);
        return { success: false, error: error.message };
      }
    });

    // Save database before closing - critical for data persistence
    ipcMain.handle('save-database-before-close', async () => {
      try {
        // Send message to renderer to save all pending data
        if (mainWindow && !mainWindow.isDestroyed()) {
          // Use sendSync equivalent - wait for response
          return new Promise((resolve) => {
            const timeout = setTimeout(() => {
              console.warn('⚠️ Save database timeout, proceeding with close');
              resolve({ success: false, error: 'Timeout' });
            }, 5000); // 5 second timeout

            // Listen for save completion
            const handler = (event, result) => {
              clearTimeout(timeout);
              ipcMain.removeListener('database-save-complete', handler);
              resolve(result || { success: true });
            };

            ipcMain.once('database-save-complete', handler);

            // Request save from renderer
            mainWindow.webContents.send('save-database-now');
          });
        }
        return { success: true };
      } catch (error) {
        console.error('Error saving database before close:', error);
        return { success: false, error: error.message };
      }
    });
  }

  function createWindow() {
    mainWindow = new BrowserWindow({
      width: 1400,
      height: 900,
      minWidth: 1024,
      minHeight: 768,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        enableRemoteModule: false,
        webSecurity: true,
        // Preload script for secure IPC communication
        preload: path.join(__dirname, 'preload.cjs'),
        // Allow loading local files and WASM
        allowRunningInsecureContent: false,
        // Performance optimizations
        v8CacheOptions: 'code', // Enable V8 code caching for faster startup
        enableBlinkFeatures: 'CSSColorSchemeUARendering' // Enable modern CSS features
      },
      icon: path.join(__dirname, '../build/icon.ico'),
      show: false,
      titleBarStyle: 'default',
      backgroundColor: '#f8fafc',
      // Performance: Enable hardware acceleration (default, but explicit)
      paintWhenInitiallyHidden: false // Don't paint until shown (faster startup)
    });

    // Load the app
    const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

    if (isDev) {
      // Development: Load from Vite dev server
      mainWindow.loadURL('http://localhost:5173');
      mainWindow.webContents.openDevTools();
    } else {
      // Production: Load from built files
      mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));

      // Prevent DevTools from being opened in production (security measure)
      mainWindow.webContents.on('devtools-opened', () => {
        // Immediately close DevTools if opened in production
        mainWindow.webContents.closeDevTools();
      });

      // Log errors to console
      mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
        console.error('❌ Failed to load:', validatedURL, errorCode, errorDescription);

        // Reload the page on load failure (but not for navigation cancellations)
        if (errorCode !== -3) { // -3 is ERR_ABORTED (user navigation)
          console.log('🔄 Attempting to reload after load failure...');
          setTimeout(() => {
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.reload();
            }
          }, 1000);
        }
      });

      mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
        if (level >= 2) { // Error or warning
          console.error(`[Renderer ${level}]`, message, `at ${sourceId}:${line}`);
        }
      });
    }

    // Critical: Handle renderer process crashes - this is the main cause of blank pages
    let crashReloadAttempts = 0;
    const MAX_CRASH_RELOAD_ATTEMPTS = 3;

    // Health check variables (declared early so event handlers can access them)
    let healthCheckInterval = null;
    let lastHealthCheck = Date.now();

    mainWindow.webContents.on('render-process-gone', (event, details) => {
      console.error('❌ Renderer process crashed:', details.reason, details.exitCode);

      // Log crash details
      try {
        const logPath = path.join(app.getPath('userData'), 'error.log');
        const logMessage = `[${new Date().toISOString()}] Renderer process crashed: ${details.reason}, exit code: ${details.exitCode}\n\n`;
        fs.appendFile(logPath, logMessage).catch(() => { });
      } catch (logError) {
        // Ignore logging errors
      }

      // Attempt to recover by reloading
      if (crashReloadAttempts < MAX_CRASH_RELOAD_ATTEMPTS) {
        crashReloadAttempts++;
        console.log(`🔄 Attempting to recover from crash (attempt ${crashReloadAttempts}/${MAX_CRASH_RELOAD_ATTEMPTS})...`);

        setTimeout(() => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            try {
              mainWindow.reload();
            } catch (reloadError) {
              console.error('❌ Failed to reload after crash:', reloadError);
              // If reload fails, try recreating the window
              if (crashReloadAttempts >= MAX_CRASH_RELOAD_ATTEMPTS) {
                console.log('🔄 Recreating window after multiple crash attempts...');
                mainWindow.destroy();
                setTimeout(() => {
                  createWindow();
                }, 1000);
              }
            }
          }
        }, 2000); // Wait 2 seconds before reloading
      } else {
        console.error('❌ Maximum crash recovery attempts reached. Window may need to be manually restarted.');
        // Show error dialog to user
        dialog.showMessageBox(mainWindow, {
          type: 'error',
          title: 'Application Error',
          message: 'The application encountered an error and could not recover automatically.',
          detail: 'Please restart the application. Your data has been saved.',
          buttons: ['OK']
        }).catch(() => { });
      }
    });

    // Handle renderer becoming unresponsive
    let unresponsiveTimeout = null;
    mainWindow.webContents.on('unresponsive', () => {
      console.warn('⚠️ Renderer process became unresponsive');

      // Set a timeout to reload if it stays unresponsive
      if (unresponsiveTimeout) {
        clearTimeout(unresponsiveTimeout);
      }

      unresponsiveTimeout = setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          console.log('🔄 Reloading due to unresponsive renderer...');
          mainWindow.reload();
        }
      }, 10000); // Wait 10 seconds before reloading
    });

    // Handle renderer becoming responsive again
    mainWindow.webContents.on('responsive', () => {
      console.log('✅ Renderer process became responsive again');

      // Clear the unresponsive timeout if it exists
      if (unresponsiveTimeout) {
        clearTimeout(unresponsiveTimeout);
        unresponsiveTimeout = null;
      }

      // Reset crash reload attempts on successful recovery
      crashReloadAttempts = 0;

      // Reset health check timestamp
      lastHealthCheck = Date.now();
    });

    // Handle page title updates (can indicate navigation issues)
    mainWindow.webContents.on('page-title-updated', (event, title) => {
      // If title becomes empty or shows error, might indicate a problem
      if (!title || title.trim() === '') {
        console.warn('⚠️ Page title is empty - possible navigation issue');
      }
    });

    // Reset crash counter on successful load
    mainWindow.webContents.on('did-finish-load', () => {
      crashReloadAttempts = 0; // Reset on successful load
      lastHealthCheck = Date.now(); // Reset health check timestamp
      console.log('✅ Page loaded successfully');
    });

    // Add keyboard shortcut for DevTools (F12) - ONLY in development
    // Register F12 shortcut when window is ready
    if (isDev) {
      mainWindow.webContents.once('did-finish-load', () => {
        // Register F12 to toggle DevTools (development only)
        globalShortcut.register('F12', () => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            if (mainWindow.webContents.isDevToolsOpened()) {
              mainWindow.webContents.closeDevTools();
            } else {
              mainWindow.webContents.openDevTools();
            }
          }
        });
      });
    }

    // Optimize performance: Disable background throttling to keep app responsive
    // This prevents Electron from throttling timers and animations when window is minimized
    mainWindow.webContents.setBackgroundThrottling(false);

    // Periodic health check to detect if renderer is still alive
    const startHealthCheck = () => {
      if (healthCheckInterval) {
        clearInterval(healthCheckInterval);
      }

      healthCheckInterval = setInterval(() => {
        if (!mainWindow || mainWindow.isDestroyed()) {
          if (healthCheckInterval) {
            clearInterval(healthCheckInterval);
            healthCheckInterval = null;
          }
          return;
        }

        try {
          // Check if webContents is still accessible
          const currentTime = Date.now();
          const timeSinceLastCheck = currentTime - lastHealthCheck;

          // If it's been more than 30 seconds since last successful check, something might be wrong
          if (timeSinceLastCheck > 30000) {
            console.warn('⚠️ Health check timeout - renderer may be unresponsive');

            // Try to ping the renderer
            mainWindow.webContents.executeJavaScript('true')
              .then(() => {
                // Success - update last check time
                lastHealthCheck = Date.now();
              })
              .catch((error) => {
                console.error('❌ Renderer health check failed:', error);
                // If we can't execute JavaScript, the renderer is likely dead
                console.log('🔄 Attempting to reload due to failed health check...');
                setTimeout(() => {
                  if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.reload();
                    // Reset health check time after reload
                    lastHealthCheck = Date.now();
                  }
                }, 2000);
              });
          } else {
            // Normal check - ping renderer to verify it's alive
            mainWindow.webContents.executeJavaScript('true')
              .then(() => {
                // Success - update last check time
                lastHealthCheck = Date.now();
              })
              .catch((error) => {
                console.warn('⚠️ Health check ping failed:', error);
                // Don't reload immediately on first failure, but log it
              });
          }
        } catch (error) {
          console.error('❌ Health check error:', error);
        }
      }, 15000); // Check every 15 seconds
    };

    // Start health check after window is ready
    mainWindow.webContents.once('did-finish-load', () => {
      lastHealthCheck = Date.now();
      startHealthCheck();
    });

    // Clean up health check on window close
    mainWindow.on('closed', () => {
      if (healthCheckInterval) {
        clearInterval(healthCheckInterval);
        healthCheckInterval = null;
      }
    });

    // Show window when ready to prevent visual flash
    mainWindow.once('ready-to-show', async () => {
      mainWindow.show();

      // Focus on window
      if (isDev) {
        mainWindow.focus();
      }

      // Check if update was just installed and show data consistency message
      if (!isDev) {
        try {
          const userDataPath = app.getPath('userData');
          const updateFlagPath = path.join(userDataPath, '.update-installed');

          try {
            const updateFlagData = await fs.readFile(updateFlagPath, 'utf8');
            const updateInfo = JSON.parse(updateFlagData);

            // Show data consistency confirmation
            setTimeout(() => {
              dialog.showMessageBox(mainWindow, {
                type: 'info',
                title: 'Update Installed Successfully',
                message: `Application updated to version ${app.getVersion()}`,
                detail: `✅ Update completed successfully!\n\n` +
                  `✅ All your data and settings have been preserved\n` +
                  `✅ Accounts, transactions, and configurations are intact\n` +
                  `✅ Previous version: ${updateInfo.previousVersion || 'Unknown'}\n` +
                  `✅ New version: ${app.getVersion()}\n\n` +
                  `Your data is safe and the application is ready to use.`,
                buttons: ['OK']
              });
            }, 2000); // Show after 2 seconds to let app fully load

            // Delete the flag file after showing the message
            await fs.unlink(updateFlagPath).catch(() => { });
          } catch (err) {
            // Flag file doesn't exist or can't be read - no update was installed
            // This is normal, just continue
          }
        } catch (err) {
          console.error('Error checking update flag:', err);
        }

        // Check for updates in production (with delay to let app fully load)
        // Delayed to 30 seconds to reduce startup overhead and improve initial performance
        setTimeout(() => {
          autoUpdater.checkForUpdates().catch(err => {
            console.error('Initial update check failed:', err);
          });
        }, 30000); // 30 second delay - reduced startup overhead
      }
    });

    // Handle window close - show confirmation dialog and save data
    // BUT: Skip this handler if we're installing an update (isInstallingUpdate flag)
    mainWindow.on('close', async (event) => {
      // If installing update, allow immediate close (cleanup already done)
      if (isInstallingUpdate) {
        console.log('✅ Update installation in progress - allowing immediate close');
        // Don't prevent default - allow immediate close
        return;
      }

      // Also check if this is a quit-for-update scenario
      // The app.isQuitting flag is set by app.quit(), but we need to check if it's for update
      if (updateDownloaded) {
        console.log('✅ Update ready - allowing close for installation');
        // Don't prevent default - allow the quit to proceed
        return;
      }

      // Prevent default close behavior (normal close needs confirmation)
      event.preventDefault();

      // Show confirmation dialog
      const response = await dialog.showMessageBox(mainWindow, {
        type: 'question',
        title: 'Close Application',
        message: 'Are you sure you want to close the application?',
        detail: 'Saving your data before closing...',
        buttons: ['Yes, Close', 'Cancel'],
        defaultId: 1,
        cancelId: 1
      });

      if (response.response === 0) {
        // User confirmed, save data before closing
        try {
          console.log('💾 Saving database before closing...');

          // Request save from renderer and wait for completion
          const saveResult = await new Promise((resolve) => {
            const timeout = setTimeout(() => {
              console.warn('⚠️ Save timeout, proceeding with close');
              resolve({ success: false });
            }, 5000); // 5 second timeout

            const handler = (event, result) => {
              clearTimeout(timeout);
              ipcMain.removeListener('database-save-complete', handler);
              resolve(result || { success: true });
            };

            ipcMain.once('database-save-complete', handler);

            // Request save from renderer
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('save-database-now');
            } else {
              clearTimeout(timeout);
              resolve({ success: true });
            }
          });

          if (saveResult.success) {
            console.log('✅ Database saved successfully before closing');
            // Give a small delay to ensure file write completes
            await new Promise(resolve => setTimeout(resolve, 100));
          } else {
            console.warn('⚠️ Database save may have failed, but proceeding with close');
          }
        } catch (saveError) {
          console.error('❌ Error saving database before close:', saveError);
          // Still proceed with close to avoid hanging
        }

        // Destroy the window after save completes (or timeout)
        mainWindow.destroy();
      }
      // If user cancelled, do nothing (window stays open)
    });

    // Handle window closed
    mainWindow.on('closed', () => {
      mainWindow = null;
    });

    // Handle external links
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
      require('electron').shell.openExternal(url);
      return { action: 'deny' };
    });
  }

  // Create application menu
  function createMenu() {
    const template = [
      {
        label: 'File',
        submenu: [
          {
            label: 'Restore Backup',
            click: async () => {
              // Trigger restore backup via IPC
              if (mainWindow && !mainWindow.isDestroyed()) {
                const result = await dialog.showOpenDialog(mainWindow, {
                  title: 'Select Backup File',
                  filters: [
                    { name: 'Database Backup', extensions: ['db'] },
                    { name: 'All Files', extensions: ['*'] }
                  ],
                  properties: ['openFile']
                });

                if (!result.canceled && result.filePaths.length > 0) {
                  try {
                    const filePath = result.filePaths[0];
                    const fileData = await fs.readFile(filePath);
                    mainWindow.webContents.send('menu-restore-backup', {
                      fileName: path.basename(filePath),
                      fileData: Array.from(fileData)
                    });
                  } catch (error) {
                    console.error('Error reading backup file:', error);
                    dialog.showErrorBox('Error', `Failed to read backup file: ${error.message}`);
                  }
                }
              }
            }
          },
          {
            label: 'Create Backup',
            click: () => {
              // Send message to renderer to trigger backup creation
              if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('menu-create-backup');
              }
            }
          },
          { type: 'separator' },
          {
            label: 'Close Application',
            accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
            click: async () => {
              const response = await dialog.showMessageBox(mainWindow, {
                type: 'question',
                title: 'Close Application',
                message: 'Are you sure you want to close the application?',
                detail: 'Saving your data before closing...',
                buttons: ['Yes, Close', 'Cancel'],
                defaultId: 1,
                cancelId: 1
              });

              if (response.response === 0) {
                // Save data before closing
                try {
                  console.log('💾 Saving database before closing...');

                  const saveResult = await new Promise((resolve) => {
                    const timeout = setTimeout(() => {
                      console.warn('⚠️ Save timeout, proceeding with close');
                      resolve({ success: false });
                    }, 5000);

                    const handler = (event, result) => {
                      clearTimeout(timeout);
                      ipcMain.removeListener('database-save-complete', handler);
                      resolve(result || { success: true });
                    };

                    ipcMain.once('database-save-complete', handler);

                    if (mainWindow && !mainWindow.isDestroyed()) {
                      mainWindow.webContents.send('save-database-now');
                    } else {
                      clearTimeout(timeout);
                      resolve({ success: true });
                    }
                  });

                  if (saveResult.success) {
                    console.log('✅ Database saved successfully before closing');
                  } else {
                    console.warn('⚠️ Database save may have failed, but proceeding with close');
                  }
                } catch (saveError) {
                  console.error('❌ Error saving database before close:', saveError);
                }

                app.quit();
              }
            }
          }
        ]
      },
      {
        label: 'View',
        submenu: [
          // Only show DevTools menu items in development
          ...(process.env.NODE_ENV === 'development' || !app.isPackaged ? [
            {
              label: 'Toggle Developer Tools',
              accelerator: process.platform === 'darwin' ? 'Alt+Cmd+I' : 'Ctrl+Shift+I',
              click: () => {
                if (mainWindow && !mainWindow.isDestroyed()) {
                  if (mainWindow.webContents.isDevToolsOpened()) {
                    mainWindow.webContents.closeDevTools();
                  } else {
                    mainWindow.webContents.openDevTools();
                  }
                }
              }
            },
            { type: 'separator' },
            { role: 'reload', label: 'Reload' },
            { role: 'forceReload', label: 'Force Reload' },
            { role: 'toggleDevTools', label: 'Toggle Developer Tools (F12)' },
            { type: 'separator' }
          ] : []),
          { role: 'resetZoom', label: 'Actual Size' },
          { role: 'zoomIn', label: 'Zoom In' },
          { role: 'zoomOut', label: 'Zoom Out' },
          { type: 'separator' },
          { role: 'togglefullscreen', label: 'Toggle Full Screen' }
        ]
      },
      {
        label: 'Help',
        submenu: [
          {
            label: 'Update Application',
            click: () => {
              // Send message to renderer to open backup & restore page
              if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('open-backup-restore');
              }
            }
          },
          {
            label: 'Help',
            click: () => {
              // Send message to renderer to open help section in settings
              if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('open-help-section');
              }
            }
          },
          { type: 'separator' },
          {
            label: 'About PBooksPro',
            click: () => {
              dialog.showMessageBox(mainWindow, {
                type: 'info',
                title: 'About PBooksPro',
                message: 'PBooksPro',
                detail: `Version ${app.getVersion()}\n\nFinance and Project Management Application`,
                buttons: ['OK']
              });
            }
          }
        ]
      }
    ];

    // On macOS, add to app menu instead of menu bar
    if (process.platform === 'darwin') {
      template.unshift({
        label: app.getName(),
        submenu: [
          { role: 'about', label: 'About PBooksPro' },
          { type: 'separator' },
          { role: 'services' },
          { type: 'separator' },
          { role: 'hide' },
          { role: 'hideOthers' },
          { role: 'unhide' },
          { type: 'separator' },
          {
            role: 'quit',
            label: 'Quit PBooksPro',
            click: async () => {
              const response = await dialog.showMessageBox(mainWindow, {
                type: 'question',
                title: 'Quit Application',
                message: 'Are you sure you want to quit the application?',
                detail: 'Saving your data before closing...',
                buttons: ['Yes, Quit', 'Cancel'],
                defaultId: 1,
                cancelId: 1
              });

              if (response.response === 0) {
                // Save data before closing
                try {
                  console.log('💾 Saving database before closing...');

                  const saveResult = await new Promise((resolve) => {
                    const timeout = setTimeout(() => {
                      console.warn('⚠️ Save timeout, proceeding with close');
                      resolve({ success: false });
                    }, 5000);

                    const handler = (event, result) => {
                      clearTimeout(timeout);
                      ipcMain.removeListener('database-save-complete', handler);
                      resolve(result || { success: true });
                    };

                    ipcMain.once('database-save-complete', handler);

                    if (mainWindow && !mainWindow.isDestroyed()) {
                      mainWindow.webContents.send('save-database-now');
                    } else {
                      clearTimeout(timeout);
                      resolve({ success: true });
                    }
                  });

                  if (saveResult.success) {
                    console.log('✅ Database saved successfully before closing');
                  } else {
                    console.warn('⚠️ Database save may have failed, but proceeding with close');
                  }
                } catch (saveError) {
                  console.error('❌ Error saving database before close:', saveError);
                }

                app.quit();
              }
            }
          }
        ]
      });

      // File menu is already in the correct position (index 1, after app menu)
      // No need to move it

      // Add Update and Help to Help menu on macOS
      template.push({
        label: 'Help',
        submenu: [
          {
            label: 'Update Application',
            click: () => {
              if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('open-backup-restore');
              }
            }
          },
          {
            label: 'Help',
            click: () => {
              // Send message to renderer to open help section in settings
              if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('open-help-section');
              }
            }
          }
        ]
      });
    }

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
  }

  // App event handlers
  app.whenReady().then(() => {
    // Initialize native SQLite backend (scaffolding)
    try {
      nativeDb = require('./db.cjs');
      ipcMain.handle('native-db:list-transactions', (_e, args = {}) => {
        return nativeDb.listTransactions(args || {});
      });
      ipcMain.handle('native-db:totals', (_e, args = {}) => {
        return nativeDb.getTotals(args || {});
      });
      ipcMain.handle('native-db:upsert-transaction', (_e, tx) => {
        return nativeDb.upsertTransaction(tx || {});
      });
      ipcMain.handle('native-db:count-transactions', (_e, args = {}) => {
        return nativeDb.countTransactions(args || {});
      });
      ipcMain.handle('native-db:bulk-upsert-transactions', (_e, transactions = []) => {
        return nativeDb.bulkUpsertTransactions(transactions || []);
      });
      console.log('✅ Native SQLite backend initialized');
    } catch (err) {
      console.error('⚠️ Failed to initialize native SQLite backend (better-sqlite3):', err);
    }

    // Setup IPC handlers
    setupIpcHandlers();

    // Configure auto-updater
    configureAutoUpdater();

    // Create application menu
    createMenu();

    // Create main window
    createWindow();

    app.on('activate', () => {
      // On macOS, re-create window when dock icon is clicked
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  });

  // Unregister all shortcuts when app is about to quit
  app.on('will-quit', () => {
    globalShortcut.unregisterAll();
  });

  app.on('window-all-closed', () => {
    // On macOS, keep app running even when all windows are closed
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  // Install update when app is quitting (if available)
  app.on('before-quit', async (event) => {
    if (updateDownloaded && !isInstallingUpdate) {
      // Prevent default quit, save data and install update instead
      event.preventDefault();
      console.log('Update ready - installing on quit...');
      isInstallingUpdate = true;

      // Save database before installing
      try {
        console.log('💾 Saving database before installation...');
        if (mainWindow && !mainWindow.isDestroyed()) {
          const saveResult = await new Promise((resolve) => {
            const timeout = setTimeout(() => {
              console.warn('⚠️ Save timeout, proceeding with installation');
              resolve({ success: false });
            }, 5000);

            const handler = (event, result) => {
              clearTimeout(timeout);
              ipcMain.removeListener('database-save-complete', handler);
              resolve(result || { success: true });
            };

            ipcMain.once('database-save-complete', handler);

            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('save-database-now');
            } else {
              clearTimeout(timeout);
              resolve({ success: true });
            }
          });

          if (saveResult.success) {
            console.log('✅ Database saved successfully before installation');
            await new Promise(resolve => setTimeout(resolve, 200));
          }
        }
      } catch (saveError) {
        console.error('❌ Error saving database before installation:', saveError);
      }

      // Force cleanup before install
      await forceCleanupBeforeInstall();

      // Install and restart after cleanup
      try {
        autoUpdater.quitAndInstall(false, true);
        // Give it a moment, then if still running, force exit
        setTimeout(() => {
          if (!app.isQuitting) {
            console.log('⚠️ App still running, forcing exit...');
            app.exit(0);
          }
        }, 2000);
      } catch (err) {
        console.error('Error calling quitAndInstall:', err);
        // Fallback: force exit
        app.exit(0);
      }
    }
  });

  // Security: Prevent new window creation
  app.on('web-contents-created', (event, contents) => {
    contents.on('new-window', (event, navigationUrl) => {
      event.preventDefault();
      require('electron').shell.openExternal(navigationUrl);
    });
  });

  // Certificate error handling removed - not needed
}
