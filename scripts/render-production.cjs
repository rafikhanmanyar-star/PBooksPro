/**
 * Deploy cloud (Render) production:
 *   1. Merge origin/staging into main
 *   2. Push origin/main once — Render auto-deploys API + static site for main
 *   3. Sync staging branch with main
 *
 * Usage: npm run render:production
 *
 * Does NOT bump version or build Electron installers — use npm run release:production for that.
 */
const {
  run,
  tryRun,
  isGitRepo,
  commitPendingChanges,
  checkoutBranch,
} = require('./git-release-utils.cjs');

console.log('');
console.log('========================================');
console.log('  PBooks Pro — Render PRODUCTION deploy');
console.log('========================================');
console.log('');

if (!isGitRepo()) {
  console.error('[render:production] Not a git repository.');
  process.exit(1);
}

run('git fetch origin');

if (commitPendingChanges('Render production deploy')) {
  console.log('[render:production] Committed pending local changes on current branch.');
}

checkoutBranch('main');

if (!tryRun('git pull --ff-only origin main')) {
  console.error(
    '[render:production] Could not fast-forward main from origin. Resolve diverged history, then retry.'
  );
  process.exit(1);
}

console.log('[render:production] Merging origin/staging into main…');
if (!tryRun('git merge origin/staging --no-ff -m "Render deploy: merge staging into main"')) {
  console.error('[render:production] Merge failed. Fix conflicts, commit, then retry.');
  process.exit(1);
}

console.log('[render:production] Pushing main to origin (Render auto-deploy)…');
run('git push origin main');

console.log('[render:production] Syncing staging branch with main…');
try {
  checkoutBranch('staging');
  if (tryRun('git merge main --no-ff -m "Sync staging after Render production deploy"')) {
    run('git push origin staging');
  }
  checkoutBranch('main');
} catch (e) {
  console.warn('[render:production] Could not sync staging with main:', e.message || e);
  checkoutBranch('main');
}

console.log('');
console.log('[render:production] Done.');
console.log('  Render will build and deploy production API + cloud app from main.');
console.log('  For Desktop installers + GitHub full release, use: npm run release:production');
console.log('  Post-deploy checks: doc/RENDER_DEPLOYMENT_VALIDATION.md');
console.log('');
