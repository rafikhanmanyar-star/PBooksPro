/**
 * Staging desktop clients should update from GitHub prereleases only (e.g. v1.2.299),
 * not from the latest production full release (e.g. v1.2.290).
 */
const fs = require('fs');
const path = require('path');
const semver = require('semver');

function isStagingClient(app) {
  if (process.env.PBOOKS_CLIENT_STAGING === '1') return true;
  const n = String(app.name || app.getName() || '').toLowerCase();
  if (n.includes('staging')) return true;
  if (app.isPackaged) {
    if (path.basename(process.execPath).toLowerCase().includes('staging')) return true;
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(app.getAppPath(), 'package.json'), 'utf8'));
      if (String(pkg.name || '').toLowerCase().includes('staging')) return true;
      const appId = pkg.build && pkg.build.appId ? String(pkg.build.appId) : '';
      if (appId.includes('staging')) return true;
    } catch (_) {
      /* ignore */
    }
  }
  return false;
}

function parseGithubRepo(packageJson) {
  const url = packageJson.repository && (packageJson.repository.url || packageJson.repository);
  if (typeof url !== 'string') return null;
  const normalized = url.replace(/\.git$/i, '').trim();
  const m = normalized.match(/github\.com[/:]([^/]+)\/([^/]+)/i);
  if (!m) return null;
  return { owner: m[1], repo: m[2] };
}

async function listPrereleaseTags(owner, repo) {
  const url = `https://api.github.com/repos/${owner}/${repo}/releases?per_page=40`;
  const res = await fetch(url, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'PBooksPro-Staging-Updater' } });
  if (!res.ok) {
    throw new Error(`GitHub releases request failed (${res.status})`);
  }
  const releases = await res.json();
  return releases
    .filter((r) => r.prerelease && !r.draft)
    .map((r) => r.tag_name)
    .filter((tag) => semver.valid(String(tag).replace(/^v/i, '')))
    .sort((a, b) => semver.rcompare(a.replace(/^v/i, ''), b.replace(/^v/i, '')));
}

async function resolveLatestPrereleaseTag(owner, repo, currentVersion) {
  const tags = await listPrereleaseTags(owner, repo);
  return tags.find((tag) => semver.gt(tag.replace(/^v/i, ''), currentVersion)) || null;
}

async function resolveStagingFeedTag(owner, repo, currentVersion) {
  const newer = await resolveLatestPrereleaseTag(owner, repo, currentVersion);
  if (newer) return newer;
  const tags = await listPrereleaseTags(owner, repo);
  return tags[0] || null;
}

/**
 * Point electron-updater at the newest GitHub prerelease's latest.yml (generic provider).
 * @returns {Promise<string|null>} tag applied, or null when no newer prerelease exists
 */
async function applyStagingPrereleaseFeed(autoUpdater, app) {
  const pkgPath = path.join(app.getAppPath(), 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const slug = parseGithubRepo(pkg);
  if (!slug) {
    throw new Error('Could not parse GitHub repository from package.json');
  }

  const tag = await resolveStagingFeedTag(slug.owner, slug.repo, app.getVersion());
  if (!tag) return null;

  autoUpdater.allowPrerelease = true;
  autoUpdater.setFeedURL({
    provider: 'generic',
    url: `https://github.com/${slug.owner}/${slug.repo}/releases/download/${tag}/`,
  });
  return tag;
}

module.exports = {
  isStagingClient,
  applyStagingPrereleaseFeed,
};
