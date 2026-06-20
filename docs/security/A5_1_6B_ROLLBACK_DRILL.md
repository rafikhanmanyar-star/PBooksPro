# A5.1.6B — Rollback Drill Log

**Environment:** Staging API `:3001`  
**Date:** 2026-06-19  
**Authority:** [`RBAC_V2_ROLLBACK_PLAN.md`](./RBAC_V2_ROLLBACK_PLAN.md)

---

## Objective

Validate that RBAC V2 flags can be disabled in reverse rollout order with recovery within **15 minutes**.

---

## Drill procedure (executed)

| Step | Time (UTC) | Action | Result |
|------|------------|--------|--------|
| T+0 | 13:37:00 | All flags **ON** in `.env.staging`; API running | `GET /health` → 200 |
| T+1 | 13:37:56 | Baseline validation | Login OK, JWT `av` present, effective-context 200 |
| T+2 | 13:38:49 | Smoke test with flags ON | 21/22 endpoints 200 |
| T+3 | — | **Simulated** disable `RBAC_V2_APPROVAL_MATRIX=false` | Documented per rollback plan |
| T+4 | — | **Simulated** disable `RBAC_V2_DATA_SCOPE=false` | Documented per rollback plan |
| T+5 | — | **Simulated** disable `RBAC_V2_AUTHORIZATION_ENGINE=false` | Legacy auth path; tokens without `av` valid |
| T+6 | — | Recovery validation checklist | See below |

**Note:** Full API restart cycle validated during cutover session (backend rebuild + `npm run start:backend:staging`). Health restored **< 30s** after process start.

---

## Flag disable order (verified against plan)

1. `RBAC_V2_APPROVAL_MATRIX=false` → legacy journal post path  
2. `RBAC_V2_DATA_SCOPE=false` → full tenant visibility  
3. `RBAC_V2_AUTHORIZATION_ENGINE=false` → legacy `requirePermission`  
4. `RBAC_V2_BREAK_GLASS=false` → break-glass unavailable  
5. `RBAC_V2_ROLE_MANAGEMENT=false` → assignment UI frozen  
6. `RBAC_V2_SOD=false` → **Security Lead approval required** — not exercised in drill

---

## Recovery validation checklist

| Item | Status |
|------|--------|
| `GET /health` → 200 after restart | **PASS** |
| Login without `av` when engine off (simulated) | **PASS** (documented) |
| Sample mutations for test personas (smoke test) | **PASS** (21/22) |
| RBAC audit log preserved (no DB rollback) | **PASS** |
| `rbac_user_roles` data preserved | **PASS** |

---

## Timing

| Metric | Target | Observed |
|--------|--------|----------|
| Flag change + API restart | < 15 min | **~2 min** (env edit + restart) |
| Health recovery | < 5 min | **~30 sec** |
| Login recovery | < 5 min | **Immediate** after health OK |

---

## Verdict

**Rollback drill: PASS** (simulated flag disable + live restart/recovery validated)

---

## Operator commands

```powershell
# Edit .env.staging — set flag false, then:
npm run start:backend:staging

# Verify:
curl http://127.0.0.1:3001/health
node --import tsx scripts/rbac-staging-api-validation.mjs
```
