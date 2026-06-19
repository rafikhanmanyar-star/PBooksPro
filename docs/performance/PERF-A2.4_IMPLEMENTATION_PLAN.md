# PERF-A2.4 — Header / GlobalSearch Optimization — Implementation Plan

**Task ID:** PERF-A2.4  
**Date:** 2026-06-19  
**Authority:** `docs/performance/PERFORMANCE_IMPLEMENTATION_PLAN_V1.md` (§ A2.4)  
**Status:** Implementation complete — **awaiting review**

---

## 1. Executive Summary

The app header (`Header.tsx`, ~1046 lines) and desktop `GlobalSearchBar` subscribed to **9** and **13** AppState slices respectively while idle, causing chrome rerenders on every entity sync.

**Solution:**

1. Split header chrome into memoized subcomponents that isolate subscriptions.
2. Lazy-mount search entity subscriptions only when the search bar is focused or has query text.
3. Module-level lookup-map cache keyed by `entityFingerprint` in `hooks/useSearchIndex.ts`.

**No backend or sync changes.**

---

## 2. Header subscription map

### Before (`Header.tsx` root)

| Hook | Slice |
|------|-------|
| `useCurrentUser` | currentUser |
| `useContacts` | contacts |
| `useUsers` | users |
| `useInstallmentPlans` | installmentPlans |
| `useProjects` | projects |
| `useUnits` | units |
| `useWhatsAppMode` | whatsAppMode |
| `useStateSelector` | currentPage, initialTabs |
| `useUserNotifications` | RQ poll |

### After

| Component | Subscriptions | Mount |
|-----------|---------------|-------|
| `Header.tsx` | currentUser, currentPage, initialTabs | Always |
| `HeaderNotificationsBell` | installmentPlans, contacts (badge + click), useUserNotifications, tasks API | Always (isolated) |
| `HeaderNotificationsPanelData` | contacts, projects, units, users, installmentPlans (labels) | Bell open only |
| `HeaderWhatsAppBadge` | whatsAppMode, contacts | Always when `whatsAppMode === 'api'` |

**Header shell rerenders** no longer propagate from contacts/transactions/bills sync — only from currentPage, currentUser, theme, auth.

---

## 3. GlobalSearch subscription map

### Before

13 slice hooks always active when `GlobalSearchBar` mounted (desktop header).

### After

| State | Subscriptions |
|-------|---------------|
| Idle (unfocused, empty query) | **0** entity slices |
| Focused or typing | 13 slices via `GlobalSearchIndexRunner` child |

`buildSearchRowsWithIndex()` caches `accountById`, `categoryById`, etc. until fingerprint changes.

---

## 4. New files

| File | Purpose |
|------|---------|
| `hooks/useSearchIndex.ts` | Fingerprint + lookup cache + `buildSearchRowsWithIndex` |
| `components/layout/header/HeaderNotificationsBell.tsx` | Notification bell + lazy panel data |
| `components/layout/header/HeaderWhatsAppBadge.tsx` | WhatsApp unread badge + dropdown |
| `components/layout/header/headerNotificationTypes.ts` | Shared notification types |
| `components/layout/header/headerNotificationUtils.ts` | Plan/task builders + badge count helper |

---

## 5. Modified files

| File | Change |
|------|--------|
| `components/layout/Header.tsx` | Slim shell; delegates to subcomponents |
| `components/layout/GlobalSearchBar.tsx` | Lazy `GlobalSearchIndexRunner` + `useSearchIndex` |

---

## 6. Verification

| Check | Command / action |
|-------|------------------|
| Build | `npm run build` |
| Search focus | Ctrl+K / focus → results appear |
| Search idle | No entity subscriptions until focus |
| Notifications | Badge count includes API + tasks + plan approvals |
| WhatsApp | Unread badge when `whatsAppMode === 'api'` |

---

## 7. STOP boundary

After implementation + report: **STOP**. Do not start A3 or A4.
