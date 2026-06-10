/**
 * GitHub release helpers for electron-updater feeds (staging + production API server).
 */
const fs = require('fs');
const path = require('path');

/** @returns {[number, number, number] | null} */
function parseVersion(version) {
  const m = String(version).replace(/^v/i, '').match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function isValidVersion(version) {
  return parseVersion(version) !== null;
}

function compareVersions(a, b) {
  const left = parseVersion(a);
  const right = parseVersion(b);
  if (!left || !right) return 0;
  for (let i = 0; i < 3; i += 1) {
    if (left[i] !== right[i]) return left[i] < right[i] ? -1 : 1;
  }
  return 0;
}

function isNewerVersion(candidate, current) {
  return compareVersions(candidate, current) > 0;
}

function parseGithubRepo(packageJson) {
  const url = packageJson.repository && (packageJson.repository.url || packageJson.repository);
  if (typeof url !== 'string') return null;
  const normalized = url.replace(/\.git$/i, '').trim();
  const m = normalized.match(/github\.com[/:]([^/]+)\/([^/]+)/i);
  if (!m) return null;
  return { owner: m[1], repo: m[2] };
}

function readPackageJson(app) {
  const pkgPath = path.join(app.getAppPath(), 'package.json');
  return JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
}

async function githubJson(url, opts = {}) {
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'PBooksPro-Updater',
    ...opts.headers,
  };
  const res = await fetch(url, { ...opts, headers });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    const msg = data && data.message ? data.message : text.slice(0, 200);
    const err = new Error(`GitHub ${res.status}: ${msg}`);
    err.statusCode = res.status;
    throw err;
  }
  return data;
}

async function listProductionReleases(owner, repo) {
  const releases = await githubJson(
    `https://api.github.com/repos/${owner}/${repo}/releases?per_page=30`
  );
  return releases
    .filter((r) => !r.prerelease && !r.draft)
    .map((r) => ({
      tag: r.tag_name,
      version: String(r.tag_name).replace(/^v/i, ''),
    }))
    .filter((r) => isValidVersion(r.version))
    .sort((a, b) => compareVersions(b.version, a.version));
}

async function resolveLatestProductionRelease(owner, repo) {
  const releases = await listProductionReleases(owner, repo);
  return releases[0] || null;
}

async function resolveNewerProductionRelease(owner, repo, currentVersion) {
  const releases = await listProductionReleases(owner, repo);
  return releases.find((r) => isNewerVersion(r.version, currentVersion)) || null;
}

function isTransientGithubStatus(status) {
  return status === 502 || status === 503 || status === 504;
}

async function withGithubRetries(fn, attempts = 3) {
  let lastErr;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      const status = e && e.statusCode;
      if (!isTransientGithubStatus(status) || i === attempts - 1) throw e;
      await new Promise((r) => setTimeout(r, 800 * (i + 1)));
    }
  }
  throw lastErr;
}

module.exports = {
  parseVersion,
  isValidVersion,
  compareVersions,
  isNewerVersion,
  parseGithubRepo,
  readPackageJson,
  resolveLatestProductionRelease,
  resolveNewerProductionRelease,
  isTransientGithubStatus,
  withGithubRetries,
};
