#!/usr/bin/env node
/**
 * Cloud Performance Program — aggregate capture JSON into Optimization Roadmap draft.
 *
 * Usage:
 *   node scripts/perf/generate-optimization-roadmap.mjs \
 *     --captures docs/performance/cloud/captures/phase1-baseline.json,docs/performance/cloud/captures/phase5-scalability.json \
 *     --out docs/performance/cloud/reports/06-optimization-roadmap.md
 */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

function parseArgs(argv) {
  const out = { captures: [], outFile: 'docs/performance/cloud/reports/06-optimization-roadmap.md' };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--captures' && argv[i + 1]) out.captures = argv[++i].split(',').map((s) => s.trim()).filter(Boolean);
    else if (a === '--out' && argv[i + 1]) out.outFile = argv[++i];
  }
  return out;
}

function loadCapture(path) {
  try {
    return JSON.parse(readFileSync(resolve(process.cwd(), path), 'utf8'));
  } catch {
    return null;
  }
}

function collectBottlenecks(captures) {
  const items = [];

  for (const cap of captures) {
    if (!cap) continue;
    if (cap.slowestEndpoints) {
      for (const s of cap.slowestEndpoints) {
        items.push({
          source: cap.program ?? cap.phase ?? 'unknown',
          path: s.path ?? s.name,
          metric: 'p95Ms',
          value: s.p95Ms ?? s.maxMs ?? 0,
          impact: 'high',
        });
      }
    }
    if (cap.top10ByP95) {
      for (const s of cap.top10ByP95) {
        items.push({ source: 'phase5', path: s.path, metric: 'p95Ms', value: s.p95Ms, impact: 'high' });
      }
    }
    if (cap.endpoints) {
      for (const e of cap.endpoints) {
        if ((e.coldMs ?? 0) >= 2000) {
          items.push({ source: 'dashboard', path: e.path, metric: 'coldMs', value: e.coldMs, impact: 'medium' });
        }
      }
    }
    if (cap.peakWaitingCount >= 5) {
      items.push({
        source: 'pool',
        path: 'connection pool',
        metric: 'peakWaitingCount',
        value: cap.peakWaitingCount,
        impact: 'critical',
      });
    }
  }

  const seen = new Set();
  return items
    .filter((i) => {
      const key = `${i.path}:${i.metric}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
    .slice(0, 10);
}

function main() {
  const args = parseArgs(process.argv);
  const captures = args.captures.map(loadCapture).filter(Boolean);
  const bottlenecks = collectBottlenecks(captures);

  const lines = [
    '# Optimization Roadmap (Draft)',
    '',
    '**Program:** Cloud Performance & Scalability',
    `**Generated:** ${new Date().toISOString()}`,
    '',
    '> Measurement-only phase complete. Do **not** implement fixes until baseline reports are reviewed and signed off.',
    '',
    '## Top 10 bottlenecks (ranked by measured impact)',
    '',
    '| Rank | Area | Metric | Value | Proposed investigation | Status |',
    '|---:|---|---|---:|---|---|',
  ];

  bottlenecks.forEach((b, i) => {
    lines.push(`| ${i + 1} | ${b.path} | ${b.metric} | ${Math.round(b.value)} | TBD after baseline review | **deferred** |`);
  });

  if (bottlenecks.length === 0) {
    lines.push('| — | — | — | — | Run capture scripts first | pending |');
  }

  lines.push(
    '',
    '## Optimization categories (post-baseline only)',
    '',
    '1. **Startup deduplication** — license-status ×4, double bulk refresh',
    '2. **Pool capacity** — PG_POOL_MAX, shed threshold, bulk concurrency',
    '3. **Dashboard SQL** — computeSnapshot parallel queries, cache TTL tuning',
    '4. **Bootstrap payload** — bulk-chunked entity ordering and payload size',
    '5. **Deferred loading** — shell widgets, payroll tail, procurement pins',
    '',
    '## Gate checklist before any fix',
    '',
    '- [ ] Phase 1 baseline signed off',
    '- [ ] Phase 2 startup matrix reviewed',
    '- [ ] Phase 3 pool analysis on Render production/staging',
    '- [ ] Phase 4 dashboard cold/warm documented',
    '- [ ] Phase 5 large-tenant comparison captured',
    '- [ ] Stakeholder approval to begin optimization sprint',
    ''
  );

  const outPath = resolve(process.cwd(), args.outFile);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, lines.join('\n'), 'utf8');
  console.error(`Wrote ${outPath}`);
}

main();
