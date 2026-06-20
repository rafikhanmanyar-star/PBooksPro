# RBAC V2 Monitoring Plan

**Phase:** A5.1.6A — Migration & Cutover Planning  
**Status:** Planning only  
**Implementation:** `backend/src/auth/rbacV2Metrics.ts` → `captureMonitoringEvent`  
**Authority:** [`RBAC_V2_ROLLBACK_PLAN.md`](./RBAC_V2_ROLLBACK_PLAN.md)

---

## Purpose

Define observability for RBAC V2 cutover: expected baselines, alert thresholds, and rollback triggers per metric.

**Note:** Metrics emit to the application monitoring pipeline (`category: authentication`). Dashboards and alert routing are operator responsibilities during A5.1.6B.

---

## Metric inventory

| Metric code | Emitted when | Severity |
|-------------|--------------|----------|
| `RBAC_V2_DENY` | `requirePermissionV2` denies access | warn |
| `RBAC_V2_STALE_AV` | JWT `av` mismatch → 401 TOKEN_STALE | warn |
| `RBAC_V2_SCOPE_DENY` | Scope check denies access | warn |
| `RBAC_V2_APPROVAL_REQUIRED` | Entity requires approval before post | info |
| `RBAC_V2_APPROVAL_REJECTED` | Approval action rejected (SoD, self, pool) | warn |
| `RBAC_V2_BREAK_GLASS` | Break-glass session activity | info/warn |
| `RBAC_V2_PERMISSION_CHECK` | Successful permission check (sample) | info |
| `RBAC_V2_SCOPE_FILTER` | Repository applied scope filter | info |
| `RBAC_V2_APPROVAL_GRANTED` | Approval succeeded | info |
| `RBAC_V2_SCOPE_HASH_CHANGE` | Scope mutation bumped hash | info |
| `RBAC_V2_APPROVAL_HASH_CHANGE` | Matrix mutation bumped hash | info |

**Audit correlate:** `BREAK_GLASS_ACTIVATED` in `rbac_audit_log` (not a metric code — join via audit for session start).

---

## Per-metric thresholds

Baselines assume **pre-cutover legacy mode** as ~0 events/hour for v2 metrics. Adjust after each stage enablement during a **7-day baseline window**.

### RBAC_V2_DENY

| Level | Threshold | Action |
|-------|-----------|--------|
| **Expected baseline** | <5/min per tenant after stable cutover; spikes on new route migrations normal |
| **Warning** | >20/min sustained 10 min **or** 3× 7-day rolling average |
| **Critical** | >100/min sustained 5 min |
| **Rollback** | Critical + confirmed legitimate users blocked (support tickets >5 in 15 min) |

**Investigate:** `permissionKey` and `route` in metadata; compare to parity report.

---

### RBAC_V2_STALE_AV

| Level | Threshold | Action |
|-------|-----------|--------|
| **Expected baseline** | Spike at flag enablement + role/scope/matrix admin changes; otherwise <1/user/hour |
| **Warning** | >50/min tenant-wide sustained 10 min (outside known admin window) |
| **Critical** | >200/min sustained 5 min |
| **Rollback** | Critical + login success rate drops >10% |

**Expected one-time spike:** Stage 5 approval matrix enablement (approvalHash in `av`).

---

### RBAC_V2_SCOPE_DENY

| Level | Threshold | Action |
|-------|-----------|--------|
| **Expected baseline** | Low after scope grants configured; higher during Stage 4 tuning |
| **Warning** | >10/min sustained 15 min for single tenant |
| **Critical** | Any scope leak report (user sees out-of-scope data) — **not metric-driven** |
| **Rollback** | Confirmed scope leak → `RBAC_V2_DATA_SCOPE=false` immediately |

---

### RBAC_V2_APPROVAL_REQUIRED

| Level | Threshold | Action |
|-------|-----------|--------|
| **Expected baseline** | Correlates with journal/PO/bill submit volume |
| **Warning** | Zero events for 24h when journal activity exists (matrix may be off or bypass) |
| **Critical** | N/A (informational) |
| **Rollback** | If approval bypass confirmed — see rollback plan |

---

### RBAC_V2_APPROVAL_REJECTED

| Level | Threshold | Action |
|-------|-----------|--------|
| **Expected baseline** | Low; spikes during SoD/self-approval blocks are healthy |
| **Warning** | >30/min sustained 10 min |
| **Critical** | Rejection reason `APPROVAL_POOL_EMPTY` on every journal submit |
| **Rollback** | Critical → assign approvers or disable matrix until configured |

**Rejection reasons to monitor:** `sod_violation`, `self_approval`, `pool_empty`, `insufficient_permission`.

---

### BREAK_GLASS_ACTIVATED (audit)

| Level | Threshold | Action |
|-------|-----------|--------|
| **Expected baseline** | 0–2/month per tenant |
| **Warning** | >3 sessions/day per tenant |
| **Critical** | Session >60 min or concurrent sessions >1 |
| **Rollback** | Do not disable break-glass unless compromised — revoke session, rotate credentials |

**Metric correlate:** `RBAC_V2_BREAK_GLASS` with `reason` in metadata.

---

## Dashboard panels (recommended)

| Panel | Query |
|-------|-------|
| Deny rate by route | `RBAC_V2_DENY` group by route |
| TOKEN_STALE timeline | `RBAC_V2_STALE_AV` over time |
| Scope deny by dimension | `RBAC_V2_SCOPE_DENY` group by reason |
| Approval funnel | `APPROVAL_REQUIRED` vs `APPROVAL_GRANTED` vs `APPROVAL_REJECTED` |
| Break-glass sessions | Audit `BREAK_GLASS_ACTIVATED` + metric |

---

## Cutover monitoring schedule

| Phase | Duration | Focus metrics |
|-------|----------|---------------|
| Flag enablement | +0–4 hours | STALE_AV, DENY |
| First business day | +24 hours | DENY, SCOPE_DENY, APPROVAL_* |
| Soak period | +14 days | All; establish rolling baseline |
| Production cutover | +72 hours | All at heightened sensitivity |

---

## Alert routing

| Severity | Notify |
|----------|--------|
| Warning | Engineering Slack channel |
| Critical | On-call + security lead |
| Rollback trigger | On-call executes rollback plan; incident commander within 30 min |

---

*End of monitoring plan.*
