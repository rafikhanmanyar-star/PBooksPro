# Production Upgrade Guide (Staging -> Production)

Follow these steps to safely merge tested changes from your **staging** branch into **production**.

## Prerequisites
- Ensure you have a clean working directory (no uncommitted changes).
- Ensure your `staging` branch is up-to-date and fully tested.

## Step-by-Step Commands

### 1. Fetch Latest Changes
First, make sure your local repository knows about the latest state of all branches.
```bash
git fetch --all
```

### 2. Switch to Staging and Pull
Ensure your local `staging` branch has the latest code.
```bash
git checkout staging
git pull origin staging
```

### 3. Switch to Production (Main/Master)
Switch to your production branch (commonly `main` or `master`). Replace `main` with your actual production branch name if it differs.
```bash
git checkout main
```

### 4. Pull Latest Production Code
Ensure your local production branch is up-to-date before merging.
```bash
git pull origin main
```

### 5. Merge Staging into Production
Merge the changes from `staging`.
```bash
git merge staging
```
*If there are merge conflicts, resolve them, add the files (`git add .`), and commit (`git commit`).*

### 6. Push to Production Server
Push the merged changes to the remote production branch.
```bash
git push origin main
```

### 7. Tag the Release (Optional but Recommended)
Tagging creates a specific point in history for this release, helpful for rollbacks.
```bash
git tag -a v1.x.x -m "Release v1.x.x - Upgraded from Staging"
git push origin v1.x.x
```
*(Replace `v1.x.x` with your actual version number)*

---

## Quick One-Liner (For advanced users)
If you are confident and on the `main` branch:
```bash
git fetch --all && git merge origin/staging && git push origin main
```
