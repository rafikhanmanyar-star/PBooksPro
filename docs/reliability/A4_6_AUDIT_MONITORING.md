# A4.6 — Audit & Compliance Monitoring

## Objective

Strengthen operational auditing by verifying coverage and surfacing gaps.

## Service

`backend/src/services/telemetry/auditCoverageService.ts`

**Endpoint:** `GET /api/v1/admin/monitoring/audit-coverage?days=30`

## Tracked user actions

The enterprise audit pipeline (`enterpriseAuditService`, `withAudit()`, `recordDomainMutation()`) records:

| Action family | Examples |
|---------------|----------|
| Create | New entities |
| Update | Field changes |
| Delete | Soft/hard deletes |
| Approve | Workflow approvals |
| Reverse | Reversals |
| Post | GL / financial posting |
| Unpost | GL reversal |

Coverage report aggregates `audit_events` by **module** and **action** over the configured window.

## Gap detection

`gaps[]` identifies:

- Expected modules with zero events in window
- Expected action types with zero events

Gaps are **heuristic** — they flag areas worth review, not definitive compliance failures.

## Admin access

| UI | Purpose |
|----|---------|
| **System Health Center → Audit Coverage** | Summary, gaps, by-module/action charts |
| **Settings → Audit Trail** | Full searchable audit log (`EnterpriseAuditViewer`) |

## Verification workflow

1. Open Audit Coverage (30-day default).
2. Review `gaps` for modules you expect to be active.
3. Cross-check with Audit Trail for sample `recentSamples`.
4. For missing mutations, confirm route uses `withAudit()` per Architecture V2.1 checklist.

## Related tables

- `audit_events` — primary store
- `monitoring_events` — operational errors (separate from compliance audit)

## Constraints

Read-only reporting — does not change audit write paths or RBAC.
