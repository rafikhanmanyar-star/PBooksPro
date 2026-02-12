# Git Commands — Upgrade Production from Staging

All git commands for merging staging into production.

---

## Option A: Use merge script (recommended)

```powershell
.\test\merge-to-production.ps1
```

**What it runs:**

1. `git status` — aborts if uncommitted changes
2. `git checkout staging` && `git pull origin staging`
3. `git checkout main` && `git tag "backup-before-merge-YYYYMMDD-HHMMSS"`
4. `git pull origin main`
5. `git merge staging --no-ff -m "Merge staging to production: YYYYMMDD-HHMMSS"`
6. `git push origin main`
7. `git push origin --tags`

---

## Option B: Manual git flow

```powershell
# 1. Ensure clean state
git status

# 2. Update staging
git checkout staging
git pull origin staging

# 3. Switch to main and create backup tag
git checkout main
git pull origin main
$ts = Get-Date -Format "yyyyMMdd-HHmmss"
git tag "backup-before-merge-$ts"

# 4. Merge staging into main
git merge staging --no-ff -m "Merge staging to production: $ts"

# 5. Push main and tags
git push origin main
git push origin --tags
```

---

## Resolving merge conflicts

If merge fails with conflicts:

```powershell
# 1. Resolve conflicts in affected files
# 2. Stage resolved files
git add .

# 3. Complete merge
git commit

# 4. Push
git push origin main
```

---

## Useful git commands during upgrade

| Command | Purpose |
|---------|---------|
| `git status` | Check for uncommitted changes |
| `git checkout staging` | Switch to staging |
| `git checkout main` | Switch to main (production) |
| `git log --oneline -5` | Recent commits |
| `git tag -l "backup-*"` | List backup tags |
