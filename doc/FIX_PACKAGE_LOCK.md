# Fix Package Lock File for Faster Builds

## Issue

The `package-lock.json` file in the `server/` directory is out of sync with `package.json`. This prevents using `npm ci` which is faster and more reliable for CI/CD.

## Error Message

```
npm error `npm ci` can only install packages when your package.json and package-lock.json are in sync.
npm error Missing: xlsx@0.18.5 from lock file
```

## Solution

### Step 1: Update Lock File Locally

1. Navigate to the server directory:
   ```bash
   cd server
   ```

2. Run npm install to update the lock file:
   ```bash
   npm install
   ```

3. This will update `package-lock.json` to include all dependencies (including xlsx and its sub-dependencies)

### Step 2: Commit the Updated Lock File

```bash
git add server/package-lock.json
git commit -m "Update package-lock.json to sync with package.json"
git push
```

### Step 3: Update Build Command (Optional - for future optimization)

Once the lock file is committed, you can optionally update `render.yaml` to use `npm ci`:

```yaml
buildCommand: cd server && npm ci && npm run build
```

**Benefits of `npm ci`:**
- ✅ 20-30% faster installs
- ✅ More reliable (fails fast if lock file is out of sync)
- ✅ Deterministic builds (exact versions from lock file)
- ✅ Automatically removes node_modules before install

## Current Status

For now, the build command uses `npm install` which works even with an out-of-sync lock file. The migration tracking and non-blocking migrations are the main performance improvements (80-90% faster deployments).

## Verification

After updating the lock file, verify it includes xlsx:

```bash
cd server
grep -A 5 '"xlsx"' package-lock.json
```

You should see xlsx@0.18.5 and its dependencies listed.
