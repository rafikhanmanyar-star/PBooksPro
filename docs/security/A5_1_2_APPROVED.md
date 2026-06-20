# RBAC 2.0 — Phase 2 Approval Record (A5.1.2 + A5.1.2.1)

**Phase:** A5.1.2 Role Management + A5.1.2.1 Security Closure

**Status:** Approved

**Approval Date:** 2026-06-19

**Feature Flag:** `RBAC_V2_ROLE_MANAGEMENT=false` (default)

---

## Scope Approved

| Item | Value |
|------|------:|
| Role templates | 10 |
| SoD pairs enforced | 11 |
| Validation pipeline steps | 5 (expand → delegate → ceiling → SoD → holder check on update) |
| Security API prefix | `/api/v1/security/*` |
| RBAC audit permission | `audit_logs.rbac.read` |

---

## Security Closure (A5.1.2.1)

All review findings resolved:

- **H1** — Bundle expansion before delegation / ceiling / SoD
- **H2** — Template instantiate full pipeline + `DELEGATION_DENIED` tests
- **H3** — Audit endpoint hardened to `audit_logs.rbac.read`
- **H4** — Archive / restore contract (assignments, SoD revalidation, edit blocks)
- **M1** — Effective union `is_active` + `expires_at` filters
- **M2** — System role API modification blocked (403)
- **M3** — Role version hash → Phase 3 composite documented
- **M5** — SoD Point #3 `PERMS_ADDED` holder validation

**Tests:** 33/33 RBAC v2 unit tests passing.

**Report:** [`A5_1_2_1_IMPLEMENTATION_REPORT.md`](./A5_1_2_1_IMPLEMENTATION_REPORT.md)

---

## Runtime Impact When Flag Off

No change to legacy `/api/v1/rbac/*`, resolver, or route guards.

---

## Approved For

- **A5.1.3** — Authorization Engine (Phase 3) — JWT `av` / composite hash consumption

**C2 Break-glass:** Complete — [`A5_1_2_C2_IMPLEMENTATION_REPORT.md`](./A5_1_2_C2_IMPLEMENTATION_REPORT.md)

---

## Prerequisites for Production Enable

1. Apply migration `133_rbac_v2_role_management.sql`
2. Set `RBAC_V2_ROLE_MANAGEMENT=true` on API
3. Optionally `VITE_RBAC_V2_ROLE_MANAGEMENT=true` for Security → Roles UI
4. Grant `audit_logs.rbac.read` to security administrators who need RBAC audit access
