# Cursor Rules Audit Report — Architecture V2.1 Governance

**Date:** 2026-06-15  
**Authority:** `doc/ARCHITECTURE.md`, `doc/ARCHITECTURE_V2_AGENT_RULES.md`, `doc/ARCHITECTURE_V2_1_MODERNIZATION_PROGRESS.md`

---

## Step 1 — Audit Summary

### Rules audited (13 files before regeneration)

| File | Role | Verdict |
|------|------|---------|
| `architecture-v2-agent-compliance.mdc` | Master compliance (alwaysApply) | **Deprecated** → `00_architecture_authority.mdc` |
| `architecture-overview.mdc` | Runtime overview (alwaysApply) | **Deprecated** — duplicate of 00 |
| `architecture-backend.mdc` | Backend modules (globs) | **Deprecated** → `01_backend_architecture.mdc` |
| `architecture-frontend.mdc` | Frontend + real-time (globs) | **Deprecated** → `07_frontend_rules.mdc` + `03_realtime_sync.mdc` |
| `architecture-data.mdc` | Data layer (globs) | **Deprecated** → `02_database_rules.mdc` + `06_reporting_rules.mdc` |
| `server-api.mdc` | API conventions (globs) | **Deprecated** — merged into `01_backend_architecture.mdc` |
| `sql-migrations.mdc` | SQL migrations (globs) | **Deprecated** — merged into `02_database_rules.mdc` |
| `project-conventions.mdc` | Stack summary (alwaysApply) | **Deprecated** — merged into `00` / `07` |
| `react-patterns.mdc` | React UI (globs) | **Deprecated** — merged into `07_frontend_rules.mdc` |
| `commands.mdc` | Release/deploy commands | **Retained** — operational, not architecture |
| `auto-push-github.mdc` | Git push policy | **Retained** |
| `fix-issues-flow-feature.mdc` | Bugfix workflow | **Retained** |
| `typescript-standards.mdc` | TS style (globs) | **Retained** — complements 07 |

---

## Duplicates identified

| Topic | Duplicate files | Resolution |
|-------|-----------------|------------|
| Master architecture | `architecture-v2-agent-compliance.mdc`, `architecture-overview.mdc`, `project-conventions.mdc` | Single `00_architecture_authority.mdc` |
| Backend / API | `architecture-backend.mdc`, `server-api.mdc` | `01_backend_architecture.mdc` |
| Database / migrations | `architecture-data.mdc`, `sql-migrations.mdc` | `02_database_rules.mdc` |
| Frontend / React | `architecture-frontend.mdc`, `react-patterns.mdc` | `07_frontend_rules.mdc` |
| Real-time | Spread across compliance + backend + frontend | Dedicated `03_realtime_sync.mdc` |

---

## Conflicts with Architecture V2.1

| Issue | Location | Fix |
|-------|----------|-----|
| Stale report bundle path `backend/dist/*.mjs` | `architecture-data.mdc` | Updated to `reportEngines/index.ts` + `ensure-shared-report-engines.mjs` in `06_reporting_rules.mdc` |
| Three `alwaysApply: true` architecture rules | compliance + overview + project-conventions | One authority rule (`00`) + checklist (`10`) + startup (`99`) |
| SQLite still listed as runtime mode in `commands.mdc` | `electron:local`, `test:local-only` wording | Commands retained; architecture rules state PostgreSQL-only for **new** work |
| `/api` alias “removed” vs docs mentioning alias | Mixed | Rules align with v2.1: `/api/v1` only for new endpoints |

---

## Legacy / deprecated references found

| Reference | In rules | Action |
|-----------|----------|--------|
| `VITE_LOCAL_ONLY`, `sqliteBridge`, `services/database/` | architecture-frontend, overview, data | **Banned** in `00` + `02` + `05` |
| `backend/dist/*.mjs` report bundles | architecture-data | **Removed** — P4 complete |
| `loadReportEngine()` | (none in rules; was in code) | Document correct path in `06` |
| Flat `backend/src/routes/` for new handlers | backend, server-api | **Forbidden** in `01` |
| `electron:extract-schema` | architecture-data | **Deprecated** in `02` |

---

## Archived documents (agents must ignore)

Do **not** use as authority:

- Pre–v2.1 planning drafts superseded by `ARCHITECTURE_V2_1_MODERNIZATION_PROGRESS.md`
- `doc/SQLITE_REMOVAL.md` — historical log only (Phase 6 complete)
- Legacy `.cursor/plans/*` except as historical context

**Canonical sources:**

1. `doc/ARCHITECTURE.md`
2. `doc/ARCHITECTURE_V2_AGENT_RULES.md`
3. `doc/ARCHITECTURE_V2_1_MODERNIZATION_PROGRESS.md`
4. `doc/ARCHITECTURE_V2_POST_LAUNCH.md` (deferred items only)

---

## Step 3 — New rule hierarchy

```
.cursor/rules/
  00_architecture_authority.mdc    ← master (alwaysApply)
  01_backend_architecture.mdc
  02_database_rules.mdc
  03_realtime_sync.mdc
  04_accounting_rules.mdc
  05_procurement_rules.mdc
  06_reporting_rules.mdc
  07_frontend_rules.mdc
  08_security_rules.mdc
  09_permissions_rules.mdc
  10_completion_checklist.mdc       ← mandatory gate (alwaysApply)
  99_startup_check.mdc              ← pre-codegen check (alwaysApply)
  commands.mdc                      ← retained
  auto-push-github.mdc              ← retained
  fix-issues-flow-feature.mdc       ← retained
  typescript-standards.mdc          ← retained
```

---

## Deprecated rules (removed)

- `architecture-v2-agent-compliance.mdc`
- `architecture-overview.mdc`
- `architecture-backend.mdc`
- `architecture-frontend.mdc`
- `architecture-data.mdc`
- `server-api.mdc`
- `sql-migrations.mdc`
- `project-conventions.mdc`
- `react-patterns.mdc`

---

## Step 6 — Mandatory completion checklist (summary)

A feature is **not complete** unless it includes:

- [ ] API (`/api/v1`, module route)
- [ ] Tenant isolation (`tenant_id`, `TenantRepository`)
- [ ] Audit trail (`withAudit` / `recordDomainMutation`)
- [ ] Real-time synchronization (`emitEntityEvent` + client invalidation)
- [ ] Permissions (`shared/rbac`, route guards)
- [ ] Version conflict handling (LWW / HTTP 409 where applicable)
- [ ] Reporting integration (if financial or report-facing)
- [ ] Architecture compliance (this checklist)

## Summary of changes applied (2026-06-15)

1. Created **11 new governance rules** (`00`–`10`, `99`) regenerated from Architecture V2.1.
2. **Removed 9 deprecated rules** that duplicated or conflicted with the new hierarchy.
3. **Retained 4 operational rules**: `commands.mdc`, `auto-push-github.mdc`, `fix-issues-flow-feature.mdc`, `typescript-standards.mdc`.
4. Fixed stale references (`backend/dist/*.mjs`, `loadReportEngine`) in reporting/database rules.
5. Enforced **Real-Time First**, **PostgreSQL-only**, and **completion checklist** across all domain rules.

**Total rules after regeneration:** 15 files (11 governance + 4 operational).
