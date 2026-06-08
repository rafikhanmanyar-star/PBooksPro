/**
 * Backfill staging.yml on GitHub prereleases that only have latest.yml (legacy staging deploys).
 * Staging client builds with autoUpdater.channel = 'staging' require staging.yml on the release.
 *
 * Usage: dotenv -e .env.staging -- node scripts/upload-staging-channel-yml.cjs [tag]
 * Default tag: v${package.json version}
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const tag = process.argv[2] || `v${pkg.version}`;
const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;

function parseRepo() {
  const url = pkg.repository && (pkg.repository.url || pkg.repository);
  if (typeof url !== 'string') return null;
  const normalized = url.replace(/\.git$/i, '').trim();
  const m = normalized.match(/github\.com[/:]([^/]+)\/([^/]+)/i);
  if (!m) return null;
  return { owner: m[1], repo: m[2] };
}

async function ghJson(url, opts = {}) {
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'PBooksPro-Staging-Channel-Script',
    ...opts.headers,
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(url, { ...opts, headers });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    const msg = data && data.message ? data.message : text.slice(0, 300);
    throw new Error(`GitHub ${res.status}: ${msg}`);
  }
  return data;
}

async function uploadAsset(owner, repo, releaseId, name, buf) {
  const q = `name=${encodeURIComponent(name)}`;
  const url = `https://uploads.github.com/repos/${owner}/${repo}/releases/${releaseId}/assets?${q}`;
  const headers = {
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/octet-stream',
    'Content-Length': String(buf.length),
    'User-Agent': 'PBooksPro-Staging-Channel-Script',
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(url, { method: 'POST', headers, body: buf });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Upload failed ${res.status}: ${t.slice(0, 400)}`);
  }
}

async function main() {
  if (!token) {
    console.error('[upload-staging-channel-yml] GH_TOKEN / GITHUB_TOKEN required.');
    process.exit(1);
  }
  const slug = parseRepo();
  if (!slug) {
    console.error('[upload-staging-channel-yml] Could not parse repository from package.json');
    process.exit(1);
  }

  const release = await ghJson(
    `https://api.github.com/repos/${slug.owner}/${slug.repo}/releases/tags/${encodeURIComponent(tag)}`
  );
  if (!release.prerelease) {
    console.error(`[upload-staging-channel-yml] ${tag} is not a prerelease — refusing to copy latest.yml.`);
    process.exit(1);
  }

  const assets = release.assets || [];
  if (assets.some((a) => a.name === 'staging.yml')) {
    console.log(`[upload-staging-channel-yml] ${tag} already has staging.yml — nothing to do.`);
    return;
  }

  const latest = assets.find((a) => a.name === 'latest.yml');
  if (!latest) {
    console.error(`[upload-staging-channel-yml] ${tag} has no latest.yml to copy.`);
    process.exit(1);
  }

  const assetRes = await fetch(latest.browser_download_url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!assetRes.ok) {
    throw new Error(`Download latest.yml failed ${assetRes.status}`);
  }
  const ymlBuf = Buffer.from(await assetRes.arrayBuffer());

  console.log(`[upload-staging-channel-yml] Uploading staging.yml to ${tag} (copied from latest.yml)…`);
  await uploadAsset(slug.owner, slug.repo, release.id, 'staging.yml', ymlBuf);
  console.log('[upload-staging-channel-yml] Done.');
}

main().catch((e) => {
  console.error('[upload-staging-channel-yml]', e);
  process.exit(1);
});
