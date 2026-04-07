/**
 * Upload PBooks Pro API Server installer(s) to the GitHub release for the current package.json version.
 * Run after `electron-builder --publish always` for PBooks Pro Client (electron-builder-api-client.yml)
 * so the same release tag
 * Also uploads release-api-server/api-server.yml (or latest.yml fallback) as api-server.yml so electron-updater (channel api-server)
 * can resolve the NSIS installer + blockmap for differential updates.
 *
 * Requires GH_TOKEN or GITHUB_TOKEN (same as electron-builder publish).
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const version = pkg.version;
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
    'User-Agent': 'PBooksPro-Upload-Script',
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

async function deleteAsset(owner, repo, assetId) {
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'PBooksPro-Upload-Script',
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/releases/assets/${assetId}`,
    { method: 'DELETE', headers }
  );
  if (!res.ok && res.status !== 204) {
    const t = await res.text();
    throw new Error(`Delete asset failed ${res.status}: ${t.slice(0, 200)}`);
  }
}

async function uploadAsset(owner, repo, releaseId, name, filePath) {
  const buf = fs.readFileSync(filePath);
  const q = `name=${encodeURIComponent(name)}`;
  const url = `https://uploads.github.com/repos/${owner}/${repo}/releases/${releaseId}/assets?${q}`;
  const headers = {
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/octet-stream',
    'Content-Length': String(buf.length),
    'User-Agent': 'PBooksPro-Upload-Script',
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(url, { method: 'POST', headers, body: buf });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Upload failed ${res.status}: ${t.slice(0, 400)}`);
  }
  return res.json();
}

async function main() {
  if (!token) {
    console.warn(
      '[upload-api-server] GH_TOKEN / GITHUB_TOKEN not set — skipping API server upload (installer is still in release-api-server/).'
    );
    process.exit(0);
  }

  const slug = parseRepo();
  if (!slug) {
    console.error('[upload-api-server] Could not parse repository from package.json');
    process.exit(1);
  }

  const tag = `v${version}`;
  const releaseDir = path.join(root, 'release-api-server');
  const base = `PBooks-Pro-API-Server-Setup-${version}`;
  const exe = path.join(releaseDir, `${base}.exe`);
  const blockmap = path.join(releaseDir, `${base}.exe.blockmap`);

  if (!fs.existsSync(exe)) {
    console.error('[upload-api-server] Missing:', exe);
    process.exit(1);
  }

  console.log(`[upload-api-server] Fetching release ${tag}…`);
  let release;
  try {
    release = await ghJson(
      `https://api.github.com/repos/${slug.owner}/${slug.repo}/releases/tags/${encodeURIComponent(tag)}`
    );
  } catch (e) {
    console.error(
      '[upload-api-server] Release not found:',
      e.message,
      '\n(Run client publish first so the tag exists.)'
    );
    process.exit(1);
  }

  const rid = release.id;
  const channelYml = path.join(releaseDir, 'api-server.yml');
  const latestYml = path.join(releaseDir, 'latest.yml');
  const updateYml = fs.existsSync(channelYml) ? channelYml : latestYml;
  /** @type {{ name: string, file: string }[]} */
  const uploads = [{ name: `${base}.exe`, file: exe }];
  if (fs.existsSync(blockmap)) uploads.push({ name: `${base}.exe.blockmap`, file: blockmap });
  if (fs.existsSync(updateYml)) uploads.push({ name: 'api-server.yml', file: updateYml });

  for (const { name } of uploads) {
    const existing = (release.assets || []).find((a) => a.name === name);
    if (existing) {
      console.log(`[upload-api-server] Replacing asset: ${name}`);
      await deleteAsset(slug.owner, slug.repo, existing.id);
    }
  }

  for (const { name, file } of uploads) {
    console.log(`[upload-api-server] Uploading ${name}…`);
    await uploadAsset(slug.owner, slug.repo, rid, name, file);
  }

  console.log('[upload-api-server] Done. API server installer + update channel attached to', tag);
}

main().catch((e) => {
  console.error('[upload-api-server]', e);
  process.exit(1);
});
