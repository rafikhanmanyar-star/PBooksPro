# PBooksPro Website Performance Report

Generated: 2026-06-09

## Targets

| Platform | Target | Expected after deploy |
|----------|--------|------------------------|
| Desktop PageSpeed | 95+ | 96–99 (with CDN + HTTP/2) |
| Mobile PageSpeed | 90+ | 90–94 (depends on hero image weight) |

## Before → After

| Metric | Before (audit) | After (production build) |
|--------|----------------|----------------------------|
| Homepage script requests | 22 separate files | 3 bundles + loader |
| JS transfer (homepage) | ~120–150 KB raw | ~219 KB minified (all bundles) |
| CSS | styles.css ~187 KB + FA ~90 KB CDN | ~232 KB minified local |
| Missing JS (404) | `faq.js`, `video-demo.js` | Implemented |
| LCP image | JPG preload + src | WebP only, `fetchpriority=high` |
| Analytics load | Blocking on parse | Deferred via `analytics-loader.js` |
| Font Awesome | `all.min.css` (~90 KB) | Subset CSS + `font-display: swap` |
| Cache policy | None | 1y immutable on hashed assets |

## Implemented fixes

1. **Images** — WebP hero LCP; build optimizes JPEG/PNG → WebP (requires `sharp`)
2. **Lazy loading** — Existing `loading=lazy` + video poster IntersectionObserver
3. **Code splitting** — `core`, `home`, `marketing`, page-specific bundles
4. **Tree shaking** — esbuild minify + dead code elimination on bundles
5. **Minify** — All production JS/CSS minified with content hashes
6. **Fonts** — System UI stack primary; FA with `font-display: swap` + icon CLS guards
7. **CLS** — `width/height` on images; `performance.css` icon sizing; `content-visibility`
8. **LCP** — Single WebP preload; removed duplicate JPG preload
9. **Caching** — `_headers` (Netlify) + `.htaccess` (Apache)
10. **Unused JS** — Removed 404 scripts; deferred marketing/analytics chunk

## Build & deploy

```bash
cd website
npm install
npm run build
# Deploy contents of website/dist/ to CDN/host
```

## Bundle manifest

```json
{
  "bundles": {
    "core": "assets/js/core.8faa59cc88.min.js",
    "home": "assets/js/home.991c066e16.min.js",
    "marketing": "assets/js/marketing.c4c6f0b3e0.min.js",
    "lite": "assets/js/lite.342c32a7f8.min.js",
    "demo": "assets/js/demo.b9e2d41ac1.min.js",
    "demo-login": "assets/js/demo-login.bed8ed1746.min.js",
    "trial": "assets/js/trial.a8f64cfba4.min.js",
    "pricing-page": "assets/js/pricing-page.c151324e4f.min.js",
    "contact": "assets/js/contact.84d8f6eb4c.min.js",
    "blog": "assets/js/blog.cdaf0c10c6.min.js",
    "support": "assets/js/support.7cd42d4b70.min.js",
    "analytics-loader": "assets/js/analytics-loader.d4649ac7a3.min.js"
  },
  "css": [
    "assets/css/styles.2ee9800f4f.min.css",
    "assets/css/performance.593bf96dec.min.css",
    "assets/css/icons.274cb0f6e2.min.css"
  ],
  "pages": {
    "about.html": [
      "core",
      "analytics-loader"
    ],
    "assets/checklists/property-management-accounting-checklist.html": [
      "core",
      "analytics-loader"
    ],
    "blog/construction-cost-control-best-practices.html": [
      "core",
      "lite",
      "analytics-loader"
    ],
    "blog/property-management-accounting-guide.html": [
      "core",
      "lite",
      "analytics-loader"
    ],
    "blog/quickbooks-alternatives-for-property-managers.html": [
      "core",
      "lite",
      "analytics-loader"
    ],
    "blog/real-estate-financial-reporting.html": [
      "core",
      "lite",
      "analytics-loader"
    ],
    "blog/rental-property-accounting-checklist.html": [
      "core",
      "lite",
      "analytics-loader"
    ],
    "blog.html": [
      "core",
      "blog",
      "analytics-loader"
    ],
    "contact.html": [
      "core",
      "contact",
      "analytics-loader"
    ],
    "demo-login.html": [
      "core",
      "demo-login",
      "analytics-loader"
    ],
    "demo-success.html": [
      "core",
      "analytics-loader"
    ],
    "demo.html": [
      "core",
      "demo",
      "analytics-loader"
    ],
    "dist/assets/checklists/property-management-accounting-checklist.html": [
      "core",
      "analytics-loader"
    ],
    "dist/blog/construction-cost-control-best-practices.html": [
      "core",
      "analytics-loader"
    ],
    "dist/blog/property-management-accounting-guide.html": [
      "core",
      "analytics-loader"
    ],
    "dist/blog/quickbooks-alternatives-for-property-managers.html": [
      "core",
      "analytics-loader"
    ],
    "dist/blog/real-estate-financial-reporting.html": [
      "core",
      "analytics-loader"
    ],
    "dist/blog/rental-property-accounting-checklist.html": [
      "core",
      "analytics-loader"
    ],
    "dist/solutions/construction-accounting-software-pakistan.html": [
      "core",
      "lite",
      "analytics-loader"
    ],
    "dist/solutions/construction-erp-uae.html": [
      "core",
      "lite",
      "analytics-loader"
    ],
    "dist/solutions/index.html": [
      "core",
      "home",
      "analytics-loader"
    ],
    "dist/solutions/property-management-software-pakistan.html": [
      "core",
      "lite",
      "analytics-loader"
    ],
    "dist/solutions/property-management-software-qatar.html": [
      "core",
      "lite",
      "analytics-loader"
    ],
    "dist/solutions/property-management-software-uae.html": [
      "core",
      "lite",
      "analytics-loader"
    ],
    "dist/solutions/real-estate-accounting-software-pakistan.html": [
      "core",
      "lite",
      "analytics-loader"
    ],
    "dist/solutions/real-estate-erp-saudi-arabia.html": [
      "core",
      "lite",
      "analytics-loader"
    ],
    "download.html": [
      "core",
      "trial",
      "analytics-loader"
    ],
    "features.html": [
      "core",
      "analytics-loader"
    ],
    "help.html": [
      "core",
      "analytics-loader"
    ],
    "index.html": [
      "core",
      "home",
      "analytics-loader"
    ],
    "node_modules/union/examples/socketio/index.html": [
      "core",
      "home",
      "analytics-loader"
    ],
    "pricing.html": [
      "core",
      "pricing-page",
      "analytics-loader"
    ],
    "privacy.html": [
      "core",
      "analytics-loader"
    ],
    "solutions/construction-accounting-software-pakistan.html": [
      "core",
      "lite",
      "analytics-loader"
    ],
    "solutions/construction-erp-uae.html": [
      "core",
      "lite",
      "analytics-loader"
    ],
    "solutions/index.html": [
      "core",
      "home",
      "analytics-loader"
    ],
    "solutions/property-management-software-pakistan.html": [
      "core",
      "lite",
      "analytics-loader"
    ],
    "solutions/property-management-software-qatar.html": [
      "core",
      "lite",
      "analytics-loader"
    ],
    "solutions/property-management-software-uae.html": [
      "core",
      "lite",
      "analytics-loader"
    ],
    "solutions/real-estate-accounting-software-pakistan.html": [
      "core",
      "lite",
      "analytics-loader"
    ],
    "solutions/real-estate-erp-saudi-arabia.html": [
      "core",
      "lite",
      "analytics-loader"
    ],
    "support.html": [
      "core",
      "support",
      "analytics-loader"
    ],
    "terms.html": [
      "core",
      "analytics-loader"
    ]
  }
}
```

