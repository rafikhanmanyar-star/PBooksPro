# PERF-A2.4 — Header / GlobalSearch Optimization — Implementation Report

**Task ID:** PERF-A2.4  
**Date:** 2026-06-19  
**Plan:** `docs/performance/PERF-A2.4_IMPLEMENTATION_PLAN.md`  
**Status:** Implementation complete — **awaiting review**

---

## 1. Executive Summary

PERF-A2.4 reduces idle chrome work by isolating header subscriptions into memoized subcomponents and deferring GlobalSearch entity subscriptions until the user focuses or types in the search bar. Lookup maps for search are cached module-wide and rebuilt only when the entity fingerprint changes.

---

## 2. Subscription reduction

### Header shell (`Header.tsx`)


| Metric                       | Before                | After                                                  |
| ---------------------------- | --------------------- | ------------------------------------------------------ |
| AppState slice hooks at root | **9**                 | **3** (currentUser, currentPage, initialTabs)          |
| RQ hooks at root             | useUserNotifications  | **0** (moved to bell)                                  |
| Rerenders on `contacts` sync | Header + all children | **HeaderNotificationsBell / HeaderWhatsAppBadge only** |


### GlobalSearchBar (desktop, idle)


| Metric                     | Before             | After                                  |
| -------------------------- | ------------------ | -------------------------------------- |
| Entity slice subscriptions | **13** always      | **0** until focused or query non-empty |
| Lookup map rebuild         | Every array change | Cached until fingerprint change        |


### Expected gains (from plan)


| Area                  | Target                                  |
| --------------------- | --------------------------------------- |
| Header idle rerenders | 15–25%                                  |
| GlobalSearch idle CPU | 40–60%                                  |
| Active search typing  | 10–20% (transition + fingerprint cache) |


---

## 3. Architecture

```
Header (shell — 3 slice hooks)
├── GlobalSearchBar
│   ├── Input shell (no entity subs when idle)
│   └── GlobalSearchIndexRunner (13 subs when active)
├── HeaderNotificationsBell
│   ├── useUserNotifications + installmentPlans (badge)
│   └── HeaderNotificationsPanelData (contacts/projects/units/users — bell open)
└── HeaderWhatsAppBadge (whatsAppMode + contacts)
```

---

## 4. Files created


| File                                                   | Action      |
| ------------------------------------------------------ | ----------- |
| `hooks/useSearchIndex.ts`                              | **Created** |
| `components/layout/header/HeaderNotificationsBell.tsx` | **Created** |
| `components/layout/header/HeaderWhatsAppBadge.tsx`     | **Created** |
| `components/layout/header/headerNotificationTypes.ts`  | **Created** |
| `components/layout/header/headerNotificationUtils.ts`  | **Created** |


## 5. Files modified


| File                                    | Action                                |
| --------------------------------------- | ------------------------------------- |
| `components/layout/Header.tsx`          | Slimmed ~1046 → ~250 lines            |
| `components/layout/GlobalSearchBar.tsx` | Lazy index runner + fingerprint cache |


**Not modified:** `searchModalResults.ts` (build logic unchanged), backend, sync, socket handlers.

---

## 6. Behavior notes

- **Notification badge** still counts API notifications, personal tasks, and installment-plan approvals (plan count uses `installmentPlans` without requiring contacts/projects/units labels).
- **Plan notification labels** (lead • project • unit) load only when the bell panel is open (`HeaderNotificationsPanelData`).
- **Help modal** never required `projects`/`units` in Header (plan was inaccurate); help uses `currentPage` + `initialTabs` only.
- **WhatsApp** polling/socket logic unchanged; moved to `HeaderWhatsAppBadge`.

---

## 7. Mandatory checklist (architecture)


| Item                  | Status                                |
| --------------------- | ------------------------------------- |
| API / backend changes | N/A — frontend only                   |
| Tenant isolation      | Unchanged                             |
| Audit trail           | Unchanged                             |
| Real-time sync        | Unchanged — no mutation paths touched |
| Permissions           | Unchanged                             |
| LWW                   | N/A                                   |
| PostgreSQL only       | Unchanged                             |


---

## 8. Verification


| Check                | Result    |
| -------------------- | --------- |
| `npm run build`      | **PASS**  |
| Lint (changed files) | **Clean** |


Manual QA recommended:

- [ ] Desktop search: idle → no results until focus/type
- [ ] Ctrl+K focuses search; Escape clears
- [ ] Notification bell: badge, open panel, dismiss, navigate actions
- [ ] WhatsApp badge (API mode): unread count + dropdown
- [ ] Mobile search expand/collapse

---

## 9. Rollback

Revert `Header.tsx`, `GlobalSearchBar.tsx`, delete `hooks/useSearchIndex.ts` and `components/layout/header/`* notification files.

---

**STOP.** A3 and A4 were not started. Awaiting review and approval.



## Architectural Decision

Global search subscriptions are intentionally lazy.

Entity subscriptions are not established until:

- Search receives focus

OR

- Search query becomes non-empty

This is intentional and prevents idle application resources from being consumed by inactive search functionality.

Future changes should preserve lazy subscription behavior.