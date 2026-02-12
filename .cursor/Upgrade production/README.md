# Upgrade Production — Documentation Index

Instructions for upgrading the production app from staging, including database migrations and all git commands.

---

## Documents in this folder

| Document | Purpose |
|----------|---------|
| [01-pre-upgrade-checklist.md](01-pre-upgrade-checklist.md) | Pre-flight checklist and env vars |
| [02-git-commands.md](02-git-commands.md) | All git commands (script + manual flow) |
| [03-database-migration.md](03-database-migration.md) | DB migrations: automatic, generated, and manual |
| [04-verification-rollback.md](04-verification-rollback.md) | Post-upgrade verification and rollback |

---

## Quick reference

| Step | Action |
|------|--------|
| 1 | Complete [pre-upgrade checklist](01-pre-upgrade-checklist.md) |
| 2 | Run [git merge flow](02-git-commands.md) |
| 3 | Deploy (Render auto-deploys from `main`) |
| 4 | Migrations run automatically on startup |
| 5 | [Verify](04-verification-rollback.md) and smoke-test |

---

## Source docs

- `doc/PRODUCTION_UPGRADE_FROM_STAGING.md`
- `doc/PRODUCTION_UPGRADE_SCRIPT.md`
- `server/migrations/README.md`
