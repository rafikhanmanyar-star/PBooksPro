# PBooks Pro – Deployment Architecture

This document describes how the API server, website, admin dashboard, and main app (desktop) are deployed and built.

## Overview

| Component        | Deployment          | Trigger                  | Where it runs          |
|------------------|---------------------|--------------------------|------------------------|
| **API Server**   | Render (auto)       | Push to `main` or `staging` | Render cloud           |
| **Website**      | Render (auto)       | Push to `main` or `staging` | Render cloud           |
| **Admin**        | Render (auto)       | Push to `main` or `staging` | Render cloud           |
| **Main app**     | Local build & install | Manual                  | User's Windows PC      |

Users access the main PBooks Pro app by **installing the desktop app** on their Windows PC. The main app is no longer accessed via a web URL; it is built with Electron and distributed as an installer.

---

## 1. Render Deployment (API, Website, Admin)

Render deploys automatically when you push to GitHub. No manual deploy step required.

### Production (main branch)

| Service              | URL                             | Build command                     |
|----------------------|----------------------------------|-----------------------------------|
| API Server           | https://api.pbookspro.com        | `cd server && npm install && npm run build` |
| Admin dashboard      | https://admin.pbookspro.com      | `cd admin && npm install && npm run build` |
| Marketing website    | https://www.pbookspro.com        | Static files from `website/Website` |

### Staging (staging branch)

| Service              | URL                                      |
|----------------------|------------------------------------------|
| API Server           | https://pbookspro-api-staging.onrender.com |
| Admin dashboard      | https://pbookspro-admin-staging.onrender.com |
| Marketing website    | https://pbookspro-website-staging.onrender.com |

### Setup

1. Connect the GitHub repo to Render (one-time).
2. Configure `render.yaml` in the repo root – it defines all services.
3. Set environment variables in the Render Dashboard (e.g. `DATABASE_URL`, payment keys).
4. Push to `main` or `staging` – Render builds and deploys the affected services.

---

## 2. Main App – Desktop Install (Electron)

The **main app** (the PBooks Pro client that users interact with) is delivered as a Windows desktop application. Users install it on their PC instead of accessing it via a web browser.

### Build & install locally

1. Clone the repo and install dependencies:
   ```bash
   git clone <repo-url>
   cd PBooksPro
   npm install
   ```

2. Build the installer:
   - **Production** (api.pbookspro.com): `npm run electron:production:installer` → `release/`
   - **Staging** (staging API only): `npm run electron:staging:installer` → `release-staging/`

3. Find the installer:
   - **Production**: `PBooks Pro Setup 1.1.6.exe` – NSIS installer
   - **Staging**: `PBooks Pro (Staging) Setup 1.1.6.exe` – connects to staging API only (never production)

### API connectivity

The desktop app talks to the **deployed** API on Render, not to a local server. Each build has a fixed API URL baked in – they are separate apps:

- **Production build**: `https://api.pbookspro.com/api` (production API/database only)
- **Staging build**: `https://pbookspro-api-staging.onrender.com/api` (staging API/database only)

The staging client will never connect to production. See `doc/ELECTRON_SETUP.md` for build commands.

### When to rebuild

Rebuild the desktop app when you need to:

- Ship a new version to users
- Change the bundled API URL or other build-time config

Code changes to the web app are reflected after a rebuild. Render deploys do **not** update the desktop app; users get updates only when they install a new version.

---

## 3. Deployment flow

```
Developer                    GitHub                    Render
    |                          |                          |
    | git push main            |                          |
    |------------------------->|                          |
    |                          | webhook                  |
    |                          |------------------------->|
    |                          |                          | Build API
    |                          |                          | Build Admin
    |                          |                          | Deploy website
    |                          |                          |

Main app (desktop):
Developer                    User's PC
    |                          |
    | npm run electron:installer
    |                          |
    | Distribute .exe -------->| Install & run (main app)
    |                          | Connects to Render API
```

---

## 4. Environment variables

| Variable         | Where set   | Purpose                                               |
|------------------|------------|--------------------------------------------------------|
| `DATABASE_URL`   | Render     | PostgreSQL connection for API                          |
| `CLIENT_URL`     | Render     | Website URL for payment return redirects (e.g. www.pbookspro.com) |
| `VITE_ADMIN_API_URL` | Render build | API base URL for admin dashboard                   |
| `CORS_ORIGIN`    | Render     | Allowed origins (admin, website, Electron main app uses `null`) |
| `VITE_API_URL`   | Local build | API base URL for main app (production or staging)  |

---

## 5. Related docs

- **`doc/ELECTRON_SETUP.md`** – Building the Windows desktop app
- **`doc/LOCAL_SQLITE_SYNC_PLAN.md`** – Planned migration to native SQLite + cloud PostgreSQL sync (replaces OPFS/IndexedDB)
- **`render.yaml`** – Render service definitions
- **`doc/WHATSAPP_MOCK_LOCAL_SETUP.md`** – Local WhatsApp mock for development
