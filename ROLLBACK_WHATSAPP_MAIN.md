# Rollback WhatsApp from Main and Move to Staging

## Current Situation
- WhatsApp Integration commit (36112cf) was pushed to `origin/main`
- It should have been pushed to `staging` branch instead
- Need to rollback from main and move to staging

## Solution Steps

### Option 1: Safe Revert (Recommended - Preserves History)

This keeps the commit in history but undoes the changes on main.

1. **Checkout main branch**
   ```bash
   git checkout main
   git pull origin main
   ```

2. **Revert the WhatsApp commit**
   ```bash
   git revert 36112cf -m 1
   ```
   This creates a new commit that undoes the changes.

3. **Push reverted main**
   ```bash
   git push origin main
   ```

4. **Checkout staging branch**
   ```bash
   git checkout staging
   git pull origin staging
   ```

5. **Cherry-pick the WhatsApp commit to staging**
   ```bash
   git cherry-pick 36112cf
   ```

6. **Push staging with WhatsApp changes**
   ```bash
   git push origin staging
   ```

### Option 2: Reset and Force Push (Dangerous - Rewrites History)

**⚠️ WARNING: Only use if you're the only one working on main branch!**

This removes the commit from main's history entirely.

1. **Checkout main branch**
   ```bash
   git checkout main
   git pull origin main
   ```

2. **Reset to before the WhatsApp commit**
   ```bash
   git reset --hard 179a18c
   ```
   (179a18c is the commit before WhatsApp integration)

3. **Force push main (DANGEROUS - only if safe)**
   ```bash
   git push origin main --force
   ```

4. **Checkout staging**
   ```bash
   git checkout staging
   git pull origin staging
   ```

5. **Cherry-pick WhatsApp commit**
   ```bash
   git cherry-pick 36112cf
   ```

6. **Push staging**
   ```bash
   git push origin staging
   ```

## Recommended Approach

Use **Option 1 (Revert)** because:
- ✅ Preserves git history
- ✅ Safe for shared branches
- ✅ Can be undone if needed
- ✅ Doesn't require force push

## Verification

After completing the steps:

1. **Verify main doesn't have WhatsApp files**
   ```bash
   git checkout main
   git log --oneline -5
   ls server/api/routes/whatsapp.ts  # Should not exist or be in reverted state
   ```

2. **Verify staging has WhatsApp files**
   ```bash
   git checkout staging
   git log --oneline -5
   ls server/api/routes/whatsapp.ts  # Should exist
   ```

3. **Check branch status**
   ```bash
   git log origin/main --oneline -5
   git log origin/staging --oneline -5
   ```
