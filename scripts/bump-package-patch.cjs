/**
 * Patch-bump root package.json version for installer releases only.
 * Requires PBOOKS_BUMP_VERSION=1 (set by deploy:staging-inner / deploy:production-inner).
 * Local test scripts (test:staging, test:local-only) must never set this flag.
 */
const { execSync } = require('child_process');
const path = require('path');

const root = path.join(__dirname, '..');

if (process.env.PBOOKS_BUMP_VERSION !== '1') {
  console.log('[bump-package-patch] Skipping — PBOOKS_BUMP_VERSION is not 1.');
  process.exit(0);
}

console.log('[bump-package-patch] Bumping patch version in package.json…');
execSync('npm version patch --no-git-tag-version', { cwd: root, stdio: 'inherit', shell: true });
