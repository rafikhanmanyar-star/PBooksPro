#!/usr/bin/env node
/**
 * Rebuild native modules for Electron.
 * better-sqlite3 is only rebuilt for deprecated offline SQLite builds.
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const offlineSqlite =
  process.argv.includes('--offline-sqlite') || process.env.PBOOKS_ENABLE_SQLITE === '1';

try {
  if (process.env.SKIP_NATIVE_REBUILD === '1' || process.env.RENDER === 'true' || process.env.CI === 'true') {
    console.log('⏭️  Skipping native rebuild (cloud/CI install — Electron not required)');
    process.exit(0);
  }

  if (!offlineSqlite) {
    console.log('⏭️  Skipping better-sqlite3 rebuild (PostgreSQL API client — use --offline-sqlite for legacy offline builds)');
    process.exit(0);
  }

  let electronPkg;
  try {
    electronPkg = require('electron/package.json');
  } catch {
    console.log('⏭️  Skipping native rebuild (Electron not installed)');
    process.exit(0);
  }

  const electronVersion = electronPkg.version;

  console.log(`🔨 Rebuilding better-sqlite3 for Electron ${electronVersion} (offline SQLite build)...`);

  try {
    execSync(`npx electron-rebuild -w better-sqlite3 --version ${electronVersion}`, {
      stdio: 'inherit',
      cwd: path.resolve(__dirname, '..'),
    });
    console.log('✅ Native modules rebuilt successfully');
  } catch (rebuildError) {
    if (rebuildError.message && rebuildError.message.includes('Visual Studio')) {
      console.warn('');
      console.warn('⚠️  Warning: Cannot rebuild from source (Visual Studio not found)');
      console.warn('   Install Visual Studio Build Tools if NODE_MODULE_VERSION errors occur.');
      console.warn('');
    } else {
      throw rebuildError;
    }
  }

  const betterSqlite3Path = path.resolve(
    __dirname,
    '..',
    'node_modules',
    'better-sqlite3',
    'build',
    'Release',
    'better_sqlite3.node'
  );
  if (fs.existsSync(betterSqlite3Path)) {
    const stats = fs.statSync(betterSqlite3Path);
    console.log(`✅ better-sqlite3 module found (${(stats.size / 1024).toFixed(2)} KB)`);
  } else {
    console.warn('⚠️  Warning: better-sqlite3 module not found.');
  }
} catch (error) {
  console.error('❌ Failed to rebuild native modules:', error.message);
  process.exit(1);
}
