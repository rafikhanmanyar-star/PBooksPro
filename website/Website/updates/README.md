# Electron Auto-Update Files

This directory hosts `latest.yml` for the PBooks Pro desktop auto-updater.
The actual installer exe is hosted on GitHub Releases (too large for git).

## How it works

1. Electron `autoUpdater` fetches `latest.yml` from this directory (via Render static site)
2. `latest.yml` contains the version, sha512 hash, and a full URL to the exe on GitHub Releases
3. `autoUpdater` downloads the exe directly from GitHub Releases

## How to publish an update

1. Bump version in `package.json` (e.g. `1.3.0`)
2. Run `npm run electron:production:installer`
3. Go to GitHub repo > Releases > Create new release
   - Tag: `v1.3.0`
   - Upload `release/PBooks Pro Setup 1.3.0.exe`
   - Publish the release
4. Edit `latest.yml` in this folder:
   - Update `version` to the new version
   - Update `url` and `path` to the new GitHub Release download URL
   - Copy `sha512` and `size` from the generated `release/latest.yml`
   - Update `releaseDate`
5. Commit and push `latest.yml` to `main`
6. Render auto-deploys; existing installations detect the update

## File reference

- `latest.yml` - Update metadata (version, download URL, sha512 hash)
- The exe is NOT stored here -- it lives on GitHub Releases
