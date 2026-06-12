# Render Deployment Validation — PBooks Pro Cloud App

**Host:** `app.pbookspro.com` (Render Static Site)  
**API:** `api.pbookspro.com` (Render Web Service)

---

## Build Configuration (Render Dashboard)

| Setting | Value |
|---------|-------|
| **Environment** | Static Site |
| **Build command** | `npm ci && npm run build` |
| **Publish directory** | `dist` |
| **Node version** | 20 |

### Required environment variables

| Variable | Example |
|----------|---------|
| `VITE_LOCAL_ONLY` | `false` |
| `VITE_API_URL` | `https://api.pbookspro.com/api` |
| `VITE_WS_URL` | `wss://api.pbookspro.com` |
| `NODE_ENV` | `production` |

Render automatically provides `RENDER_GIT_COMMIT` — used in `version.json` for unique deploy IDs.

---

## Post-Deploy Validation Checklist

### Build artifacts

```powershell
npm run build
```

- [ ] `dist/version.json` exists with fresh `version` and `buildTime`
- [ ] `dist/_headers` exists
- [ ] `dist/index.html` references `/assets/*-<hash>.js` (no bare `main.js`)
- [ ] `dist/sw.js` does **not** contain `__BUILD_CACHE_NAME__` placeholder
- [ ] `dist/assets/` contains only hashed filenames

### Live site (production)

- [ ] `GET https://app.pbookspro.com/version.json` returns 200 and current deploy version
- [ ] Response includes `Cache-Control: no-cache` (from `_headers` or CDN rule)
- [ ] `GET https://app.pbookspro.com/` returns `index.html` with new asset hashes after deploy
- [ ] Hashed JS under `/assets/` returns `Cache-Control` with `immutable` or long `max-age`

### Runtime behavior

| Scenario | Expected |
|----------|----------|
| User opens app after new deployment | Latest `index.html` + hashed bundles load |
| User keeps tab open during deployment | Update toast within ~5 min; refresh loads new build |
| Mobile browser with aggressive cache | `version.json?t=` bypasses cache; update detected |

### Settings → About

- [ ] Version shows deployment ID (e.g. `2026.06.12.abc1234`)
- [ ] Build Date populated
- [ ] Environment shows Production (or Staging)
- [ ] API URL correct

---

## Automated Tests

```powershell
npm run test:version-check
```

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| Users stuck on old UI | Cloudflare caching `index.html` | Apply bypass rule (see `CLOUDFLARE_APP_CACHE.md`) |
| No update notification | `applicationUpdates` disabled or Electron/local mode | Cloud edition enables updates; web only |
| SW serves stale shell | Old `sw.js` cached | `sw.js` has `no-cache`; bump deploy |
| `version.json` unchanged | Build cache / skipped build step | Ensure clean `npm run build` on Render |
