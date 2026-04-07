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

const envExample = `# PBooks Pro API (Electron server) — copy to backend/.env next to the installed app resources.

DATABASE_URL=postgresql://USER:PASSWORD@127.0.0.1:5432/pbookspro
JWT_SECRET=change-me-to-a-long-random-string
PORT=3000
NODE_ENV=production
`;
fs.writeFileSync(path.join(backendOut, '.env.example'), envExample, 'utf8');

console.log('npm ci --omit=dev in staged backend...');
execSync('npm ci --omit=dev', { cwd: backendOut, stdio: 'inherit' });

console.log('Staged:', out);
