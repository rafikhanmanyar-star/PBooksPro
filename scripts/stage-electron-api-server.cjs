/**
 * Stage backend + migrations next to root package.json for PBooks Pro API Server (Electron).
 * Output: build/electron-api-server/ (consumed by electron-builder extraResources).
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = path.join(__dirname, '..');
const out = path.join(root, 'build', 'electron-api-server');
const backendSrc = path.join(root, 'backend');
const migrationsSrc = path.join(root, 'database', 'migrations');
const isStaging = process.env.PBOOKS_STAGE_API_SERVER === '1';

function rmrf(p) {
  if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true });
}

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const name of fs.readdirSync(from)) {
    const s = path.join(from, name);
    const d = path.join(to, name);
    const st = fs.statSync(s);
    if (st.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

const PRUNE_DIR_NAMES = new Set([
  'test',
  'tests',
  '__tests__',
  'docs',
  'doc',
  'example',
  'examples',
  '.github',
]);

/** Drop TypeScript typings, docs, tests, and other dev-only bulk from staged production node_modules. */
function pruneStagedNodeModules(nmRoot, { removeCloudBackupSdks = false } = {}) {
  if (!fs.existsSync(nmRoot)) return;

  if (removeCloudBackupSdks) {
    for (const name of ['@azure', '@aws-sdk', '@aws-crypto', '@smithy']) {
      rmrf(path.join(nmRoot, name));
    }
    console.log('Pruned cloud backup SDKs from staging API server bundle.');
  }

  // Type packages are compile-time only; safe to drop from all API server installers.
  for (const name of ['@types', '@typespec']) {
    rmrf(path.join(nmRoot, name));
  }

  const stack = [nmRoot];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const ent of entries) {
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        if (PRUNE_DIR_NAMES.has(ent.name.toLowerCase())) {
          rmrf(p);
        } else {
          stack.push(p);
        }
        continue;
      }
      if (ent.name.endsWith('.md') || ent.name.endsWith('.map')) {
        try {
          fs.unlinkSync(p);
        } catch (_) {}
      }
    }
  }
}

rmrf(out);
const backendOut = path.join(out, 'backend');
const dbOut = path.join(out, 'database', 'migrations');
fs.mkdirSync(dbOut, { recursive: true });

if (!fs.existsSync(path.join(backendSrc, 'dist', 'index.js'))) {
  console.error('backend/dist/index.js missing — run: npm run build --prefix backend');
  process.exit(1);
}

copyDir(path.join(backendSrc, 'dist'), path.join(backendOut, 'dist'));
fs.copyFileSync(path.join(backendSrc, 'package.json'), path.join(backendOut, 'package.json'));
if (fs.existsSync(path.join(backendSrc, 'package-lock.json'))) {
  fs.copyFileSync(path.join(backendSrc, 'package-lock.json'), path.join(backendOut, 'package-lock.json'));
}

for (const name of fs.readdirSync(migrationsSrc)) {
  if (!name.endsWith('.sql')) continue;
  fs.copyFileSync(path.join(migrationsSrc, name), path.join(dbOut, name));
}

fs.copyFileSync(path.join(root, 'package.json'), path.join(out, 'package.json'));

const envExample = isStaging
  ? `# PBooks Pro Staging API Server — copy to AppData backend/.env as .env (Open config folder in the app).
# Staging uses port 3001 so production API can stay on 3000 on the same PC.

DATABASE_URL=postgresql://postgres:@127.0.0.1:5432/pBookspro_Staging
JWT_SECRET=change-me-staging-secret-at-least-16-chars
PORT=3001
NODE_ENV=production
# Staging test logins skip MFA (production keeps MFA enforced)
DISABLE_MFA_ENFORCEMENT=true
# LAN staging: skip Paddle/subscription gates on POST (onboarding, etc.)
DISABLE_SUBSCRIPTION_ENFORCEMENT=true
SEED_STAGING=1
`
  : `# PBooks Pro API Server — copy to AppData backend/.env as .env (Open config folder in the app).
# Production database pbookspro on port 3000.

DATABASE_URL=postgresql://postgres:@127.0.0.1:5432/pbookspro
JWT_SECRET=change-me-to-a-long-random-string
PORT=3000
NODE_ENV=production
`;
fs.writeFileSync(path.join(backendOut, '.env.example'), envExample, 'utf8');

if (isStaging) {
  fs.writeFileSync(path.join(backendOut, '.pbooks-staging-api-server'), '1', 'utf8');
}

console.log('npm ci --omit=dev in staged backend...');
execSync('npm ci --omit=dev', { cwd: backendOut, stdio: 'inherit' });

console.log('Pruning staged node_modules...');
pruneStagedNodeModules(path.join(backendOut, 'node_modules'), {
  // Staging installer targets local PostgreSQL; cloud backup SDKs add ~28 MB uncompressed.
  removeCloudBackupSdks: isStaging,
});

console.log('Staged:', out);
