# RBAC V2 Rollback Plan

**Phase:** A5.1.6A — Migration & Cutover Planning  
**Status:** Planning only  
**Authority:** [`RBAC_V2_ENGINE_ENABLEMENT.md`](./RBAC_V2_ENGINE_ENABLEMENT.md), [`RBAC_V2_STAGING_CUTOVER_PLAN.md`](./RBAC_V2_STAGING_CUTOVER_PLAN.md)

---

## Purpose

Define when to rollback RBAC V2 during staging or production cutover, what actions to take, and how to validate recovery. **No schema rollback required** for any flag disable.

---

## Rollback triggers

| Trigger | Severity | Typical cause |
|---------|----------|---------------|
| **Unauthorized access** | Critical | User accesses resource without permission; scope filter not applied |
| **Missing access** | Critical | Legitimate user blocked from required function post-migration |
| **Scope leak** | Critical | User sees records outside assigned project/property/department |
| **Approval bypass** | Critical | Journal/PO/bill posts without required approval when matrix enabled |
| **Unexpected TOKEN_STALE volume** | High | Mass 401s after flag enablement without communication window |
| **Performance degradation** | High | Auth middleware p95 latency >2× baseline sustained 15 min |
| **SoD false negative** | Critical | User holds create+approve pair after SoD enabled |
| **Break-glass failure** | High | Cannot activate recovery session during incident |

**Decision authority:** On-call engineer may disable flags immediately on Critical triggers; security lead notified within 1 hour.

---

## Rollback actions (flag disable order)

Disable in **reverse rollout order** — most recently enabled flag first:

| Order | Flag | Effect when disabled |
|-------|------|----------------------|
| 1 | `RBAC_V2_STRICT_MODE` | Unmapped permissions allowed again |
| 2 | `RBAC_V2_APPROVAL_MATRIX` | Legacy journal post + slug-based workflow approvers |
| 3 | `RBAC_V2_DATA_SCOPE` | Full tenant data visibility (no scope SQL filters) |
| 4 | `RBAC_V2_AUTHORIZATION_ENGINE` | Legacy `requirePermission`; tokens without `av` valid |
| 5 | `RBAC_V2_BREAK_GLASS` | Break-glass sessions unavailable |
| 6 | `RBAC_V2_ROLE_MANAGEMENT` | Custom role mutations disabled; assignments frozen via UI |
| 7 | `RBAC_V2_SOD` | SoD checks disabled — **see SoD rollback policy below** |

---

## RBAC_V2_SOD — independent flag policy (M3)

### Is SoD independent or coupled?

| Flag | Relationship |
|------|--------------|
| `RBAC_V2_SOD` | **Independent** env var — can be toggled separately from `RBAC_V2_ROLE_MANAGEMENT` |
| Practical coupling | SoD checks run only when role management mutations occur; disabling role management effectively freezes assignments, but **SoD remains enforced on any API path that calls `assertNoSodViolation()` while flag is true** |
| Stage 2 enablement | Both `RBAC_V2_ROLE_MANAGEMENT=true` and `RBAC_V2_SOD=true` are enabled together during normal rollout |

**Architecture policy:** SoD is **mandatory blocking** — no tenant override UI. Disabling `RBAC_V2_SOD` is a **security regression**, not a routine rollback step.

### Who may disable RBAC_V2_SOD?

| Actor | May disable? | Condition |
|-------|--------------|-----------|
| On-call engineer | **No** (alone) | Not authorized for SoD disable |
| Engineering lead | **No** (alone) | Must escalate |
| **Security Lead** | **Yes** | Written incident justification + time-boxed re-enable plan |
| Executive + Security Lead | **Yes** | Emergency only; post-incident review within 48h |

**Recommended procedure when SoD blocks legitimate work:**

1. **Do not disable SoD** as first action.
2. Adjust role assignments via snapshot restore or role split (Stage 6).
3. If false positive confirmed, fix SoD pair registry / expansion logic forward.
4. SoD disable only with **Security Lead approval** and incident ticket.

### Rollback table update

| Symptom | First action | SoD disable? |
|---------|--------------|--------------|
| SoD blocking legitimate work | Adjust role assignments; run `--sod-report` | **No** — unless Security Lead approves |
| SoD false negative (create+approve coexist) | **Enable/keep** `RBAC_V2_SOD=true`; fix assignments immediately | Never disable |
| Role management UI broken | `RBAC_V2_ROLE_MANAGEMENT=false` | Keep `RBAC_V2_SOD=true` if engine assignments still mutate |

