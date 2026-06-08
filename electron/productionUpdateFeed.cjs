/**
 * Production API server updates — latest GitHub full release + api-server.yml channel.
 */
const {
  readPackageJson,
  parseGithubRepo,
  resolveLatestProductionRelease,
  resolveNewerProductionRelease,
  withGithubRetries,
} = require('./githubReleaseUtils.cjs');

/**
 * Compare current app version to the newest production GitHub release.
 * @returns {Promise<{ latest: { tag: string, version: string } | null, newer: { tag: string, version: string } | null }>}
 */
async function inspectProductionReleases(app) {
  const pkg = readPackageJson(app);
  const slug = parseGithubRepo(pkg);
  if (!slug) {
    throw new Error('Could not parse GitHub repository from package.json');
  }
  const currentVersion = app.getVersion();
  const [latest, newer] = await withGithubRetries(() =>
    Promise.all([
      resolveLatestProductionRelease(slug.owner, slug.repo),
      resolveNewerProductionRelease(slug.owner, slug.repo, currentVersion),
    ])
  );
  return { latest, newer, slug };
}

/**
 * Point electron-updater at api-server.yml for a specific release tag.
 * @returns {Promise<string>} tag applied
 */
async function applyProductionReleaseFeed(autoUpdater, app, tag) {
  const pkg = readPackageJson(app);
  const slug = parseGithubRepo(pkg);
  if (!slug) {
    throw new Error('Could not parse GitHub repository from package.json');
  }
  autoUpdater.allowPrerelease = false;
  autoUpdater.channel = 'api-server';
  autoUpdater.setFeedURL({
    provider: 'generic',
    url: `https://github.com/${slug.owner}/${slug.repo}/releases/download/${tag}/`,
    channel: 'api-server',
  });
  return tag;
}

module.exports = {
  inspectProductionReleases,
  applyProductionReleaseFeed,
};
