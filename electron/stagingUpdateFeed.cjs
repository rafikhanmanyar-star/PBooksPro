/**
 * Staging desktop apps (client + API server) should update from GitHub prereleases only (e.g. v1.2.303),
 * not from the latest production full release (e.g. v1.2.290).
 */
const fs = require('fs');
const path = require('path');
const {
  parseVersion,
  isValidVersion,
  compareVersions,
  isNewerVersion,
  parseGithubRepo,
  readPackageJson,
  withGithubRetries,
} = require('./githubReleaseUtils.cjs');

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
    .filter((tag) => isValidVersion(tag))
    .sort((a, b) => compareVersions(b, a));
}

async function resolveLatestPrereleaseTag(owner, repo, currentVersion) {
  const tags = await listPrereleaseTags(owner, repo);
  return tags.find((tag) => isNewerVersion(tag, currentVersion)) || null;
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
async function applyStagingPrereleaseFeed(autoUpdater, app, tag) {
  const pkg = readPackageJson(app);
  const slug = parseGithubRepo(pkg);
  if (!slug) {
    throw new Error('Could not parse GitHub repository from package.json');
  }

  const feedTag =
    tag || (await resolveStagingFeedTag(slug.owner, slug.repo, app.getVersion()));
  if (!feedTag) return null;

  autoUpdater.allowPrerelease = true;
  const feedOptions = {
    provider: 'generic',
    url: `https://github.com/${slug.owner}/${slug.repo}/releases/download/${feedTag}/`,
  };
  // Staging API Server uses channel api-server-staging → api-server-staging.yml (not latest.yml).
  const channel = autoUpdater.channel;
  if (channel && channel !== 'latest') {
    feedOptions.channel = channel;
  }
  autoUpdater.setFeedURL(feedOptions);
  return feedTag;
}

async function inspectStagingReleases(app) {
  const pkg = readPackageJson(app);
  const slug = parseGithubRepo(pkg);
  if (!slug) {
    throw new Error('Could not parse GitHub repository from package.json');
  }
  const currentVersion = app.getVersion();
  const tags = await withGithubRetries(() => listPrereleaseTags(slug.owner, slug.repo));
  const latestTag = tags[0] || null;
  const newerTag = tags.find((t) => isNewerVersion(String(t).replace(/^v/i, ''), currentVersion)) || null;
  return {
    latest: latestTag
      ? { tag: latestTag, version: String(latestTag).replace(/^v/i, '') }
      : null,
    newer: newerTag
      ? { tag: newerTag, version: String(newerTag).replace(/^v/i, '') }
      : null,
    slug,
  };
}

module.exports = {
  isStagingClient,
  applyStagingPrereleaseFeed,
  inspectStagingReleases,
};
