/**
 * Exit 1 unless the current git branch matches the expected name.
 * Usage: node scripts/assert-git-branch.cjs staging
 */
const { execSync } = require('child_process');
const path = require('path');

const expected = process.argv[2];
if (!expected) {
  console.error('[assert-git-branch] Usage: node scripts/assert-git-branch.cjs <branch-name>');
  process.exit(1);
}

const root = path.join(__dirname, '..');

if (process.env.DEPLOY_SKIP_BRANCH_CHECK === '1' || process.env.DEPLOY_SKIP_BRANCH_CHECK === 'true') {
  console.log('[assert-git-branch] DEPLOY_SKIP_BRANCH_CHECK set — skipping branch check.');
  process.exit(0);
}

let branch;
try {
  branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: root, encoding: 'utf8' }).trim();
} catch {
  console.warn('[assert-git-branch] Not a git repository — skipping branch check.');
  process.exit(0);
}

if (branch !== expected) {
  console.error(
    `[assert-git-branch] Expected branch "${expected}" but on "${branch}". Checkout the correct branch or set DEPLOY_SKIP_BRANCH_CHECK=1.`
  );
  process.exit(1);
}

console.log(`[assert-git-branch] OK — on branch "${branch}".`);
