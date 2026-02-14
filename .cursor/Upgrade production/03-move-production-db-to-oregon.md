# Move Production Database from Virginia to Oregon

## Problem

- **Production API** (`pbookspro-api`) is in **Oregon**
- **Production DB** (`pbookspro-db`) is in **Virginia**

Cross-region API↔DB traffic causes high latency. When Sync Manager runs (on login/reconnection), the app makes many round trips—each one delayed by Virginia↔Oregon latency.

## Solution

Create a new PostgreSQL database in **Oregon**, migrate production data from Virginia, point production API to the new DB, then delete the Virginia database.

---

## Phase 1: Create New Database in Oregon

1. Go to [Render Dashboard](https://dashboard.render.com/) → **New** → **PostgreSQL**
2. Configure:
   - **Name**: `pbookspro-db-oregon` (or keep `pbookspro-db` after renaming later)
   - **Region**: **Oregon (USA)** — same as production API
   - **Database name**: same as current (e.g., `pbookspro`)
   - **User**: same as current (e.g., `pbookspro_user`)
   - **Instance type**: same or higher than current production
3. Click **Create Database** and wait for status **Available**
4. From **Connect** menu, copy:
   - **Internal URL** (for Render services in Oregon)
   - **External URL** (for pg_dump/pg_restore from your machine)

---

## Phase 2: Backup Data from Virginia

1. In Render Dashboard → `pbookspro-db` → **Connect** → copy **External Database URL**
2. On your machine (PowerShell):

```powershell
$VIRGINIA_URL = "postgresql://user:password@dpg-xxx.oregon-postgres.render.com:5432/pbookspro"
$BACKUP_FILE = "production_backup_$(Get-Date -Format 'yyyyMMdd-HHmmss').dump"

pg_dump $VIRGINIA_URL -F c -f $BACKUP_FILE
Get-Item $BACKUP_FILE
```

If `pg_dump` is not installed:

```powershell
choco install postgresql
# Or download from https://www.postgresql.org/download/windows/
```

---

## Phase 3: Restore Data into Oregon DB

```powershell
$OREGON_URL = "postgresql://user:password@dpg-yyy.oregon-postgres.render.com:5432/pbookspro"
$BACKUP_FILE = "production_backup_YYYYMMDD-HHMMSS.dump"

pg_restore -d $OREGON_URL --clean --if-exists --no-owner --no-acl $BACKUP_FILE
```

Some extension/ownership warnings can be ignored. Verify data in Phase 4.

---

## Phase 4: Verify New Oregon DB

```powershell
# List tables
psql $OREGON_URL -c "\dt"

# Compare row counts
psql $OREGON_URL -c "SELECT relname, n_live_tup FROM pg_stat_user_tables ORDER BY n_live_tup DESC;"

# Spot-check critical tables
psql $OREGON_URL -c "SELECT COUNT(*) FROM transactions;"
psql $OREGON_URL -c "SELECT COUNT(*) FROM users;"
psql $OREGON_URL -c "SELECT COUNT(*) FROM contacts;"
```

Compare counts with the Virginia DB.

---

## Phase 5: Switch Production API to Oregon DB

1. Render Dashboard → **Services** → `pbookspro-api` → **Environment**
2. Update `DATABASE_URL` with the **Internal Database URL** of `pbookspro-db-oregon`
3. **Save Changes** (Render will redeploy)
4. Test production:
   - Log in
   - Verify Sync Manager works
   - Confirm data loads correctly

---

## Phase 6: Delete Virginia DB (After Verification)

1. Run production normally for at least a few days
2. Optional final backup:

```powershell
pg_dump $VIRGINIA_URL -F c -f production_final_backup_before_delete.dump
```

3. Render Dashboard → `pbookspro-db` (Virginia) → **Settings** → **Delete Database**
4. Optional: Rename `pbookspro-db-oregon` to `pbookspro-db` for clarity

---

## Checklist

| Step | Action | Status |
|------|--------|--------|
| 1 | Create PostgreSQL in Oregon | |
| 2 | pg_dump from Virginia | |
| 3 | pg_restore into Oregon | |
| 4 | Verify row counts and tables | |
| 5 | Update DATABASE_URL on pbookspro-api | |
| 6 | Test production app and sync | |
| 7 | Delete Virginia DB (after verification) | |

---

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Data loss during migration | Full pg_dump backup; verify row counts before switch |
| Downtime during switch | Schedule low-traffic window; env change triggers brief redeploy |
| Oregon DB too small | Match or exceed Virginia instance type and storage |
