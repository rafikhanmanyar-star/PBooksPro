# Cloudflare Cache Rules — PBooks Pro App (`app.pbookspro.com`)

Use these rules when the Render static site is proxied through Cloudflare (orange cloud).

**Goal:** Never cache the app shell; cache hashed bundles forever.

---

## Recommended Cache Rules (Cloudflare Dashboard)

Navigate: **Caching → Cache Rules → Create rule**

### Rule 1 — Bypass cache for app shell

| Setting | Value |
|---------|-------|
| Rule name | `PBooks App — bypass shell` |
| Expression | `(http.host eq "app.pbookspro.com" and http.request.uri.path in {"/index.html" "/version.json" "/manifest.json" "/sw.js" "/env-config.json"})` |
| Cache eligibility | Bypass cache |

### Rule 2 — Bypass cache for SPA fallback paths

If your host serves `index.html` for all routes:

| Setting | Value |
|---------|-------|
| Rule name | `PBooks App — bypass HTML documents` |
| Expression | `(http.host eq "app.pbookspro.com" and http.response.content_type.media_type eq "text/html")` |
| Cache eligibility | Bypass cache |

### Rule 3 — Long cache for hashed assets

| Setting | Value |
|---------|-------|
| Rule name | `PBooks App — immutable assets` |
| Expression | `(http.host eq "app.pbookspro.com" and starts_with(http.request.uri.path, "/assets/"))` |
| Cache eligibility | Eligible for cache |
| Edge TTL | 1 year |
| Browser TTL | Respect origin / 1 year |
| Cache key | Include host only (default) |

---

## Legacy Page Rules (if Cache Rules unavailable)

| URL pattern | Setting |
|-------------|---------|
| `app.pbookspro.com/index.html` | Cache Level: Bypass |
| `app.pbookspro.com/version.json` | Cache Level: Bypass |
| `app.pbookspro.com/manifest.json` | Cache Level: Bypass |
| `app.pbookspro.com/sw.js` | Cache Level: Bypass |
| `app.pbookspro.com/assets/*` | Cache Level: Cache Everything, Edge TTL: 1 month+ |

**Order matters:** Bypass rules must rank **above** cache-everything rules.

---

## Origin Headers (`public/_headers`)

Cloudflare respects origin `Cache-Control` when **Browser Cache TTL** is set to "Respect Existing Headers". The app's `_headers` file already sends:

- `no-cache` for shell files
- `immutable, max-age=31536000` for `/assets/*`

Enable **Respect Existing Headers** on the zone or per-rule for best results.

---

## Verification Commands

```bash
# Shell must not be cached at edge
curl -sI https://app.pbookspro.com/version.json | grep -i cache-control

# Hashed asset should allow long cache
curl -sI "https://app.pbookspro.com/assets/index-XXXXX.js" | grep -i cache-control
```

After a deploy, `version.json` body must change while `index.html` references new hashed asset URLs.

---

## Staging

Apply the same rules for staging app host (e.g. `app-staging.pbookspro.com`) if used.
