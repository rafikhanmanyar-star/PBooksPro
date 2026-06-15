/**
 * Staging desktop apps (client + API server) should update from GitHub prereleases only (e.g. v1.2.303),
 * not from the latest production full release (e.g. v1.2.290).
 *
 * Resolves staging tags via the public releases Atom feed + api-server-staging.yml marker (no API token).
 * Falls back to the GitHub REST API when the feed path fails (rate-limited for unauthenticated clients).
 */
const fs = require('fs');
const path = require('path');
const {
  isValidVersion,
  compareVersions,
  isNewerVersion,
  parseGithubRepo,
  readPackageJson,
  withGithubRetries,
} = require('./githubReleaseUtils.cjs');

const STAGING_RELEASE_MARKER = 'api-server-staging.yml';
const CACHE_FILE = 'staging-prerelease-feed-cache.json';
const CACHE_TTL_MS = 60 * 60 * 1000;
const ATOM_TAG_SCAN_LIMIT = 25;

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

function readFeedCache(app) {
  if (!app || typeof app.getPath !== 'function') return null;
  try {
    const p = path.join(app.getPath('userData'), CACHE_FILE);
    if (!fs.existsSync(p)) return null;
    const data = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (!data || !data.tags || !Array.isArray(data.tags) || !data.resolvedAt) return null;
    if (Date.now() - Number(data.resolvedAt) > CACHE_TTL_MS) return null;
    return data.tags.filter((tag) => isValidVersion(tag));
  } catch (_) {
    return null;
  }
}

function writeFeedCache(app, tags) {
  if (!app || typeof app.getPath !== 'function' || !tags.length) return;
  try {
    const p = path.join(app.getPath('userData'), CACHE_FILE);
    fs.writeFileSync(p, JSON.stringify({ tags, resolvedAt: Date.now() }), 'utf8');
  } catch (_) {
    /* ignore */
  }
}

function parseTagsFromAtom(xml) {
  const tags = [];
  const re = /releases\/tag\/(v[\d.]+)/gi;
  let m;
  while ((m = re.exec(xml))) {
    const tag = m[1];
    if (isValidVersion(tag) && !tags.includes(tag)) tags.push(tag);
  }
  return tags;
}

async function fetchAtomTags(owner, repo) {
  const url = `https://github.com/${owner}/${repo}/releases.atom`;
  const res = await fetch(url, { headers: { 'User-Agent': 'PBooksPro-Staging-Updater' } });
  if (!res.ok) {
    throw new Error(`GitHub releases feed failed (${res.status})`);
  }
  return parseTagsFromAtom(await res.text());
}

async function hasStagingReleaseMarker(owner, repo, tag) {
  const url = `https://github.com/${owner}/${repo}/releases/download/${encodeURIComponent(tag)}/${STAGING_RELEASE_MARKER}`;
  const res = await fetch(url, {
    method: 'HEAD',
    headers: { 'User-Agent': 'PBooksPro-Staging-Updater' },
  });
  return res.ok;
}

async function listStagingTagsFromAtom(owner, repo) {
  const tags = (await fetchAtomTags(owner, repo)).slice(0, ATOM_TAG_SCAN_LIMIT);
  const staging = [];
  for (const tag of tags) {
    if (await hasStagingReleaseMarker(owner, repo, tag)) staging.push(tag);
  }
  return staging.sort((a, b) => compareVersions(b, a));
}

async function listPrereleaseTagsFromApi(owner, repo) {
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

async function listPrereleaseTags(owner, repo, app) {
  const cached = readFeedCache(app);
  if (cached && cached.length) return cached;

  try {
    const fromAtom = await listStagingTagsFromAtom(owner, repo);
    if (fromAtom.length) {
      writeFeedCache(app, fromAtom);
      return fromAtom;
    }
  } catch (e) {
    console.warn('[StagingUpdater] Atom feed resolution failed:', e && e.message ? e.message : e);
  }

  try {
    const fromApi = await withGithubRetries(() => listPrereleaseTagsFromApi(owner, repo));
    if (fromApi.length) writeFeedCache(app, fromApi);
    return fromApi;
  } catch (e) {
    if (cached && cached.length) return cached;
    throw e;
  }
}

async function resolveLatestPrereleaseTag(owner, repo, currentVersion, app) {
  const tags = await listPrereleaseTags(owner, repo, app);
  return tags.find((tag) => isNewerVersion(tag, currentVersion)) || null;
}

async function resolveStagingFeedTag(owner, repo, currentVersion, app) {
  const newer = await resolveLatestPrereleaseTag(owner, repo, currentVersion, app);
  if (newer) return newer;
  const tags = await listPrereleaseTags(owner, repo, app);
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
    tag || (await resolveStagingFeedTag(slug.owner, slug.repo, app.getVersion(), app));
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
  const tags = await withGithubRetries(() => listPrereleaseTags(slug.owner, slug.repo, app));
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
