/**
 * Shared git helpers for release-staging.cjs and release-production.cjs
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

function run(cmd, opts = {}) {
  execSync(cmd, { cwd: root, stdio: 'inherit', shell: true, ...opts });
}

function runOut(cmd) {
  return execSync(cmd, { cwd: root, encoding: 'utf8', shell: true }).trim();
}

function tryRun(cmd) {
  try {
    execSync(cmd, { cwd: root, stdio: 'pipe', shell: true });
    return true;
  } catch {
    return false;
  }
}

function isGitRepo() {
  return tryRun('git rev-parse --git-dir');
}

function currentBranch() {
  return runOut('git rev-parse --abbrev-ref HEAD');
}

function hasUncommittedChanges() {
  const status = runOut('git status --porcelain');
  return status.length > 0;
}

const RELEASE_ARTIFACT_PATHS = [
  'release-api-client',
  'release-api-server',
  'release-api-client-staging',
  'release-api-server-staging',
  'release',
  'release-staging',
  'build/electron-api-server',
  'win-unpacked',
  'mac-unpacked',
  'linux-unpacked',
  'dist',
];

function unstageReleaseArtifacts() {
  for (const p of RELEASE_ARTIFACT_PATHS) {
    tryRun(`git reset HEAD -- "${p}"`);
  }
  const status = runOut('git status --porcelain');
  for (const line of status.split('\n')) {
    if (!line) continue;
    const file = line.slice(3).trim().replace(/^"(.+)"$/, '$1');
    if (
      /\.(exe|blockmap)$/i.test(file) ||
      /^release(-api)?(-client|-server)?(-staging)?\//i.test(file) ||
      /^release(-staging)?\//i.test(file)
    ) {
      tryRun(`git reset HEAD -- "${file}"`);
    }
  }
}

function stageSourceForCommit() {
  run('git add -A');
  unstageReleaseArtifacts();
}

function commitPendingChanges(message) {
  if (!hasUncommittedChanges()) return false;
  stageSourceForCommit();
  if (!tryRun(`git commit -m "${message.replace(/"/g, '\\"')}"`)) {
    console.warn('[release] git commit skipped (no committable changes or commit rejected).');
    return false;
  }
  return true;
}

function requireEnvFile(filename) {
  const filePath = path.join(root, filename);
  if (!fs.existsSync(filePath)) {
    console.error(`[release] Missing ${filename}. Copy from ${filename}.example and configure it.`);
    process.exit(1);
  }
}

function checkoutBranch(name) {
  const branch = currentBranch();
  if (branch === name) return;
  console.log(`[release] Switching from "${branch}" to "${name}"…`);
  run(`git checkout ${name}`);
}

module.exports = {
  root,
  run,
  runOut,
  tryRun,
  isGitRepo,
  currentBranch,
  hasUncommittedChanges,
  stageSourceForCommit,
  unstageReleaseArtifacts,
  commitPendingChanges,
  requireEnvFile,
  checkoutBranch,
};
