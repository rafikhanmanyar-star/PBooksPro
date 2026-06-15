/**
 * Release staging:
 *   1. Commit source on staging (local)
 *   2. Bump version, build installers, publish GitHub prerelease, push staging + tag once
 *
 * Usage: npm run release:staging
 */
const {
  run,
  tryRun,
  isGitRepo,
  commitPendingChanges,
  requireEnvFile,
  checkoutBranchPreservingChanges,
} = require('./git-release-utils.cjs');
const { requireGitHubTokenForPublish } = require('./resolve-gh-token.cjs');

console.log('');
console.log('========================================');
console.log('  PBooks Pro — Release STAGING');
console.log('========================================');
console.log('');

if (!isGitRepo()) {
  console.error('[release:staging] Not a git repository.');
  process.exit(1);
}

requireEnvFile('.env.staging');
requireGitHubTokenForPublish('.env.staging');

run('git fetch origin');

console.log('[release:staging] Step 1/2 — Commit source on staging (push after build)…');

checkoutBranchPreservingChanges('staging');

if (!tryRun('git pull --ff-only origin staging')) {
  console.error(
    '[release:staging] Could not fast-forward staging from origin. Resolve diverged history, then retry.'
  );
  process.exit(1);
}

if (commitPendingChanges('Pre-release staging commit')) {
  console.log('[release:staging] Committed pending local changes.');
}

console.log('[release:staging] Staging installers: PBooks Pro Staging API Server + Staging Client (Architecture v2.1 — PostgreSQL /api/v1).');
console.log('[release:staging] Step 2/2 — Build, bump version, publish GitHub prerelease, push staging + tag…');
run('npm run deploy:staging');

console.log('');
console.log('[release:staging] Done.');
console.log('  Staging apps (PBooks Pro Staging Client) will update from GitHub prereleases.');
console.log('  Production apps ignore prereleases — after testing, run: npm run release:production');
console.log('');
