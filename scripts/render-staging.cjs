/**
 * Deploy cloud (Render) staging:
 *   1. Commit source on staging
 *   2. Push origin/staging — Render auto-deploys API + static site for that branch
 *
 * Usage: npm run render:staging
 *
 * Does NOT bump version or build Electron installers — use npm run release:staging for that.
 */
const {
  run,
  tryRun,
  isGitRepo,
  commitPendingChanges,
  checkoutBranchPreservingChanges,
} = require('./git-release-utils.cjs');

console.log('');
console.log('========================================');
console.log('  PBooks Pro — Render STAGING deploy');
console.log('========================================');
console.log('');

if (!isGitRepo()) {
  console.error('[render:staging] Not a git repository.');
  process.exit(1);
}

run('git fetch origin');

console.log('[render:staging] Step 1/2 — Commit source on staging…');

checkoutBranchPreservingChanges('staging');

if (!tryRun('git pull --ff-only origin staging')) {
  console.error(
    '[render:staging] Could not fast-forward staging from origin. Resolve diverged history, then retry.'
  );
  process.exit(1);
}

if (commitPendingChanges('Render staging deploy')) {
  console.log('[render:staging] Committed pending local changes.');
}

console.log('[render:staging] Step 2/2 — Push staging to origin (Render auto-deploy)…');
run('git push origin staging');

console.log('');
console.log('[render:staging] Done.');
console.log('  Render will build and deploy staging API + cloud app from the staging branch.');
console.log('  For Desktop installers + GitHub prerelease, use: npm run release:staging');
console.log('  Post-deploy checks: doc/RENDER_DEPLOYMENT_VALIDATION.md');
console.log('');
