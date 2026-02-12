# Pre-Upgrade Checklist

Complete before merging staging → production.

---

## Checklist

- [ ] **Staging tested** — All critical flows work: login, registration, P2P, tasks, WhatsApp
- [ ] **Backup production DB** — Render Dashboard → Database → Backups, or `pg_dump`
- [ ] **Clean git state** — No uncommitted changes
- [ ] **Staging up to date** — `staging` branch pulled
- [ ] **Production DB reachable** — Health check / API works (optional)

---

## Env vars (for scripts)

Set in `server/.env` or project `.env` when using schema scripts:

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` or `STAGING_DATABASE_URL` | Staging DB (external URL) |
| `PRODUCTION_DATABASE_URL` | Production DB (external URL) |

Use **external** DB URLs (e.g. Render “External Database URL”) so scripts can reach both.

---

## Ensure clean git state

```powershell
git status
```

If dirty:

```powershell
# Option A: Commit
git add .
git commit -m "Your message"

# Option B: Stash
git stash
```