## Recommendations (post-deploy)

- Serve `dist/` behind Cloudflare or Netlify with Brotli enabled
- Upload a real product tour video ID in `video-demo.js` (facade already defers iframe)
- Add responsive `srcset` for hero (`600w`, `900w`, `1200w`) when multiple widths exist
- Run Lighthouse CI on `index.html` and `pricing.html` after each release
- Consider self-hosting FA woff2 subset (~15 KB) to eliminate third-party font latency

## Page bundle map

- `about.html` → core, analytics-loader
- `assets/checklists/property-management-accounting-checklist.html` → core, analytics-loader
- `blog/construction-cost-control-best-practices.html` → core, lite, analytics-loader
- `blog/property-management-accounting-guide.html` → core, lite, analytics-loader
- `blog/quickbooks-alternatives-for-property-managers.html` → core, lite, analytics-loader
- `blog/real-estate-financial-reporting.html` → core, lite, analytics-loader
- `blog/rental-property-accounting-checklist.html` → core, lite, analytics-loader
- `blog.html` → core, blog, analytics-loader
- `contact.html` → core, contact, analytics-loader
- `demo-login.html` → core, demo-login, analytics-loader
- `demo-success.html` → core, analytics-loader
- `demo.html` → core, demo, analytics-loader
- `dist/assets/checklists/property-management-accounting-checklist.html` → core, analytics-loader
- `dist/blog/construction-cost-control-best-practices.html` → core, analytics-loader
- `dist/blog/property-management-accounting-guide.html` → core, analytics-loader
- `dist/blog/quickbooks-alternatives-for-property-managers.html` → core, analytics-loader
- `dist/blog/real-estate-financial-reporting.html` → core, analytics-loader
- `dist/blog/rental-property-accounting-checklist.html` → core, analytics-loader
- `dist/solutions/construction-accounting-software-pakistan.html` → core, lite, analytics-loader
- `dist/solutions/construction-erp-uae.html` → core, lite, analytics-loader
- `dist/solutions/index.html` → core, home, analytics-loader
- `dist/solutions/property-management-software-pakistan.html` → core, lite, analytics-loader
- `dist/solutions/property-management-software-qatar.html` → core, lite, analytics-loader
- `dist/solutions/property-management-software-uae.html` → core, lite, analytics-loader
- `dist/solutions/real-estate-accounting-software-pakistan.html` → core, lite, analytics-loader
- `dist/solutions/real-estate-erp-saudi-arabia.html` → core, lite, analytics-loader
- `download.html` → core, trial, analytics-loader
- `features.html` → core, analytics-loader
- `help.html` → core, analytics-loader
- `index.html` → core, home, analytics-loader
- `node_modules/union/examples/socketio/index.html` → core, home, analytics-loader
- `pricing.html` → core, pricing-page, analytics-loader
- `privacy.html` → core, analytics-loader
- `solutions/construction-accounting-software-pakistan.html` → core, lite, analytics-loader
- `solutions/construction-erp-uae.html` → core, lite, analytics-loader
- `solutions/index.html` → core, home, analytics-loader
- `solutions/property-management-software-pakistan.html` → core, lite, analytics-loader
- `solutions/property-management-software-qatar.html` → core, lite, analytics-loader
- `solutions/property-management-software-uae.html` → core, lite, analytics-loader
- `solutions/real-estate-accounting-software-pakistan.html` → core, lite, analytics-loader
- `solutions/real-estate-erp-saudi-arabia.html` → core, lite, analytics-loader
- `support.html` → core, support, analytics-loader
- `terms.html` → core, analytics-loader
