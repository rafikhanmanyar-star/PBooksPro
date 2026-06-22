# PBooksPro — UAT Module Alignment Report

**Document ID:** UAT-ALIGN-001  
**Date:** 2026-06-22  
**UAT Manual version:** 1.1  
**Product build:** 1.2.463+  

---

## Core product modules (authoritative)

| # | Core module | Sidebar label | UAT chapter |
|---|-------------|---------------|-------------|
| 1 | Administration / Security | Settings (+ login) | Ch.1, Ch.12 |
| 2 | Accounting | General Ledger, Accounting | Ch.2 (COA), Ch.12 |
| 3 | Payroll | Payroll | Ch.3 |
| 4 | Project Selling | Project selling | Ch.4 |
| 5 | Project Construction | Project construction | Ch.5 |
| 6 | Rental | Rental | Ch.6 |
| 7 | Procurement | Procurement | Ch.7 |
| 8 | Investment Management | Inv Mgmt | Ch.8 |
| 9 | PM Cycle | PM cycle | Ch.9 |
| 10 | Budget Planner | Budget Planner | Ch.10 |
| 11 | Personal Transactions | Personal transactions | Ch.11 |

**Not a core module:** Standalone Inventory Management — **removed from UAT v1.1**

---

## Chapter alignment matrix

| UAT Ch. | UAT title | Actual module / menu | Status | Action required |
|---------|-----------|----------------------|--------|-----------------|
| 1 | System Initialization & Basic Setup | Login, Settings (Setup Wizard, Users, RBAC, Backup, Audit) | **Aligned** | None |
| 2 | Master Data Foundation | Settings → Chart of Accounts, Contacts, Assets | **Aligned** | None |
| 3 | Payroll | People → Payroll | **Aligned** | None |
| 4 | Project Selling | Selling → Project selling | **Aligned** | Inv Mgmt cases moved to Ch.8 (v1.1) |
| 5 | Project Construction | Construction → Project construction | **Aligned** | Procurement cases moved to Ch.7 (v1.1) |
| 6 | Rental Management | Rental → Rental | **Aligned** | "Owner settlement" uses Payouts — documented |
| 7 | Procurement Management | Construction → Procurement | **Aligned** | New in v1.1; replaces Inventory chapter |
| 8 | Investment Management | Selling → Inv Mgmt | **Aligned** | New in v1.1; admin-only |
| 9 | PM Cycle | Construction → PM cycle | **Aligned** | No standalone "Expense distribution" screen — N/A case |
| 10 | Budget Management | Financials → Budget Planner | **Aligned** | Label is "Budget Planner" not "Budget Management" |
| 11 | Personal Transactions | Financials → Personal transactions | **Aligned** | Admin-only by design |
| 12 | Advanced Administration | GL, Accounting, Settings admin | **Aligned** | None |

---

## Removed / invalid UAT content (v1.0 → v1.1)

| Former content | Issue | v1.1 action |
|----------------|-------|-------------|
| Chapter 7 — Inventory Management | No standalone module | **Removed** — see Audit Report |
| UAT cases assuming Inventory sidebar | Module does not exist | **Removed** |
| Inv Mgmt under Project Selling (Ch.4) | Wrong chapter | **Moved to Ch.8** |
| Procurement under Project Construction (Ch.5) | Wrong chapter | **Moved to Ch.7** |
| Ch.2 warehouse/SKU NOT IMPLEMENTED cases | Out of scope for master data | **Removed** — covered in Audit Report |

---

## Partial / NOT IMPLEMENTED features (documented in UAT)

| Feature | UAT location | Actual state |
|---------|--------------|--------------|
| Purchase Requests | UAT-358 (Ch.7) | NOT IMPLEMENTED |
| Blocks entity | Ch.2 UAT-086, Ch.4 UAT-191 | NOT IMPLEMENTED |
| BOQ standalone module | Ch.5 UAT-246 | NOT IMPLEMENTED — contract/quotation lines |
| IPC Bills | Ch.5 UAT-247 | NOT IMPLEMENTED |
| Void Payroll Run UI | Ch.3 UAT-145 | API only |
| Company Management settings | Ch.12 UAT-531 | Component not mounted |
| Notifications settings page | Ch.12 UAT-530 | Header bell only |
| Org-wide budget | Ch.10 UAT-498 | Project-scoped only |
| PM expense distribution screen | Ch.9 UAT-468 | Via allocation stats only |
| Login with Google | — | Coming Soon button |

---

## Cross-module dependencies (test order)

```
Ch.1 Setup → Ch.2 Master Data → Ch.3 Payroll
                              → Ch.4 Selling
                              → Ch.5 Construction
                              → Ch.6 Rental
                              → Ch.7 Procurement (uses Ch.2 vendors)
                              → Ch.8 Inv Mgmt (uses Ch.2 equity accounts)
                              → Ch.9 PM Cycle (uses Ch.5 expenses)
                              → Ch.10 Budget (uses Ch.5 spend)
                              → Ch.11 Personal (admin)
                              → Ch.12 Administration (full stack)
```

---

## Test case counts (v1.1)

| Chapter | ID range | Cases |
|---------|----------|-------|
| 1 System Initialization | UAT-001 – UAT-030 | 30 |
| 2 Master Data | UAT-031 – UAT-090 | 60 |
| 3 Payroll | UAT-091 – UAT-150 | 60 |
| 4 Project Selling | UAT-151 – UAT-210 | 60 |
| 5 Project Construction | UAT-211 – UAT-280 | 70 |
| 6 Rental | UAT-281 – UAT-350 | 70 |
| 7 Procurement | UAT-351 – UAT-405 | 55 |
| 8 Investment Management | UAT-406 – UAT-450 | 45 |
| 9 PM Cycle | UAT-451 – UAT-480 | 30 |
| 10 Budget Planner | UAT-481 – UAT-510 | 30 |
| 11 Personal Transactions | UAT-511 – UAT-540 | 30 |
| 12 Administration | UAT-541 – UAT-600 | 60 |
| **Total** | | **600** |

---

## Sign-off

| Role | Name | Date | Status |
|------|------|------|--------|
| QA / UAT Lead | | | |
| Product Owner | | | |
| Engineering | | | |
