# A5.1.6C — Production Metric Baselines

**Phase:** A5.1.6C Deliverable 2  
**Status:** **Pending** — baselines established after Phase 1 pilot enablement + 1-hour monitor window  
**Date:** 2026-06-19  

---

## Prerequisite

Metric baselines are captured **after** RBAC V2 flags are enabled on the pilot tenant and the API has run for at least **1 hour**. Phase 1 is **blocked** pending executive sign-off ([`A5_1_6C_PRE_CUTOVER_CHECKLIST.md`](./A5_1_6C_PRE_CUTOVER_CHECKLIST.md)).

---

## Metrics to baseline

| Metric code | Pre-enablement target | Rollback relevance |
|-------------|----------------------|-------------------|
| `RBAC_V2_DENY` | <5/min per tenant (stable) | Legitimate user blocks |
| `RBAC_V2_STALE_AV` | ~0 except post-flag login window | Mass 401 after enablement |
| `RBAC_V2_SCOPE_DENY` | ~0 unless scope grants configured | Scope misconfiguration |
| `RBAC_V2_APPROVAL_REQUIRED` | >0 when journal submit occurs | Bypass detection |
| `BREAK_GLASS_ACTIVATED` (audit) | 0 except controlled tests | Excessive break-glass |

Source: [`RBAC_V2_MONITORING_PLAN.md`](./RBAC_V2_MONITORING_PLAN.md) · `monitoring_events` + `rbac_audit_log`

---

## Baseline capture procedure (Phase 1)

1. Record **T-0** counts (1 hour before flag enablement) from `monitoring_events`.
2. Enable pilot tenant flags on `rk-builders-284d6d` (local or cloud, per environment).
3. Record **T+15m**, **T+30m**, **T+60m** snapshots.
4. Classify incidents P1/P2/P3 per soak report methodology ([`A5_1_6B_SOAK_REPORT.md`](./A5_1_6B_SOAK_REPORT.md)).

**Query template:**

```sql
SELECT code, COUNT(*)::int AS n
FROM monitoring_events
WHERE tenant_id = $1
  AND created_at >= NOW() - INTERVAL '1 hour'
  AND code IN (
    'RBAC_V2_DENY', 'RBAC_V2_STALE_AV', 'RBAC_V2_SCOPE_DENY',
    'RBAC_V2_APPROVAL_REQUIRED'
  )
GROUP BY code;
```

```sql
SELECT COUNT(*)::int AS n
FROM rbac_audit_log
WHERE tenant_id = $1
  AND action = 'BREAK_GLASS_ACTIVATED'
  AND created_at >= NOW() - INTERVAL '1 hour';
```

---

## Current values (pre-rollout)

| Metric | Local production (`pbookspro`) | Cloud (`pbookspro_ofm7`) |
|--------|-------------------------------|--------------------------|
| `RBAC_V2_DENY` | N/A (flags off) | N/A (flags off) |
| `RBAC_V2_STALE_AV` | N/A | N/A |
| `RBAC_V2_SCOPE_DENY` | N/A | N/A |
| `RBAC_V2_APPROVAL_REQUIRED` | N/A | N/A |
| `BREAK_GLASS_ACTIVATED` | N/A | N/A |

**P1 authorization incidents:** **0** (no flags enabled)

---

## Post-pilot baseline table (to complete after Phase 1)

| Metric | T-0 | T+15m | T+30m | T+60m | P1? |
|--------|-----|-------|-------|-------|-----|
| `RBAC_V2_DENY` | — | — | — | — | — |
| `RBAC_V2_STALE_AV` | — | — | — | — | — |
| `RBAC_V2_SCOPE_DENY` | — | — | — | — | — |
| `RBAC_V2_APPROVAL_REQUIRED` | — | — | — | — | — |
| `BREAK_GLASS_ACTIVATED` | — | — | — | — | — |

---

## Verdict

**Baselines not yet established** — awaiting Phase 1 pilot execution after executive sign-off.
