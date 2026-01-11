git # Git Commands: Merge Staging to Production

## Step-by-Step Commands

### 1. Make sure staging changes are committed and pushed

```powershell
# Switch to staging branch
git checkout staging

# Check for uncommitted changes
git status

# If there are changes, commit them first:
# git add .
# git commit -m "Your commit message"
# git push origin staging

# Then pull latest staging from remote
git pull origin staging
```

### 2. Switch to main (production) branch

```powershell
# Switch back to main branch
git checkout main

# Pull latest production code
git pull origin main
```

### 3. Handle any local changes (if needed)

If you have uncommitted changes you want to keep:
```powershell
# Option A: Stash them temporarily
git stash push -m "Temporary stash before merge"

# After merge, restore them:
# git stash pop
```

If you want to discard local changes:
```powershell
# Option B: Discard changes (CAREFUL - this deletes uncommitted changes)
git restore .
```

### 4. Merge staging into main

```powershell
# Merge staging branch into main
git merge staging -m "Merge staging to production - [Your description]"

# If there are conflicts, resolve them, then:
# git add .
# git commit -m "Resolve merge conflicts"
```

### 5. Push to production

```powershell
# Push merged changes to production
git push origin main
```

---

## Quick One-Liner (if no conflicts expected)

```powershell
# Make sure you're on main and everything is clean
git checkout main
git pull origin main
git merge staging -m "Merge staging to production"
git push origin main
```

---

## After Merging

1. **Monitor Render Dashboard** - Production services will auto-deploy
2. **Check Production Logs** - Verify deployments are successful
3. **Test Production URLs** - Ensure everything works

---

## Troubleshooting

### Merge Conflicts
If you get conflicts:
```powershell
# See which files have conflicts
git status

# Resolve conflicts in your editor, then:
git add .
git commit -m "Resolve merge conflicts"
git push origin main
```

### If staging hasn't been pushed
```powershell
# On staging branch
git checkout staging
git push origin staging

# Then switch back to main and merge
git checkout main
git merge staging
git push origin main
```
