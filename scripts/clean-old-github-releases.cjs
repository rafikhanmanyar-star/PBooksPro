/**
 * Delete old GitHub releases to save storage.
 * Keeps the most recent N releases (default 10); deletes the rest.
 * Requires GH_TOKEN or GITHUB_TOKEN with repo scope.
 *
 * Usage:
 *   npm run github:clean-releases
 *   npm run github:clean-releases -- --keep 5
 *   node scripts/clean-old-github-releases.cjs --keep 5
 *   node scripts/clean-old-github-releases.cjs --keep 3 --ignore-missing-token  (exit 0 if no token; for deploy scripts)
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const pkgPath = path.join(__dirname, '..', 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const repoUrl = pkg.repository && (pkg.repository.url || pkg.repository);
if (!repoUrl || typeof repoUrl !== 'string') {
  console.error('package.json must have repository.url (e.g. https://github.com/owner/repo)');
  process.exit(1);
}
const match = repoUrl.match(/github\.com[/:]([^/]+)\/([^/]+?)(?:\.git)?$/i);
if (!match) {
  console.error('repository.url must be a GitHub URL (e.g. https://github.com/owner/repo)');
  process.exit(1);
}
const [, owner, repo] = match;

const args = process.argv.slice(2);
const ignoreMissingToken = args.includes('--ignore-missing-token');
let keep = 10;

const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
if (!token) {
  if (ignoreMissingToken) {
    console.warn('GH_TOKEN / GITHUB_TOKEN not set — skipping release cleanup.');
    process.exit(0);
  }
  console.error('Set GH_TOKEN or GITHUB_TOKEN (with repo scope) to delete releases.');
  process.exit(1);
}

const keepIdx = args.indexOf('--keep');
if (keepIdx !== -1 && args[keepIdx + 1]) {
  keep = Math.max(1, parseInt(args[keepIdx + 1], 10) || 10);
}

function request(method, pathname, body) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: 'api.github.com',
      path: pathname,
      method,
      headers: {
        Accept: 'application/vnd.github.v3+json',
        Authorization: `Bearer ${token}`,
        'User-Agent': 'PBooksPro-clean-releases',
      },
    };
    if (body) {
      opts.headers['Content-Type'] = 'application/json';
    }
    const req = https.request(opts, (res) => {
      let data = '';
      res.on('data', (ch) => (data += ch));
      res.on('end', () => {
        try {
          const body = (data && data.trim()) ? data : '';
          const parsed = body ? JSON.parse(body) : null;
          if (res.statusCode >= 400) reject(new Error(parsed && parsed.message ? parsed.message : `HTTP ${res.statusCode}`));
          else resolve(parsed);
        } catch (e) {
          reject(new Error(data || `HTTP ${res.statusCode}`));
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(typeof body === 'string' ? body : JSON.stringify(body));
    req.end();
  });
}

async function main() {
  console.log(`Repository: ${owner}/${repo}`);
  console.log(`Keeping the latest ${keep} release(s), deleting the rest.\n`);

  let all = [];
  let page = 1;
  const perPage = 100;
  while (true) {
    const releases = await request('GET', `/repos/${owner}/${repo}/releases?per_page=${perPage}&page=${page}`);
    if (!releases || releases.length === 0) break;
    all = all.concat(releases);
    if (releases.length < perPage) break;
    page++;
  }

  const sorted = all.sort((a, b) => new Date(b.published_at || b.created_at) - new Date(a.published_at || a.created_at));
  const toDelete = sorted.slice(keep);
  const toKeep = sorted.slice(0, keep);

  if (toKeep.length) {
    console.log('Keeping:');
    toKeep.forEach((r, i) => console.log(`  ${i + 1}. ${r.tag_name} (${r.prerelease ? 'prerelease' : 'release'})`));
  }
  if (toDelete.length === 0) {
    console.log('\nNo old releases to delete.');
    return;
  }
  console.log('\nDeleting:');
  toDelete.forEach((r) => console.log(`  - ${r.tag_name} (id: ${r.id})`));

  for (const r of toDelete) {
    try {
      await request('DELETE', `/repos/${owner}/${repo}/releases/${r.id}`);
      console.log(`  Deleted release ${r.tag_name}`);
    } catch (err) {
      console.error(`  Failed to delete ${r.tag_name}:`, err.message);
    }
  }
  console.log(`\nDone. ${toDelete.length} release(s) deleted.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
