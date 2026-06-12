# Executive Mobile Mode — Phase 1 Design

**Date:** 2026-06-12  
**Scope:** Phase 1 (Cloud Edition only)  
**Status:** Approved via scope gate

## Goal

Provide company executives a simplified mobile interface for dashboards, read-only reports, and quick field transaction capture — without exposing full accounting operations.

## Constraints

- **Cloud/API mode only** — disabled in offline SQLite and Electron
- **Auto-detect** screen width < 768px, mobile UA, or tablet portrait
- **Manual override** via Settings → Preferences → Interface Mode (per user, server-persisted)
- **No GL impact** from quick transactions until accountant processes them

## Architecture

### Approach: Conditional Shell (recommended)

`ExecutiveModeProvider` computes active mode from user preference + device signals. When active, `App.tsx` renders `ExecutiveMobileShell` instead of desktop Sidebar/Footer/KPIPanel. Module pages are lightweight dashboard views backed by aggregated `/api/v1/mobile/*` endpoints.

### Backend (`backend/src/modules/mobile/`)

| Component | Responsibility |
|-----------|----------------|
| Migration `112_executive_mobile.sql` | `unposted_transactions` table, `users.interface_mode` |
| `UnpostedTransactionRepository` | CRUD + status transitions |
| `mobileDashboardService` | Aggregates existing analytics services |
| `mobileRoutes` | `/mobile/dashboard`, `/*-summary`, `/unposted-transactions` |

### Frontend (`modules/executive-mobile/`)

| Component | Responsibility |
|-----------|----------------|
| `ExecutiveModeContext` | Mode detection + preference sync |
| `ExecutiveMobileShell` | Header + bottom nav + module hub |
| `ExecutiveModuleDashboardPage` | Per-module KPI cards |
| `QuickTransactionPage` | 30-second capture form |
| `ExecutiveReportsPage` | Read-only report links + export |
| `UnpostedTransactionsQueuePage` | Accountant queue (desktop accounting tab) |

### Module Nav Mapping (spec → codebase)

| Executive nav | Target | Dashboard API |
|---------------|--------|---------------|
| Dashboard | Home | `/mobile/dashboard` |
| Sales | projectSelling | `/mobile/sales-summary` |
| CRM | contacts | `/mobile/crm-summary` |
| Projects | projectManagement | `/mobile/project-summary` |
| Construction | projectManagement | `/mobile/construction-summary` |
| Property Selling | projectSelling | `/mobile/sales-summary` |
| Rentals | rentalManagement | `/mobile/rental-summary` |
| Finance | accounting | `/mobile/finance-summary` |
| HR | payroll | `/mobile/hr-summary` |
| Inventory | placeholder | Coming soon |
| Approvals | approvals page | `/mobile/approvals` |
| Quick Transactions | quickTransaction page | CRUD API |
| Notifications | notifications page | `/mobile/notifications` |

### UnpostedTransaction Entity

Statuses: `draft`, `submitted`, `under_review`, `processed`, `rejected`

Attachments via existing `documents` module (`entity_type: unposted_transaction`).

### Security

Reuses existing JWT auth. Executive mobile routes require authentication. Quick transaction submit requires any authenticated user; queue management requires finance permissions.

## Phase 1 Deliverables

- [x] Mode detection + user preference
- [x] Executive mobile shell + navigation
- [x] Module dashboard pages (aggregated APIs)
- [x] Read-only reports access
- [x] Quick Transactions UI + backend
- [x] Accountant unposted queue (list + status view)
- [ ] Conversion wizard (Phase 2+)
- [x] Approvals from mobile (PEV, installment plans; contractor bills read-only)
- [x] Pull notifications API (overdue receivables, rentals, unposted counts)
- [ ] Push notifications (Phase 2+)

## Phase 2 Deliverables

- [x] `GET /mobile/approvals` + approve/reject endpoints
- [x] `GET /mobile/notifications` (pull-based alerts)
- [x] Executive Approvals + Notifications pages
- [x] Bottom nav + header integration with badge counts
- [x] Unit tests for approval helpers and unposted parse
- [ ] Push notifications (web push / native)
- [ ] Bills / payments / PO / leave approval workflows (need ERP workflows first)

## Out of Scope (Phase 1)

- Smart conversion wizard
- Mobile approvals
- Push notifications
- Offline mode / PWA app
- Device tracking / biometrics
