# Quick Guide: Rollback WhatsApp from Main → Move to Staging

## Situation
- Commit `36112cf "Whatsapp Integration"` was pushed to `origin/main` by mistake
- It should be on `staging` branch instead
- Need to remove from main and add to staging

## Quick Solution (Automated Script)

Run the PowerShell script:
```powershell
.\move-whatsapp-to-staging.ps1
```

The script will:
1. Fetch latest changes
2. Checkout main and revert the WhatsApp commit
3. Push reverted main
4. Checkout staging and cherry-pick the WhatsApp commit
5. Push staging

## Manual Solution (Step by Step)

### 1. Revert from Main (Safe - Preserves History)

```bash
# Switch to main branch
git checkout main
git pull origin main

# Revert the WhatsApp commit (creates a new commit that undoes changes)
git revert 36112cf -m 1

# Push reverted main
git push origin main
```

### 2. Add to Staging

```bash
# Switch to staging branch
git checkout staging
git pull origin staging

# Cherry-pick the WhatsApp commit
git cherry-pick 36112cf

# Push staging
git push origin staging
```

## Verify

After completion, verify:

```bash
# Check main - should show revert commit
git log origin/main --oneline -5

# Check staging - should show WhatsApp commit
git log origin/staging --oneline -5

# Verify files
git checkout staging
ls server/api/routes/whatsapp.ts  # Should exist

git checkout main
ls server/api/routes/whatsapp.ts  # Should not exist (or show as deleted in revert)
```

## Alternative: Reset (Dangerous - Rewrites History)

⚠️ **Only use if you're the only one working on main branch!**

```bash
# Switch to main
git checkout main
git pull origin main

# Reset to commit before WhatsApp (179a18c)
git reset --hard 179a18c

# Force push (DANGEROUS!)
git push origin main --force

# Then cherry-pick to staging (same as above)
git checkout staging
git cherry-pick 36112cf
git push origin staging
```

## Files Changed in WhatsApp Commit

The commit includes these WhatsApp-related files:
- `server/api/routes/whatsapp.ts`
- `server/api/routes/whatsapp-webhook.ts`
- `server/services/whatsappApiService.ts`
- `server/services/encryptionService.ts`
- `server/migrations/add-whatsapp-integration.sql`
- `server/scripts/run-whatsapp-migration.ts`
- `server/scripts/test-whatsapp-api.ts`
- `doc/WHATSAPP_API_TESTING.md`
- Updates to `server/api/index.ts`
- Updates to `server/services/websocketHelper.ts`
- Updates to `server/package.json`

## Troubleshooting

### Conflicts during revert
If there are conflicts when reverting:
1. Resolve conflicts manually
2. `git add .`
3. `git revert --continue`

### Conflicts during cherry-pick
If there are conflicts when cherry-picking:
1. Resolve conflicts manually
2. `git add .`
3. `git cherry-pick --continue`

### Need to abort
- Revert: `git revert --abort`
- Cherry-pick: `git cherry-pick --abort`
