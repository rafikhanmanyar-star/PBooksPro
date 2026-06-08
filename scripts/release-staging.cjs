/**
 * Release staging: commit + push to origin/staging, bump version, build installers,
 * publish GitHub prerelease, push tag.
 *
 * Usage: npm run release:staging
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
console.log('  PBooks Pro — Release STAGING');
console.log('========================================');
console.log('');

if (!isGitRepo()) {
  console.error('[release:staging] Not a git repository.');
  process.exit(1);
}

requireEnvFile('.env.staging');

run('git fetch origin');

checkoutBranch('staging');

if (!tryRun('git pull --ff-only origin staging')) {
  console.error(
    '[release:staging] Could not fast-forward staging from origin. Resolve diverged history, then retry.'
  );
  process.exit(1);
}

if (commitPendingChanges('Pre-release staging commit')) {
  console.log('[release:staging] Committed pending local changes.');
}

console.log('[release:staging] Pushing source to origin/staging…');
run('git push origin staging');

console.log('[release:staging] Building, bumping version, publishing GitHub prerelease (staging channel)…');
run('npm run deploy:staging');

console.log('');
console.log('[release:staging] Done.');
console.log('  Staging apps (PBooks Pro Staging Client) will update from GitHub prereleases.');
console.log('  Production apps ignore prereleases — after testing, run: npm run release:production');
console.log('');
