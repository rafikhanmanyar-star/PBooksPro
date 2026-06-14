#!/usr/bin/env npx tsx
/**
 * Entry point for journal dimension backfill (delegates to backend script).
 * Run: npm run db:backfill-journal-dimensions -- [--tenant id | --all] [--dry-run]
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');

const result = spawnSync(
  'npm',
  ['run', 'backfill-journal-dimensions', '--prefix', 'backend', '--', ...process.argv.slice(2)],
  { stdio: 'inherit', cwd: root, shell: true }
);

process.exit(result.status ?? 1);
