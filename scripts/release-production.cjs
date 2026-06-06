/**
 * Release production: merge origin/staging into main, push main, bump version,
 * build production installers, publish GitHub full release (client auto-update).
 *
 * Usage: npm run release:production
 */
const {
  run,
  tryRun,
  isGitRepo,
  commitPendingChanges,
  requireEnvFile,
  checkoutBranch,
} = require('./git-release-utils.cjs');

console.log('');
console.log('========================================');
console.log('  PBooks Pro — Release PRODUCTION');
console.log('========================================');
console.log('');

if (!isGitRepo()) {
  console.error('[release:production] Not a git repository.');
  process.exit(1);
}

requireEnvFile('.env.production');

run('git fetch origin');

if (commitPendingChanges('Pre-release production commit')) {
  console.log('[release:production] Committed pending local changes on current branch.');
}

checkoutBranch('main');

if (!tryRun('git pull --ff-only origin main')) {
  console.error(
    '[release:production] Could not fast-forward main from origin. Resolve diverged history, then retry.'
  );
  process.exit(1);
}

console.log('[release:production] Merging origin/staging into main…');
if (!tryRun('git merge origin/staging --no-ff -m "Release: merge staging into main"')) {
  console.error('[release:production] Merge failed. Fix conflicts, commit, then retry.');
  process.exit(1);
}

console.log('[release:production] Pushing merged main to origin…');
run('git push origin main');

console.log('[release:production] Building, bumping version, publishing production release…');
run('npm run deploy:production');

console.log('[release:production] Syncing staging branch with main…');
try {
  checkoutBranch('staging');
  if (tryRun('git merge main --no-ff -m "Sync staging after production release"')) {
    run('git push origin staging');
  }
  checkoutBranch('main');
} catch (e) {
  console.warn('[release:production] Could not sync staging with main:', e.message || e);
  checkoutBranch('main');
}

console.log('');
console.log('[release:production] Done. Production clients will pick up the new GitHub release.');
console.log('');
