const { app, BrowserWindow, ipcMain, dialog, Menu, shell } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const { autoUpdater } = require('electron-updater');

// Comprehensive error handling for Electron main process
function setupElectronErrorHandlers() {
  // Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception in main process:', error);
    // Log to file if possible
    try {
      const logPath = path.join(app.getPath('userData'), 'error.log');
      const logMessage = `[${new Date().toISOString()}] Uncaught Exception: ${error.message}\n${error.stack}\n\n`;
      fs.appendFile(logPath, logMessage).catch(() => {});
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
      fs.appendFile(logPath, logMessage).catch(() => {});
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
    // Enable auto-download for seamless background updates
    autoUpdater.autoDownload = true;
    
    // Allow downgrade (useful for testing)
    autoUpdater.allowDowngrade = false;

    // Check for pre-release updates
    autoUpdater.allowPrerelease = false;

    // Auto-updater events
    autoUpdater.on('checking-for-update', () => {
      console.log('Checking for update...');
      sendStatusToWindow('update-checking');
    });

    autoUpdater.on('update-available', (info) => {
      console.log('Update available:', info.version);
      updateAvailable = true;
      updateInfo = info;
      sendStatusToWindow('update-available', {
        version: info.version,
        releaseDate: info.releaseDate,
        releaseNotes: info.releaseNotes
      });
      // Auto-download will start automatically since autoDownload is true
      console.log('Starting background download...');
    });

    autoUpdater.on('update-not-available', (info) => {
      console.log('No update available. Current version:', info.version);
      sendStatusToWindow('update-not-available', {
        version: info.version
      });
    });

    autoUpdater.on('error', (err) => {
      console.error('Auto-updater error:', err);
      
      // Check if it's a 404 error (file not found on server)
      let userFriendlyMessage = err.message || 'Unknown error occurred';
      let errorType = 'unknown';
      
      if (err.message && err.message.includes('404')) {
        userFriendlyMessage = 'Update file not found on server. The update may not be available yet. Please try again later or contact support.';
        errorType = 'file_not_found';
      } else if (err.message && err.message.includes('status 404')) {
        userFriendlyMessage = 'Update file not found on server. The update may not be available yet. Please try again later or contact support.';
        errorType = 'file_not_found';
      } else if (err.message && err.message.includes('ENOTFOUND') || err.message && err.message.includes('ECONNREFUSED')) {
        userFriendlyMessage = 'Cannot connect to update server. Please check your internet connection and try again.';
        errorType = 'connection_error';
      } else if (err.message && err.message.includes('timeout')) {
        userFriendlyMessage = 'Update server connection timed out. Please check your internet connection and try again.';
        errorType = 'timeout';
      }
      
      sendStatusToWindow('update-error', {
        message: userFriendlyMessage,
        originalMessage: err.message,
        errorType: errorType,
        stack: err.stack
      });
    });

    autoUpdater.on('download-progress', (progressObj) => {
      const logMessage = `Download speed: ${formatBytes(progressObj.bytesPerSecond)}/s - Downloaded ${progressObj.percent.toFixed(1)}% (${formatBytes(progressObj.transferred)}/${formatBytes(progressObj.total)})`;
      console.log(logMessage);
      sendStatusToWindow('download-progress', {
        bytesPerSecond: progressObj.bytesPerSecond,
        percent: progressObj.percent,
        transferred: progressObj.transferred,
        total: progressObj.total
      });
    });

    autoUpdater.on('update-downloaded', (info) => {
      console.log('Update downloaded:', info.version);
      updateDownloaded = true;
      updateInfo = info;
      sendStatusToWindow('update-downloaded', {
        version: info.version,
        releaseDate: info.releaseDate,
        releaseNotes: info.releaseNotes
      });
      // Don't show blocking dialog - let user continue working
      // Update will be installed on next app quit or when user explicitly requests it
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
      try {
        const result = await autoUpdater.checkForUpdates();
        return {
          success: true,
          updateAvailable: updateAvailable,
          version: result?.updateInfo?.version
        };
      } catch (error) {
        console.error('Error checking for updates:', error);
        return {
          success: false,
          error: error.message
        };
      }
    });

    // Download update
    ipcMain.handle('download-update', async () => {
      try {
        if (!updateAvailable) {
          return { success: false, error: 'No update available to download' };
        }
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

      // Show confirmation dialog with data consistency information
      const userDataPath = app.getPath('userData');
      const response = await dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'Install Update',
        message: 'Ready to install update',
        detail: `Version ${updateInfo?.version || 'new version'} is ready to install.\n\n` +
                `✅ Your data and settings will be preserved\n` +
                `✅ All your accounts, transactions, and configurations will remain intact\n` +
                `✅ The application will restart automatically after installation\n\n` +
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
        // Install immediately
        console.log('Installing update immediately...');
        // Save a flag to show data consistency message on next startup
        try {
          const updateFlagPath = path.join(userDataPath, '.update-installed');
          await fs.writeFile(updateFlagPath, JSON.stringify({
            previousVersion: app.getVersion(),
            newVersion: updateInfo?.version || 'unknown',
            installedAt: new Date().toISOString()
          }), 'utf8');
        } catch (err) {
          console.error('Error saving update flag:', err);
        }
        autoUpdater.quitAndInstall(false, true);
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
        // Log to error file
        try {
          const logPath = path.join(app.getPath('userData'), 'error.log');
          const logMessage = `[${new Date().toISOString()}] Database read error: ${error.message}\n${error.stack}\n\n`;
          await fs.appendFile(logPath, logMessage).catch(() => {});
        } catch (logError) {
          // Ignore logging errors
        }
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
          await fs.unlink(tempPath).catch(() => {});
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
        allowRunningInsecureContent: false
      },
      icon: path.join(__dirname, '../build/icon.ico'),
      show: false,
      titleBarStyle: 'default',
      backgroundColor: '#f8fafc'
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
    }

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
            await fs.unlink(updateFlagPath).catch(() => {});
          } catch (err) {
            // Flag file doesn't exist or can't be read - no update was installed
            // This is normal, just continue
          }
        } catch (err) {
          console.error('Error checking update flag:', err);
        }

        // Check for updates in production (with delay to let app fully load)
        setTimeout(() => {
          autoUpdater.checkForUpdates().catch(err => {
            console.error('Initial update check failed:', err);
          });
        }, 5000); // 5 second delay
      }
    });

    // Handle window close - show confirmation dialog and save data
    mainWindow.on('close', async (event) => {
      // Prevent default close behavior
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
        label: 'Help',
        submenu: [
          {
            label: 'Update Application',
            click: () => {
              // Send message to renderer to open update settings
              if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('open-update-settings');
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
            label: 'About My Projects Pro',
            click: () => {
              dialog.showMessageBox(mainWindow, {
                type: 'info',
                title: 'About My Projects Pro',
                message: 'My Projects Pro',
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
          { role: 'about', label: 'About My Projects Pro' },
          { type: 'separator' },
          { role: 'services' },
          { type: 'separator' },
          { role: 'hide' },
          { role: 'hideOthers' },
          { role: 'unhide' },
          { type: 'separator' },
          { 
            role: 'quit', 
            label: 'Quit My Projects Pro',
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
                mainWindow.webContents.send('open-update-settings');
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

  app.on('window-all-closed', () => {
    // On macOS, keep app running even when all windows are closed
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  // Install update when app is quitting (if available)
  app.on('before-quit', (event) => {
    if (updateDownloaded) {
      // Prevent default quit, install update instead
      event.preventDefault();
      console.log('Update ready - installing on quit...');
      // Silent install and restart
      autoUpdater.quitAndInstall(false, true);
    }
  });

  // Security: Prevent new window creation
  app.on('web-contents-created', (event, contents) => {
    contents.on('new-window', (event, navigationUrl) => {
      event.preventDefault();
      require('electron').shell.openExternal(navigationUrl);
    });
  });

  // Handle certificate errors for development
  app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
    const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
    if (isDev) {
      // In development, ignore certificate errors
      event.preventDefault();
      callback(true);
    } else {
      // In production, use default behavior
      callback(false);
    }
  });
}
