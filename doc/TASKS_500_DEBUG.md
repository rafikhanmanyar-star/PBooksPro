# Tasks 500 Error When Creating Tasks (Production)

## Symptom

- **POST /api/tasks** returns **500** when creating a task.
- Frontend: "Failed to load resource: the server responded with a status of 500", "API Error: Object", "API Request Error: Object".

## Likely Cause

Production's **`tasks`** table can have an older schema (e.g. `text`, `completed`, `priority`) while the API expects the current schema (`title`, `description`, `type`, `category`, `status`, `start_date`, `hard_deadline`, etc.). The INSERT then fails with "column X does not exist" or similar.

## Fix Applied

1. **Migration `fix-tasks-missing-title-description.sql`**  
   Adds missing columns to `tasks` when they don't exist: `title`, `description`, `type`, `category`, `status`, `start_date`, `hard_deadline`, `created_by_id`, `created_at`, `updated_at`, `assigned_by_id`, `assigned_to_id`, and KPI-related columns.

2. **Startup migrations**  
   This migration runs automatically on API startup (after `add-tasks-schema`). After deploy, the API applies it to the production DB.

3. **Error logging**  
   The tasks route now logs full error details (`message`, `code`, `detail`) and, when `DEBUG_TASKS=1` or not in production, returns `message` (and `code`) in the 500 JSON body.

## What To Do

### 1. Deploy the latest code

Ensure the branch you deploy includes:

- `server/migrations/fix-tasks-missing-title-description.sql`
- The updated `run-migrations-on-startup.ts` that runs this migration
- The updated tasks route with improved error handling

Then deploy so migrations run on production.

### 2. Confirm migrations ran

Check production API startup logs for:

```
Running fix-tasks-missing-title-description from: ...
fix-tasks-missing-title-description completed
```

### 3. Retry creating a task

Try creating a task again. If it still fails, use step 4 to capture the real error.

### 4. Get the actual error (if still 500)

**Option A – Server logs**  
In production logs, look for:

```
Error creating task: { message: '...', code: '...', detail: '...' }
```

**Option B – API response**  
Set `DEBUG_TASKS=1` in the production API environment, then send **POST /api/tasks** again. The 500 response body can include `message` and `code`, e.g.:

```json
{ "error": "Failed to create task", "message": "column ... does not exist", "code": "42703" }
```

Use that to see if it's still a missing column, constraint, or something else.

### 5. Manually run the migration (if needed)

If the migration did not run on startup (e.g. path issue), run it yourself against the production DB:

```bash
psql $PRODUCTION_DATABASE_URL -f server/migrations/fix-tasks-missing-title-description.sql
```

Or use your DB UI (e.g. DBeaver) to execute the SQL file. **Back up the database first.**

## Summary

| Item | Action |
|------|--------|
| **Root cause** | Production `tasks` table missing columns required by POST /api/tasks |
| **Fix** | `fix-tasks-missing-title-description` migration adds them on startup |
| **Verify** | Check startup logs, retry task creation, inspect logs or `DEBUG_TASKS=1` response if still 500 |
