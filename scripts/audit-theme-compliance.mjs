#!/usr/bin/env node
/**
 * PBooks Pro — theme compliance audit.
 * Scans TS/TSX for hardcoded colors that should use design tokens.
 *
 * Usage:
 *   node scripts/audit-theme-compliance.mjs
 *   node scripts/audit-theme-compliance.mjs --json
 *   node scripts/audit-theme-compliance.mjs --fail-on-warn  (exit 1 if violations found)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const SCAN_DIRS = ['components', 'hooks', 'context', 'modules', 'design-system'];
const EXT = /\.(tsx|ts)$/;

const IGNORE_DIRS = new Set(['node_modules', 'dist', 'release', 'release-api-client', 'release-api-server']);

/** Patterns that indicate hardcoded theme colors (not data/chart series colors) */
const PATTERNS = [
  { id: 'bg-white', re: /\bbg-white\b/ },
  { id: 'text-black', re: /\btext-black\b/ },
  { id: 'hex-white', re: /#(?:fff|ffffff)\b/i },
  { id: 'hex-black', re: /#(?:000|000000)\b/i },
  { id: 'bg-gray', re: /\bbg-gray-\d+/ },
  { id: 'text-gray', re: /\btext-gray-\d+/ },
  { id: 'border-gray', re: /\bborder-gray-\d+/ },
  { id: 'bg-slate', re: /\bbg-slate-\d+/ },
  { id: 'text-slate', re: /\btext-slate-\d+/ },
  { id: 'border-slate', re: /\bborder-slate-\d+/ },
  { id: 'css-white', re: /background(?:-color)?:\s*(?:white|#fff)\b/i },
  { id: 'css-black', re: /color:\s*(?:black|#000)\b/i },
];

/** Files exempt from audit (print CSS, tests, bootstrap error UI) */
const EXEMPT_FILES = new Set([
  'utils/elementToPdf.ts',
  'hooks/usePrintForm.ts',
  'components/reports/ownerLedgerPrint.css.ts',
  'components/reports/ownerRentalIncomePrint.css.ts',
  'components/print/PrintLayout.tsx',
  'components/print/ReportLayout.tsx',
  'tests/profitLossEngine.test.ts',
  'components/analytics/chartTheme.ts',
]);

/** Line-level exemptions */
function isExemptLine(line) {
  if (line.includes('print-color-adjust') || line.includes('@media print')) return true;
  if (line.includes('data-series') || line.includes('chart palette')) return true;
  if (line.trim().startsWith('//') || line.trim().startsWith('*')) return true;
  return false;
}

function walk(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (IGNORE_DIRS.has(ent.name)) continue;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(full, files);
    else if (EXT.test(ent.name)) files.push(full);
  }
  return files;
}

function rel(p) {
  return path.relative(root, p).replace(/\\/g, '/');
}

function auditFile(filePath) {
  const relPath = rel(filePath);
  if (EXEMPT_FILES.has(relPath)) return [];

  const lines = fs.readFileSync(filePath, 'utf8').split('\n');
  const hits = [];

  lines.forEach((line, i) => {
    if (isExemptLine(line)) return;
    const hasDarkVariant = /\bdark:/.test(line);
    for (const { id, re } of PATTERNS) {
      if (re.test(line)) {
        hits.push({
          file: relPath,
          line: i + 1,
          pattern: id,
          lightOnly: !hasDarkVariant,
          text: line.trim().slice(0, 120),
          suggestion: suggestToken(id),
        });
      }
    }
  });

  return hits;
}

function suggestToken(patternId) {
  const map = {
    'bg-white': 'bg-app-card | bg-app-modal | ds-card',
    'text-black': 'text-app-text',
    'hex-white': 'var(--card-bg) or app-* token',
    'hex-black': 'var(--text-primary)',
    'bg-gray': 'bg-app-card | bg-app-table-header',
    'text-gray': 'text-app-text | text-app-muted',
    'border-gray': 'border-app-border',
    'bg-slate': 'bg-app-card | bg-app-surface-2',
    'text-slate': 'text-app-text | text-app-muted',
    'border-slate': 'border-app-border',
    'css-white': 'var(--card-bg)',
    'css-black': 'var(--text-primary)',
  };
  return map[patternId] ?? 'design-system token';
}

const jsonOut = process.argv.includes('--json');
const failOnWarn = process.argv.includes('--fail-on-warn');

const allFiles = SCAN_DIRS.flatMap((d) => walk(path.join(root, d)));
const violations = allFiles.flatMap(auditFile);

const byFile = new Map();
for (const v of violations) {
  if (!byFile.has(v.file)) byFile.set(v.file, []);
  byFile.get(v.file).push(v);
}

const lightOnlyViolations = violations.filter((v) => v.lightOnly);

const summary = {
  filesScanned: allFiles.length,
  filesWithViolations: byFile.size,
  totalViolations: violations.length,
  lightOnlyViolations: lightOnlyViolations.length,
  legacyDualThemeViolations: violations.length - lightOnlyViolations.length,
  byPattern: Object.fromEntries(
    PATTERNS.map((p) => [p.id, violations.filter((v) => v.pattern === p.id).length])
  ),
};

if (jsonOut) {
  console.log(JSON.stringify({ summary, violations }, null, 2));
} else {
  console.log('PBooks Pro — Theme Compliance Audit\n');
  console.log(`Files scanned:              ${summary.filesScanned}`);
  console.log(`Files with issues:          ${summary.filesWithViolations}`);
  console.log(`Total token violations:     ${summary.totalViolations}`);
  console.log(`  Light-only (high risk):   ${summary.lightOnlyViolations}`);
  console.log(`  Legacy dark: pairs:        ${summary.legacyDualThemeViolations}\n`);

  if (violations.length === 0) {
    console.log('✓ No hardcoded color violations detected in scanned paths.\n');
  } else {
    console.log('Top violations by pattern:');
    for (const [k, n] of Object.entries(summary.byPattern).sort((a, b) => b[1] - a[1])) {
      if (n > 0) console.log(`  ${k}: ${n}`);
    }
    console.log('\nSample findings (first 40):');
    violations.slice(0, 40).forEach((v) => {
      console.log(`  ${v.file}:${v.line} [${v.pattern}] → ${v.suggestion}`);
      console.log(`    ${v.text}`);
    });
    if (violations.length > 40) {
      console.log(`  … and ${violations.length - 40} more (run with --json for full report)`);
    }
    console.log('\nRemediation: use app-* / ds-* Tailwind tokens or themeTokens / useThemeColors().');
    console.log('Legacy slate/gray classes are partially remapped in index.css [data-theme="dark"].\n');
  }
}

if (failOnWarn && violations.length > 0) {
  process.exit(1);
}

process.exit(0);
