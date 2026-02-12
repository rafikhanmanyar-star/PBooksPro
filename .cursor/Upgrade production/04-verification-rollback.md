# Verification and Rollback

Post-upgrade checks and how to roll back if needed.

---

## 1. Post-upgrade verification

### 1.1 Server startup logs

Look for messages such as:

```
✅ Database migrations completed successfully
✅ Payment tables migration completed
✅ P2P migration completed
✅ org_id migration completed
✅ contact_id migration completed
```

`⚠️ … already exists (skipping)` is normal for already-migrated DBs.

### 1.2 Rental agreements migration

```bash
cd server
npm run verify-rental-migration
```

Expected:

```
✅ ALL MIGRATIONS COMPLETED SUCCESSFULLY
   - org_id column exists with all constraints and indexes
   - contact_id column exists with all constraints and indexes
```

### 1.3 Schema parity (optional)

```bash
cd server
npm run verify-schema-parity
```

Requires `DATABASE_URL` and `PRODUCTION_DATABASE_URL` in `.env`.

### 1.4 Smoke tests

- [ ] `GET /health` → `{"status":"ok","database":"connected"}`
- [ ] Login (admin and tenant users)
- [ ] Key APIs: rental agreements, transactions, tasks, P2P, WhatsApp

---

## 2. Rollback

### 2.1 Code rollback (revert merge)

```powershell
git revert -m 1 <merge-commit-hash>
git push origin main
```

Redeploy so production runs the previous code.

### 2.2 Database rollback

Restore production from the backup created before upgrade (Render backups or `pg_restore`).

### 2.3 Use backup tag for pre-merge code

```powershell
git checkout backup-before-merge-YYYYMMDD-HHMMSS
git checkout -b hotfix-rollback
git push origin hotfix-rollback
```

---

## 3. Next steps after merge (from script)

1. Wait for Render deploy
2. `cd server && npm run verify-rental-migration`
3. Check startup logs for migration success
4. Test `GET /api/rental-agreements`
5. Monitor logs for DB/500 errors
