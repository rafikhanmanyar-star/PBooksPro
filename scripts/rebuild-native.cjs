#!/usr/bin/env node
/**
 * Rebuild native modules for Electron
 * Explicitly uses the installed Electron version to ensure correct rebuild
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

try {
  // Get the installed Electron version
  const electronPkg = require('electron/package.json');
  const electronVersion = electronPkg.version;
  
  console.log(`🔨 Rebuilding native modules for Electron ${electronVersion}...`);
  console.log(`   (This ensures better-sqlite3 is compiled for Electron's Node.js version)`);
  
  // Run electron-rebuild with explicit version
  try {
    execSync(`npx electron-rebuild --version ${electronVersion}`, {
      stdio: 'inherit',
      cwd: path.resolve(__dirname, '..'),
    });
    console.log('✅ Native modules rebuilt successfully');
  } catch (rebuildError) {
    // Check if it's a Visual Studio error
    if (rebuildError.message && rebuildError.message.includes('Visual Studio')) {
      console.warn('');
      console.warn('⚠️  Warning: Cannot rebuild from source (Visual Studio not found)');
      console.warn('   electron-rebuild will attempt to use prebuilt binaries.');
      console.warn('   If you encounter NODE_MODULE_VERSION errors, install Visual Studio Build Tools:');
      console.warn('   https://visualstudio.microsoft.com/downloads/#build-tools-for-visual-studio-2022');
      console.warn('');
      // Don't fail - prebuilt binaries might work
    } else {
      throw rebuildError;
    }
  }
  
  // Verify better-sqlite3 module exists
  const betterSqlite3Path = path.resolve(__dirname, '..', 'node_modules', 'better-sqlite3', 'build', 'Release', 'better_sqlite3.node');
  if (fs.existsSync(betterSqlite3Path)) {
    const stats = fs.statSync(betterSqlite3Path);
    console.log(`✅ better-sqlite3 module found (${(stats.size / 1024).toFixed(2)} KB)`);
  } else {
    console.warn('⚠️  Warning: better-sqlite3 module not found. You may need to install Visual Studio Build Tools.');
  }
} catch (error) {
  console.error('❌ Failed to rebuild native modules:', error.message);
  console.error('');
  console.error('If you see NODE_MODULE_VERSION errors when running the app:');
  console.error('1. Install Visual Studio Build Tools: https://visualstudio.microsoft.com/downloads/#build-tools-for-visual-studio-2022');
  console.error('2. Select "Desktop development with C++" during installation');
  console.error('3. Run: npm run rebuild:native');
  process.exit(1);
}
