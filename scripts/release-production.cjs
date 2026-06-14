/**
 * Release production: merge origin/staging into main (local), bump version,
 * build production installers, publish GitHub full release, then push main + tag once
 * (avoids double Render/Cloudflare deploys from two pushes to main).
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
const { requireGitHubTokenForPublish } = require('./resolve-gh-token.cjs');

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
requireGitHubTokenForPublish('.env.production');

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

console.log(
  '[release:production] Merge complete locally — main will be pushed once after a successful build (see push-release-source-to-github.cjs).'
);

console.log('[release:production] Building, bumping version, publishing GitHub full release (latest channel)…');
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
console.log('[release:production] Done.');
console.log('  Production apps (PBooks Pro Client) will update from the new GitHub full release.');
console.log('  Staging prereleases remain separate — staging apps keep using the staging channel.');
console.log('');
