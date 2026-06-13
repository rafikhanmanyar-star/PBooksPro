/**
 * Resolve GH_TOKEN / GITHUB_TOKEN for electron-builder publish and upload scripts.
 * Order: existing env → dotenv file (optional) → `gh auth token`.
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

function readTokenFromEnvFile(filename) {
  const filePath = path.join(root, filename);
  if (!fs.existsSync(filePath)) return null;
  const text = fs.readFileSync(filePath, 'utf8');
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const m = trimmed.match(/^(GH_TOKEN|GITHUB_TOKEN)\s*=\s*(.+)$/);
    if (m) return m[2].trim().replace(/^["']|["']$/g, '');
  }
  return null;
}

function readGhCliToken() {
  try {
    return execSync('gh auth token', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      shell: true,
    }).trim();
  } catch {
    return null;
  }
}

/**
 * @param {{ envFile?: string, applyToProcessEnv?: boolean }} [opts]
 * @returns {string|null}
 */
function resolveGitHubToken(opts = {}) {
  const { envFile, applyToProcessEnv = false } = opts;

  let token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || null;
  let source = token ? 'environment' : null;

  if (!token && envFile) {
    token = readTokenFromEnvFile(envFile);
    if (token) source = envFile;
  }

  if (!token) {
    token = readGhCliToken();
    if (token) source = 'gh auth token';
  }

  if (token && applyToProcessEnv) {
    process.env.GH_TOKEN = token;
  }

  return token ? { token, source } : null;
}

function requireGitHubTokenForPublish(envFile) {
  const resolved = resolveGitHubToken({ envFile, applyToProcessEnv: true });
  if (resolved) {
    if (resolved.source !== 'environment') {
      console.log(`[release] Using GitHub token from ${resolved.source}.`);
    }
    return resolved.token;
  }

  console.error('');
  console.error('[release] GitHub token is required to publish installers.');
  console.error(`  Add GH_TOKEN to ${envFile} (see ${envFile}.example), or run: gh auth login`);
  console.error('  Token needs repo scope (Contents + Releases write for fine-grained PATs).');
  console.error('');
  process.exit(1);
}

module.exports = {
  resolveGitHubToken,
  requireGitHubTokenForPublish,
};
