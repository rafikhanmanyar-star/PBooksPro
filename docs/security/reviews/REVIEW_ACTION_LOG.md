# RBAC 2.0 — Review Action Log

**Purpose:** Single traceability index for all architecture review findings and resolutions.  
**Last updated:** June 2026 (A5.1.0.4)

---

## Review sources

| Review | Document | Phase |
|--------|----------|-------|
| [#1](./CLAUDE_REVIEW_1.md) | Initial architecture | A5.1.0 |
| [#2](./CLAUDE_REVIEW_2.md) | Security foundation revision | A5.1.0.1 |
| [#3](./CLAUDE_REVIEW_3.md) | Final review closure | A5.1.0.4 |

---

## Action log

| Finding | Review | Severity | Resolution document | Section | Status |
|---------|--------|----------|---------------------|---------|--------|
| C1 — SoD not enforced | #1 | Critical | [`SoD_MATRIX.md`](../SoD_MATRIX.md) | Full matrix; blocking policy | **Closed** |
| C2 — SYSTEM_OWNER unaudited | #1 | Critical | [`RBAC_2_ARCHITECTURE_V2.md`](../RBAC_2_ARCHITECTURE_V2.md) | §4.6 Break-glass | **Closed** |
| C3 — Company isolation undefined | #1 | Critical | [`RBAC_2_ARCHITECTURE_V2.md`](../RBAC_2_ARCHITECTURE_V2.md) | §5.1 Option A | **Closed** |
| C4 — Cache TTL-only | #1 | Critical | [`RBAC_2_ARCHITECTURE_V2.md`](../RBAC_2_ARCHITECTURE_V2.md) | §2.5 role_version_hash | **Closed** |
| C5 — financial.write undefined | #1 | Critical | [`PERMISSION_MIGRATION_MAP.md`](../PERMISSION_MIGRATION_MAP.md) | §2–§4 | **Closed** |
| H1 — Payroll department scope | #1, #2 | High | [`RBAC_2_ARCHITECTURE_V2.md`](../RBAC_2_ARCHITECTURE_V2.md) | §5.7 Department scope | **Closed** |
| H2 — Report scope unenforced | #1, #2 | High | [`RBAC_2_ARCHITECTURE_V2.md`](../RBAC_2_ARCHITECTURE_V2.md) | §5.9 Report engine | **Closed** |
| H3 — Template instantiation escalation | #1, #2 | High | [`RBAC_2_ARCHITECTURE_V2.md`](../RBAC_2_ARCHITECTURE_V2.md) | §4.7 | **Closed** |
| H4 — Journal approval optional | #1, #2 | High | [`RBAC_2_ARCHITECTURE_V2.md`](../RBAC_2_ARCHITECTURE_V2.md) | §6.4 | **Closed** |
| H5 — Template patch propagation | #1 | High | — | Deferred post-launch | **Deferred** |
| H6 — Company admin ceiling | #1, #2 | High | [`PRIVILEGE_CEILING.md`](../PRIVILEGE_CEILING.md) | Full document | **Closed** |
| NR1 — Bundle expansion source | #2 | Risk | [`RBAC_2_IMPLEMENTATION_PLAN_V2.md`](../RBAC_2_IMPLEMENTATION_PLAN_V2.md) | §Bundle expansion source | **Closed** |
| NR2 — project_manager subset | #2 | Risk | [`PERMISSION_MIGRATION_MAP.md`](../PERMISSION_MIGRATION_MAP.md) | §11 | **Closed** |
| NH1 — SoD on role permission add | #3 | High | [`SoD_MATRIX.md`](../SoD_MATRIX.md) | Enforcement Point #3 | **Closed** |
| NM1 — Break-glass governance | #3 | Medium | [`RBAC_2_ARCHITECTURE_V2.md`](../RBAC_2_ARCHITECTURE_V2.md) | §4.6.1 | **Closed** |
| NM2 — Department table prerequisite | #3 | Medium | [`RBAC_2_IMPLEMENTATION_PLAN_V2.md`](../RBAC_2_IMPLEMENTATION_PLAN_V2.md) | Phase 4 prerequisite | **Closed** |
| NM3 — personal.finance classification | #3 | Medium | [`PERMISSION_MIGRATION_MAP.md`](../PERMISSION_MIGRATION_MAP.md) | §12 | **Closed** |
| M1 — No deny override | #1 | Medium | — | Post-launch | **Deferred** |
| M2 — Scope array scale | #1 | Medium | [`RBAC_2_ARCHITECTURE_V2.md`](../RBAC_2_ARCHITECTURE_V2.md) | §5 + performance notes | **Open (low)** |
| M3 — JWT stale role | #1 | Medium | [`RBAC_2_ARCHITECTURE_V2.md`](../RBAC_2_ARCHITECTURE_V2.md) | §2.5 JWT `av` | **Closed** |
| M4 — Expiry check layer | #1 | Medium | [`RBAC_2_IMPLEMENTATION_PLAN_V2.md`](../RBAC_2_IMPLEMENTATION_PLAN_V2.md) | Phase 2 expires_at | **Closed** |
| M5 — Unit-level scope | #1 | Medium | — | Post-launch | **Deferred** |
| M6 — Audit retention | #1 | Medium | — | Post-launch | **Deferred** |
| M7 — minApprovers criteria | #1 | Medium | [`RBAC_2_IMPLEMENTATION_PLAN_V2.md`](../RBAC_2_IMPLEMENTATION_PLAN_V2.md) | Phase 5 | **Open (low)** |
| M8 — Cross-tenant SYSTEM_OWNER | #1 | Medium | [`RBAC_2_ARCHITECTURE_V2.md`](../RBAC_2_ARCHITECTURE_V2.md) | §4.6.1 vendor store | **Closed** |

---

## Package index

| Document | Role |
|----------|------|
| [`RBAC_2_ARCHITECTURE_V2.md`](../RBAC_2_ARCHITECTURE_V2.md) | Target architecture |
| [`RBAC_2_IMPLEMENTATION_PLAN_V2.md`](../RBAC_2_IMPLEMENTATION_PLAN_V2.md) | Phased delivery |
| [`RBAC_DECISIONS.md`](../RBAC_DECISIONS.md) | Decision record |
| [`SoD_MATRIX.md`](../SoD_MATRIX.md) | Separation of duties |
| [`PERMISSION_MIGRATION_MAP.md`](../PERMISSION_MIGRATION_MAP.md) | financial.write decomposition |
| [`PRIVILEGE_CEILING.md`](../PRIVILEGE_CEILING.md) | Admin privilege ceilings |

---

## Closure summary

| Category | Total | Closed | Deferred | Open (low) |
|----------|-------|--------|----------|------------|
| Critical | 5 | 5 | 0 | 0 |
| High | 6 | 6 | 0 | 0 |
| New risks | 2 | 2 | 0 | 0 |
| Review #3 (NH/NM) | 4 | 4 | 0 | 0 |
| Medium | 8 | 3 | 4 | 1 |

**Implementation authorization:** Ready — all blocking findings resolved.

---

*End of Review Action Log.*