### Staging / production procedure

```powershell
# Example: rollback approval matrix only
# Edit .env.staging or .env.production:
RBAC_V2_APPROVAL_MATRIX=false

# Restart API
npm run start:backend:staging   # port 3001
# or
npm run start:backend:production  # port 3000
```

### Frontend flags (mirror API)

| API flag | Client flag |
|----------|-------------|
| `RBAC_V2_ROLE_MANAGEMENT` | `VITE_RBAC_V2_ROLE_MANAGEMENT` |
| `RBAC_V2_DATA_SCOPE` | `VITE_RBAC_V2_DATA_SCOPE` |
| `RBAC_V2_APPROVAL_MATRIX` | `VITE_RBAC_V2_APPROVAL_MATRIX` |
| `RBAC_V2_BREAK_GLASS` | `VITE_RBAC_V2_BREAK_GLASS` |

Disable client flags when rolling back corresponding API features to avoid UI/API mismatch.

### Route guard caveat

Routes migrated to **`requirePermissionV2` only** return **503 AUTH_MISCONFIGURED** if engine is disabled. Before disabling engine:

1. Confirm route inventory — grep `requirePermissionV2` across `backend/src/modules/`.
2. Either revert route guards to `requirePermission` **or** keep engine enabled while fixing underlying issue.

**Planning note:** Full route migration is A5.1.6B scope; during A5.1.6A staging, maintain dual-guard compatibility where feasible.

---

## Rollback by symptom

| Symptom | First action | Second action |
|---------|--------------|---------------|
| Journal approval bypass | `RBAC_V2_APPROVAL_MATRIX=false` | Audit pending drafts; verify no orphan GL posts |
| Scope leak | `RBAC_V2_DATA_SCOPE=false` | Incident report; pen-test before re-enable |
| Mass TOKEN_STALE | Communicate re-login; if unresolved, `RBAC_V2_AUTHORIZATION_ENGINE=false` | Fix access_version bump source |
| Permission deny spike | Check `RBAC_V2_DENY` metric by route | Disable engine if parity failure |
| SoD blocking legitimate work | Adjust role assignments via snapshot restore | **Security Lead approval required** to disable `RBAC_V2_SOD` |
| Break-glass unavailable | Check `RBAC_V2_BREAK_GLASS` + MFA config | Escalate to platform admin |

---

## Recovery validation

After rollback, execute within **30 minutes**:

### Authentication

- [ ] Legacy user login succeeds without `av` claim (if engine off)
- [ ] `GET /health` returns 200
- [ ] Sample user per role can access previously working flows

### Authorization

- [ ] Critical mutations succeed for test personas (company_admin, accountant, sales_user, read_only)
- [ ] `RBAC_V2_DENY` rate returns to pre-enablement baseline (within 15 min)

### Approval (if matrix rolled back)

- [ ] Manual journal direct POST works (legacy path)
- [ ] Pending drafts reviewed — reject or complete manually

### Scope (if scope rolled back)

- [ ] Previously scoped user sees full tenant data (expected degraded state)
- [ ] No 500 errors on report endpoints

### Audit

- [ ] Rollback event recorded in operator log
- [ ] `rbac_audit_log` entries for break-glass / approval actions preserved (no DB rollback)

### Monitoring

- [ ] Alert thresholds reset or annotated as rollback window
- [ ] Incident ticket opened with trigger, flags changed, recovery timestamp

---

## Rollback drill (Stage 9 requirement)

| Step | Target |
|------|--------|
| Enable all v2 flags on staging | T+0 |
| Simulate Critical trigger (e.g., disable approval matrix) | T+15 min |
| Complete recovery validation checklist | T+30 min |
| Re-enable flag | T+45 min |
| Document elapsed time | **Target: <15 min** flag-to-recovery |

---

## What rollback does NOT do

| Item | Notes |
|------|-------|
| Drop RBAC tables | Schema is additive — preserved |
| Revert user assignments | `rbac_user_roles` data remains; legacy resolver uses it when role management on |
| Delete approval drafts | Manual cleanup if needed |
| Remove audit log | Immutable trail preserved |

---

## Post-rollback

1. Root cause analysis within 48 hours.
2. Fix forward plan before re-enablement.
3. Re-run failed stage exit criteria from [`RBAC_V2_STAGING_CUTOVER_PLAN.md`](./RBAC_V2_STAGING_CUTOVER_PLAN.md).
4. Claude re-review if security control was implicated.

---

*End of rollback plan.*
