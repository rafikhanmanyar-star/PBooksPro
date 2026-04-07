#!/usr/bin/env node
/**
 * PBooks Pro — design system & theme smoke test (automated).
 * Run: node scripts/smoke-test-design-system.mjs
 * With production build: node scripts/smoke-test-design-system.mjs --build
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const requiredFiles = [
  'styles/design-tokens.css',
  'design-system/tokens.ts',
  'context/ThemeContext.tsx',
  'components/ui/Button.tsx',
  'components/ui/Input.tsx',
  'components/ui/Modal.tsx',
  'components/layout/Header.tsx',
  'index.css',
  'index.tsx',
  'tailwind.config.js',
];

const tokenSubstrings = [
  '--color-primary:',
  '--space-md:',
  '--radius-md:',
  '--shadow-card:',
  '--text-body-size:',
  '[data-theme="dark"]',
];

function fail(msg) {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
}

function checkFiles() {
  for (const f of requiredFiles) {
    const p = path.join(root, f);
    if (!fs.existsSync(p)) fail(`Missing file: ${f}`);
  }
}

function checkIndexCssImport() {
  const idx = fs.readFileSync(path.join(root, 'index.css'), 'utf8');
  if (!idx.includes('design-tokens.css')) {
    fail('index.css must @import ./styles/design-tokens.css');
  }
  if (!idx.includes('.ds-table') && !idx.includes('ds-card')) {
    fail('index.css should include design-system component classes (.ds-* )');
  }
}

function checkDesignTokens() {
  const css = fs.readFileSync(path.join(root, 'styles/design-tokens.css'), 'utf8');
  for (const s of tokenSubstrings) {
    if (!css.includes(s)) fail(`styles/design-tokens.css must contain: ${s}`);
  }
}

function checkThemeProvider() {
  const t = fs.readFileSync(path.join(root, 'index.tsx'), 'utf8');
  if (!t.includes('ThemeProvider')) fail('index.tsx must wrap app with ThemeProvider');
}

function checkHeaderToggle() {
  const h = fs.readFileSync(path.join(root, 'components/layout/Header.tsx'), 'utf8');
  if (!h.includes('toggleTheme') || !h.includes('useTheme')) {
    fail('Header.tsx should use useTheme + toggleTheme');
  }
}

function checkButtonUsesTokens() {
  const b = fs.readFileSync(path.join(root, 'components/ui/Button.tsx'), 'utf8');
  if (!b.includes('bg-ds-primary') && !b.includes('ds-primary')) {
    fail('Button.tsx should use design-system primary classes');
  }
}

function checkInputError() {
  const i = fs.readFileSync(path.join(root, 'components/ui/Input.tsx'), 'utf8');
  if (!i.includes('error?:')) fail('Input.tsx should support error prop');
  if (!i.includes('ds-input-error')) fail('Input.tsx should apply ds-input-error when needed');
}

function printManualChecklist() {
  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Manual smoke (Electron / browser)
 Run: npm run test:local-only   OR   npm run dev → open http://localhost:5173
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 1. Theme: header moon/sun toggles light ↔ dark; UI stays readable.
 2. Persistence: set dark → reload app → still dark (localStorage "theme").
 3. Settings → Preferences → General → Appearance: matches header toggle.
 4. Modal: open any modal (e.g. search ⌘K) — backdrop + panel, both themes.
 5. Data: open General Ledger or a table — borders/rows visible in dark mode.
 6. Optional: form field with error — red border + message if you test Input error={...}.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);
}

const runBuild = process.argv.includes('--build');

console.log('PBooks Pro — design system smoke test\n');

try {
  checkFiles();
  checkIndexCssImport();
  checkDesignTokens();
  checkThemeProvider();
  checkHeaderToggle();
  checkButtonUsesTokens();
  checkInputError();
} catch (e) {
  fail(e.message || String(e));
}

console.log('✓ Automated checks passed (files, tokens, ThemeProvider, Header, Button, Input).\n');

if (runBuild) {
  console.log('Running npm run build ...\n');
  execSync('npm run build', { cwd: root, stdio: 'inherit' });
  console.log('\n✓ Vite production build succeeded.\n');
} else {
  console.log('(Skip full build; pass --build to run npm run build)\n');
}

printManualChecklist();
process.exit(0);
