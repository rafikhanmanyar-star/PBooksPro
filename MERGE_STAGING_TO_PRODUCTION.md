# Git Commands: Merge Staging to Production

This guide provides step-by-step git commands to merge the `staging` branch into `production` (or `main`) to upgrade production.

## Prerequisites
- Ensure you have a clean working directory (no uncommitted changes)
- Ensure you have the latest changes from both branches

## Step-by-Step Commands

### 1. Ensure you're on staging and it's up to date
```bash
git checkout staging
git pull origin staging
```

### 2. Switch to production branch (main)
```bash
git checkout main
```
*Note: If your production branch is named `master` or `production`, replace `main` with the appropriate branch name.*

### 3. Pull latest changes from production
```bash
git pull origin main
```
*This ensures you have the latest production code before merging.*

### 4. Merge staging into production
```bash
git merge staging
```

### 5. If there are merge conflicts
- Resolve conflicts manually in the affected files
- After resolving, stage the resolved files:
```bash
git add .
```
- Complete the merge:
```bash
git commit
```

### 6. Push the merged changes to production
```bash
git push origin main
```

## Alternative: Using a single command sequence (PowerShell)

```powershell
# Navigate to project directory
cd "H:\AntiGravity projects\V1.1.3\MyProjectBooks"

# Update staging branch
git checkout staging
git pull origin staging

# Switch to production and merge
git checkout main
git pull origin main
git merge staging

# If merge is successful, push to production
git push origin main
```

## Alternative: Using a single command sequence (Bash/Git Bash)

```bash
# Navigate to project directory
cd "H:/AntiGravity projects/V1.1.3/MyProjectBooks"

# Update staging branch
git checkout staging
git pull origin staging

# Switch to production and merge
git checkout main
git pull origin main
git merge staging

# If merge is successful, push to production
git push origin main
```

## Quick Reference (All Commands in Order)

```bash
git checkout staging
git pull origin staging
git checkout main
git pull origin main
git merge staging
git push origin main
```

## Important Notes

1. **Branch Name**: If your production branch is named `master` or `production` instead of `main`, replace `main` with your actual production branch name in all commands above.

2. **Merge Conflicts**: If conflicts occur during the merge, you'll need to:
   - Resolve conflicts in the affected files
   - Stage the resolved files with `git add .`
   - Complete the merge with `git commit`
   - Then push with `git push origin main`

3. **Testing**: Consider testing the merge in a local environment before pushing to production.

4. **Backup**: It's recommended to create a backup tag before merging:
   ```bash
   git checkout main
   git tag backup-before-merge-$(Get-Date -Format "yyyyMMdd-HHmmss")
   git push origin --tags
   ```

5. **Verification**: After pushing, verify the production deployment to ensure everything works correctly.
