#!/usr/bin/env node
/**
 * Rebuild native modules for Electron.
 * better-sqlite3 is no longer used by the application client (PostgreSQL-only).
 * This script is a no-op; kept for npm script compatibility.
 */
console.log('⏭️  Skipping native rebuild (PostgreSQL API client — better-sqlite3 not used)');
