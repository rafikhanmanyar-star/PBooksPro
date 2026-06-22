#!/usr/bin/env node
/**
 * Cloud Performance Program — Phase 2: Startup Request Matrix generator.
 *
 * Reads client export JSON from __PBOOKS_EXPORT_STARTUP_PERF__() and produces
 * a Startup Request Matrix markdown report.
 *
 * Usage:
 *   node scripts/perf/cloud-startup-request-matrix.mjs \
 *     --in docs/performance/cloud/captures/startup-client.json \
 *     --out docs/performance/cloud/reports/02-startup-request-matrix.md
 */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

function parseArgs(argv) {
  const out = {
    inFile: '',
    outFile: 'docs/performance/cloud/reports/02-startup-request-matrix.md',
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--in' && argv[i + 1]) out.inFile = argv[++i];
    else if (a === '--out' && argv[i + 1]) out.outFile = argv[++i];
    else if (a === '--help') {
      console.log('Usage: node scripts/perf/cloud-startup-request-matrix.mjs --in startup.json [--out report.md]');
      process.exit(0);
    }
  }
  return out;
}

function aggregateRequests(requests) {
  const map = new Map();
  for (const r of requests) {
    const key = `${r.method ?? 'GET'} ${r.normalizedPath ?? r.path}`;
    const prev = map.get(key) ?? {
      method: r.method ?? 'GET',
      path: r.normalizedPath ?? r.path,
      count: 0,
      totalMs: 0,
      maxMs: 0,
      classification: r.classification ?? 'unknown',
      phase: r.phase ?? 'unknown',
    };
    prev.count += 1;
    prev.totalMs += r.durationMs ?? 0;
    prev.maxMs = Math.max(prev.maxMs, r.durationMs ?? 0);
    map.set(key, prev);
  }
  return [...map.values()].sort((a, b) => b.totalMs - a.totalMs);
}

function main() {
  const args = parseArgs(process.argv);
  if (!args.inFile) {
    console.error('Missing --in path to client startup JSON export.');
    process.exit(1);
  }

  const raw = JSON.parse(readFileSync(resolve(process.cwd(), args.inFile), 'utf8'));
  const requests = raw.requests ?? [];
  const aggregated = aggregateRequests(requests);
  const capturedAt = raw.capturedAt ?? new Date().toISOString();

  const byClass = { required: [], optional: [], duplicate: [], legacy: [], unknown: [] };
  for (const row of aggregated) {
    const bucket = byClass[row.classification] ?? byClass.unknown;
    bucket.push(row);
  }

  const lines = [
    '# Startup Request Matrix',
    '',
    `**Program:** Cloud Performance & Scalability · **Phase 2**`,
    `**Captured:** ${capturedAt}`,
    `**Total API requests:** ${raw.apiRequestCount ?? requests.length}`,
    `**Dashboard ready (ms):** ${raw.milestones?.dashboard_ready ?? raw.totalLoadMs ?? '—'}`,
    '',
    '## Milestones (client)',
    '',
    '| Milestone | Elapsed (ms) |',
    '|-----------|-------------:|',
  ];

  for (const [k, v] of Object.entries(raw.milestones ?? {})) {
    lines.push(`| ${k} | ${v ?? '—'} |`);
  }

  lines.push('', '## Request inventory (aggregated)', '', '| Phase | Method | Path | Count | Total ms | Max ms | Class |', '|---|---|---|---:|---:|---:|---|');
  for (const row of aggregated) {
    lines.push(`| ${row.phase} | ${row.method} | ${row.path} | ${row.count} | ${Math.round(row.totalMs)} | ${Math.round(row.maxMs)} | ${row.classification} |`);
  }

  for (const [cls, rows] of Object.entries(byClass)) {
    if (rows.length === 0) continue;
    lines.push('', `## ${cls.charAt(0).toUpperCase() + cls.slice(1)} (${rows.length})`, '');
    for (const row of rows) {
      lines.push(`- \`${row.method} ${row.path}\` ×${row.count} — max ${Math.round(row.maxMs)}ms`);
    }
  }

  if (raw.duplicatePaths?.length) {
    lines.push('', '## Duplicate hotspots', '');
    for (const d of raw.duplicatePaths) {
      lines.push(`- \`${d.path}\` called **${d.count}×**`);
    }
  }

  lines.push('', '## Classification legend', '', '| Class | Meaning |', '|---|---|', '| **required** | Must run for login→dashboard |', '| **optional** | Improves UX but deferrable |', '| **duplicate** | Same data fetched multiple times |', '| **legacy** | Superseded endpoint still reachable |', '');

  const outPath = resolve(process.cwd(), args.outFile);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, lines.join('\n'), 'utf8');
  console.error(`Wrote ${outPath}`);
}

main();
