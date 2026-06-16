/**
 * Seed Pakland presentation data (cloud production or staging).
 *
 *   node scripts/seed-pakland-demo.mjs --production
 *   node scripts/seed-pakland-demo.mjs --production --tenant pakland-001
 */
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
const child = spawnSync(
  process.execPath,
  [resolve(process.cwd(), 'node_modules/tsx/dist/cli.mjs'), resolve(process.cwd(), 'backend/src/scripts/seedPaklandDemo.ts'), ...args],
  { stdio: 'inherit', cwd: process.cwd(), env: process.env }
);
process.exit(child.status ?? 1);
