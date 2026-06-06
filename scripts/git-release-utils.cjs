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

function commitPendingChanges(message) {
  if (!hasUncommittedChanges()) return false;
  run('git add -A');
  run(`git commit -m "${message.replace(/"/g, '\\"')}"`);
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
  commitPendingChanges,
  requireEnvFile,
  checkoutBranch,
};
