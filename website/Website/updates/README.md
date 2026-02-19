# Electron Auto-Update Files

**Note:** The `latest.yml` for auto-updates is now served from the API server
(`server/updates/latest.yml`), not from this static site directory.

Render's static site hosting does not reliably serve `.yml` files, so the
update metadata endpoint was moved to the Express API at:

- Production: `https://api.pbookspro.com/api/app-info/updates/latest.yml`
- Staging: `https://pbookspro-api-staging.onrender.com/api/app-info/updates/latest.yml`

The installer exe is hosted on GitHub Releases.

See `server/updates/latest.yml` for the update metadata file.
