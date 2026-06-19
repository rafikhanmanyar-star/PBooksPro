#!/usr/bin/env node
/**
 * A3 realtime hub CI gates — connect + core socket listener ownership.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const HUB_SOCKET_OWNER = new Set(['services/realtime/RealtimeDispatchHub.ts']);

const ALLOW_CONNECT = new Set([
  'core/socket.ts',
  'services/realtime/RealtimeDispatchHub.ts',
  'tests/RealtimeDispatchHub.test.ts',
]);

const SKIP_DIRS = new Set(['node_modules', 'dist', 'release', 'release-api-client', 'backend/dist']);

const SOCKET_LISTENER_GATES = [
  {
    label: 'Gate 2: entity_created listener ownership',
    pattern: /socket\.on\(\s*['"]entity_created['"]/,
  },
  {
    label: 'Gate 2: entity_updated listener ownership',
    pattern: /socket\.on\(\s*['"]entity_updated['"]/,
  },
  {
    label: 'Gate 2: entity_deleted listener ownership',
    pattern: /socket\.on\(\s*['"]entity_deleted['"]/,
  },
  {
    label: 'Gate 2: financial.posted listener ownership',
    pattern: /socket\.on\(\s*['"]financial\.posted['"]/,
  },
  {
    label: 'Gate 2: notification_created listener ownership',
    pattern: /socket\.on\(\s*['"]notification_created['"]/,
  },
  {
    label: 'Gate 3: approval_* listener ownership',
    pattern: /socket\.on\(\s*['"]approval_/,
  },
];

function walk(dir, files = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (SKIP_DIRS.has(name)) continue;
    const st = statSync(full);
    if (st.isDirectory()) walk(full, files);
    else if (/\.(ts|tsx)$/.test(name)) files.push(full);
  }
  return files;
}

function fail(msg) {
  console.error(`[verify:track-a3] ${msg}`);
  process.exit(1);
}

const sourceFiles = walk(ROOT);
const gateFailures = [];

const connectOffenders = [];
for (const file of sourceFiles) {
  const rel = relative(ROOT, file).replace(/\\/g, '/');
  const src = readFileSync(file, 'utf8');
  const withoutDisconnect = src.replace(/disconnectRealtimeSocket\s*\(/g, '');
  if (withoutDisconnect.includes('connectRealtimeSocket(') && !ALLOW_CONNECT.has(rel)) {
    connectOffenders.push(rel);
  }
}

if (connectOffenders.length > 0) {
  gateFailures.push(
    `Gate 1 (connectRealtimeSocket ownership) failed — allowed: core/socket.ts, RealtimeDispatchHub.ts, tests only:\n  ${connectOffenders.join('\n  ')}`
  );
}

for (const gate of SOCKET_LISTENER_GATES) {
  const offenders = [];
  for (const file of sourceFiles) {
    const rel = relative(ROOT, file).replace(/\\/g, '/');
    if (HUB_SOCKET_OWNER.has(rel)) continue;
    const src = readFileSync(file, 'utf8');
    if (gate.pattern.test(src)) {
      offenders.push(rel);
    }
  }
  if (offenders.length > 0) {
    gateFailures.push(
      `${gate.label} failed — RealtimeDispatchHub.ts must be sole production owner:\n  ${offenders.join('\n  ')}`
    );
  }
}

if (gateFailures.length > 0) {
  fail(gateFailures.join('\n\n'));
}

console.log('[verify:track-a3] Gate 1: connectRealtimeSocket ownership — passed');
for (const gate of SOCKET_LISTENER_GATES) {
  console.log(`[verify:track-a3] ${gate.label} — passed`);
}
console.log('[verify:track-a3] all hub ownership gates passed');
