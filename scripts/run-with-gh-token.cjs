/**
 * Ensure GH_TOKEN is available, then run a shell command.
 * Usage: node scripts/run-with-gh-token.cjs [--require] [--env-file .env.staging] -- <command>
 */
const { execSync } = require('child_process');
const { requireGitHubTokenForPublish, resolveGitHubToken } = require('./resolve-gh-token.cjs');

const args = process.argv.slice(2);
let requireToken = false;
let envFile;
let sep = args.indexOf('--');

while (sep > 0 && args[0].startsWith('--')) {
  if (args[0] === '--require') {
    requireToken = true;
    args.shift();
    sep = args.indexOf('--');
    continue;
  }
  if (args[0] === '--env-file') {
    envFile = args[1];
    args.splice(0, 2);
    sep = args.indexOf('--');
    continue;
  }
  break;
}

if (sep === -1) {
  console.error('[run-with-gh-token] Usage: node scripts/run-with-gh-token.cjs [--require] [--env-file .env.staging] -- <command>');
  process.exit(1);
}

const cmd = args.slice(sep + 1).join(' ');
if (!cmd) {
  console.error('[run-with-gh-token] No command specified after --');
  process.exit(1);
}

if (requireToken) {
  requireGitHubTokenForPublish(envFile);
} else {
  resolveGitHubToken({ envFile, applyToProcessEnv: true });
}

execSync(cmd, { stdio: 'inherit', shell: true, env: process.env });
