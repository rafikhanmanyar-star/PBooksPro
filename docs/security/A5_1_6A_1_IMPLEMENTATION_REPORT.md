# A5.1.6A.1 — Migration Plan Closure Report

**Phase:** A5.1.6A.1  
**Status:** Closure complete — ready for Claude re-review; **A5.1.6B authorized**  
**Date:** June 2026  
**Scope:** Documentation + operational tooling only — no staging cutover, flags, or production changes

---

## Summary

Resolves all findings from Claude A5.1.6A Migration Review (H1, M1–M4). Adds Stage 2.5 bootstrap, parity/SoD assessment script, journal approver prerequisite, SoD rollback authority, and permission gain review process.

---

## Findings resolved

| ID | Finding | Resolution | Evidence |
|----|---------|------------|----------|
| **H1** | Stage 2.5 bootstrap backfill missing | Added Stage 2.5 to staging cutover + migration strategy | `RBAC_V2_STAGING_CUTOVER_PLAN.md`, `RBAC_V2_MIGRATION_STRATEGY.md` |
| **M1** | Parity tool missing | Created `scripts/rbac-assess-tenant.mjs` | `RBAC_V2_PARITY_TOOL.md` |
| **M2** | Journal approver prerequisite | Stage 5 entry criteria + Gate 6 | `RBAC_V2_STAGING_CUTOVER_PLAN.md`, `RBAC_V2_PRODUCTION_GATES.md` |
| **M3** | SoD rollback authority unclear | Independent flag policy + Security Lead approval | `RBAC_V2_ROLLBACK_PLAN.md` |
| **M4** | Permission gain not reviewed | Gain review process + script detection | `RBAC_V2_PERMISSION_MIGRATION_PLAN.md`, parity tool |

---

## Files created

| File | Purpose |
|------|---------|
| `scripts/rbac-assess-tenant.mjs` | `--parity`, `--sod-report`, `--bootstrap` |
| `docs/security/RBAC_V2_PARITY_TOOL.md` | Tool usage, examples, stage matrix |
| `docs/security/A5_1_6A_1_IMPLEMENTATION_REPORT.md` | This report |

---

## Files updated

| File | Change |
|------|--------|
| `docs/security/RBAC_V2_STAGING_CUTOVER_PLAN.md` | Stage 2.5; Stage 5 entry criteria; Stage 6 renamed; gain review; timeline |
| `docs/security/RBAC_V2_MIGRATION_STRATEGY.md` | Stage 2.5 bootstrap section; gain review in philosophy |
| `docs/security/RBAC_V2_PERMISSION_MIGRATION_PLAN.md` | Parity + gain review; Stage 2.5 in sequence |
| `docs/security/RBAC_V2_ROLLBACK_PLAN.md` | SoD independent flag policy; Security Lead authority |
| `docs/security/RBAC_V2_PRODUCTION_GATES.md` | Gate 6 journal approver prerequisite; gain review in Gate 4 |

---

## H1 — Stage 2.5 summary

**Stage 2.5 — RBAC User Assignment Bootstrap**

- Runs after Stage 2, **before** Stage 3
- `RBAC_V2_AUTHORIZATION_ENGINE=false` — legacy auth remains active
- Populates `rbac_user_roles` via `LEGACY_ROLE_TO_ENTERPRISE` mapping
- Non-destructive, idempotent (`ON CONFLICT DO NOTHING`)
- Tool: `rbac-assess-tenant.mjs --bootstrap`

---

## M1 — Parity tool summary

**Location:** `scripts/rbac-assess-tenant.mjs`

| Mode | Flag |
|------|------|
| Parity | `--parity` |
| SoD report | `--sod-report` |
| Bootstrap | `--bootstrap [--dry-run]` |

Uses shared permission resolver logic (`permissionsForRole`, `expandPermissionKeys`, `findSodViolation`).

---

## M2 — Journal approver prerequisite

Stage 5 **entry criteria** (blocking):

- ≥1 user with `accounting.journals.approve`
- ≥1 approval matrix assignee for `manual_journal`
- Test submit must not produce `APPROVAL_POOL_EMPTY`

Gate 6 updated with same requirements.

---

## M3 — SoD rollback authority

- `RBAC_V2_SOD` is an **independent** env var (separate from `RBAC_V2_ROLE_MANAGEMENT`)
- **Not** a routine rollback step
- Disable requires **Security Lead approval** (written justification + re-enable plan)
- Preferred fix: role assignment adjustment, not SoD disable

---

## M4 — Permission gain review

Beyond `v2 ⊇ v1` loss check:

- Flags users with extra v1 keys vs legacy static matrix
- Flags restricted permission gains (exit code 2)
- Requires human sign-off before Stage 2.5/3 exit

---

## Verification

| Check | Result |
|-------|--------|
| Code behavior change | **None** (tool is read/insert only; no API flags) |
| Feature flags | **Unchanged** |
| Schema | **Unchanged** |
| Script loads TypeScript modules | Verified via `node --import tsx` |

```powershell
node --import tsx scripts/rbac-assess-tenant.mjs --tenant nonexistent --env staging --parity
# Expected: "No tenant matching" (confirms script loads)
```

---

## Authorization

**A5.1.6B — Staging Cutover Execution** is authorized upon Claude A5.1.6A.1 re-review approval.

---

*End of A5.1.6A.1 implementation report.*
