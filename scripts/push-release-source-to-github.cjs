/**
 * After a successful production deploy (installers published), commit any remaining
 * release-related changes (version bump, extracted schema, etc.) and push the current
 * branch plus tag v${version} to origin so github.com matches the shipped release.
 *
 * Skips when:
 * - DEPLOY_SKIP_GIT_PUSH=1 or true
 * - Not a git repository
 *
 * Requires local git credentials (SSH or HTTPS) for `git push`; this does not use GH_TOKEN.
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const version = pkg.version;
const tag = `v${version}`;

function run(cmd, opts = {}) {
  execSync(cmd, { cwd: root, stdio: 'inherit', shell: true, ...opts });
}

function runOut(cmd) {
  return execSync(cmd, { cwd: root, encoding: 'utf8', shell: true }).trim();
}

if (process.env.DEPLOY_SKIP_GIT_PUSH === '1' || process.env.DEPLOY_SKIP_GIT_PUSH === 'true') {
  console.log('[push-release-source] DEPLOY_SKIP_GIT_PUSH set — skipping git push.');
  process.exit(0);
}

try {
  execSync('git rev-parse --git-dir', { cwd: root, stdio: 'pipe' });
} catch {
  console.warn('[push-release-source] Not a git repository — skipping.');
  process.exit(0);
}

run('git add -A');

let hasStagedChanges = false;
try {
  execSync('git diff --cached --quiet', { cwd: root, stdio: 'pipe' });
} catch (e) {
  if (e && e.status === 1) hasStagedChanges = true;
  else throw e;
}

if (hasStagedChanges) {
  run(`git commit -m "Release ${tag}"`);
} else {
  console.log('[push-release-source] Nothing new to commit (tree already matches release).');
}

run(`git tag -f ${tag}`);

const branch = runOut('git rev-parse --abbrev-ref HEAD');
if (branch === 'HEAD') {
  console.error('[push-release-source] Detached HEAD — cannot push branch. Tag updated locally only.');
  process.exit(1);
}

run(`git push origin ${branch}`);
run(`git push -f origin ${tag}`);

console.log(`[push-release-source] Pushed branch "${branch}" and tag "${tag}" to origin.`);
