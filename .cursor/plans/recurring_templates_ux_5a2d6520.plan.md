---
name: Recurring Templates UX
overview: Redesign the Recurring Templates tab in Rental Invoices to make scheduling auto-creation of monthly invoices simple and intuitive, replacing the current dense edit-modal workflow with a clearer, more visual approach.
todos:
  - id: fix-normalization
    content: "CRITICAL BUG FIX: Add snake_case-to-camelCase normalization for recurring templates in appStateApi.ts loadState() (line 767) -- without this, templates loaded from server on login have wrong field names"
    status: pending
  - id: fix-websocket-listeners
    content: "BUG FIX: Add WebSocket event listeners in AppContext.tsx for recurring_invoice_template:created/updated/deleted with snake_case normalization -- enables real-time multi-device sync"
    status: pending
  - id: enhance-table
    content: "Redesign table columns: merge Property/Tenant, add Status toggle, add Mode badge, color-code Next Invoice dates (green=future, amber=overdue)"
    status: pending
  - id: bulk-generate
    content: Add 'Generate All Due' button above table that batch-creates invoices for all overdue auto-generate templates in one click
    status: pending
  - id: overdue-highlighting
    content: Add overdue row highlighting (left border accent, amber date badges) and compute overdue count in a memo
    status: pending
  - id: redesign-modal
    content: "Restructure edit modal: read-only property/tenant header, clearer 'Auto-create invoices' toggle with helper text, better day-of-month label, optional limit with progress indicator"
    status: pending
  - id: enhance-footer
    content: "Enhance footer stats: total, active count, monthly total, overdue count"
    status: pending
isProject: false
---

# Recurring Templates UX Improvement

## Problem Analysis

The current `RecurringInvoicesList.tsx` has several UX issues:

- **No clear status visibility**: The table shows "Auto Monthly" or "Manual" but no active/paused indicator. Users cannot quickly see which templates are working.
- **Confusing edit modal**: The "Manual" vs "Auto" toggle, "Day of Month (Ideal)" input, and "Total Number of Transactions" are unclear for non-technical users.
- **No at-a-glance schedule info**: No visual preview of when the next invoice will be created.
- **No overdue warning**: If a template's `nextDueDate` is in the past, there is no visual cue that invoices need to be generated.
- **No quick actions from the list**: Users must open the modal to toggle active/auto or generate an invoice.
- **No bulk "Generate All Due" action**: Each due template must be handled individually.

## Critical Persistence/Loading Bug Fixes

Two bugs were found that prevent recurring templates from loading correctly on login and syncing across devices.

### Bug 1: Missing snake_case normalization on API load (appStateApi.ts, line 767)

The server returns recurring templates with PostgreSQL snake_case column names (`contact_id`, `next_due_date`, `auto_generate`, `description_template`, etc.). Every other entity in `loadState()` has explicit normalization mapping (e.g., invoices at line 454, bills at line 417), but recurring templates are passed through raw:

```typescript
// Line 767 -- BUG: no normalization
recurringInvoiceTemplates: recurringInvoiceTemplates || [],
```

**Fix**: Add a `normalizedRecurringTemplates` mapping block (like all other entities), handling both snake_case and camelCase for all fields: `contactId`, `propertyId`, `buildingId`, `descriptionTemplate`, `dayOfMonth`, `nextDueDate`, `agreementId`, `invoiceType`, `autoGenerate`, `maxOccurrences`, `generatedCount`, `lastGeneratedDate`.

Fields needing type coercion:

- `amount` -- parse to number
- `dayOfMonth` -- parse to integer
- `active` -- handle boolean/integer (PostgreSQL returns boolean, SQLite uses 0/1)
- `autoGenerate` -- handle boolean/integer
- `generatedCount` -- parse to integer

### Bug 2: Missing WebSocket event listeners (AppContext.tsx)

The server emits three WebSocket events on recurring template changes (defined in `server/services/websocketHelper.ts` lines 124-126):

- `recurring_invoice_template:created`
- `recurring_invoice_template:updated`
- `recurring_invoice_template:deleted`

But the client **never listens** for them. Other entities (invoices, bills, etc.) have WebSocket listeners that dispatch to the reducer for real-time sync. Recurring templates are missing this entirely.

**Fix**: Add socket listeners for these 3 events in the WebSocket setup section of AppContext.tsx, with snake_case-to-camelCase normalization on the incoming template data, dispatching ADD/UPDATE/DELETE_RECURRING_TEMPLATE.

## Planned UI/UX Changes

All UI changes are scoped to [components/rentalManagement/RecurringInvoicesList.tsx](components/rentalManagement/RecurringInvoicesList.tsx). No schema changes needed.

### 1. Enhance the Table Columns

Replace the current 5-column table (Property, Tenant, Amount, Next Due, Freq) with a more informative layout:

- **Property / Tenant** -- merge into one column (property bold, tenant underneath in smaller text)
- **Amount** -- keep, right-aligned with currency
- **Schedule** -- show "Monthly on 1st" or "Weekly" etc. in plain language
- **Next Invoice** -- show date with color-coded badge: green if future, amber/red if overdue (past due date means invoices need generation)
- **Status** -- show a toggle switch or badge: Active (green) / Paused (gray). Clickable inline to toggle without opening the modal
- **Mode** -- show "Auto" (green badge) or "Manual" (gray badge)

### 2. Add a "Generate All Due" Bulk Action Button

Add a button in the header area above the table (visible when there are templates with `nextDueDate <= today` and `autoGenerate === true`):

- Label: "Generate X Due Invoices"
- Shows count of overdue templates
- On click: runs the existing catch-up logic for all due templates at once
- This is the biggest usability win -- users can generate all pending invoices in one click

### 3. Redesign the Edit Modal

Restructure the edit modal with clearer sections and better labeling:

**Section 1: Invoice Details** (gray card)

- Property name and Tenant name (read-only display)
- Amount input
- Invoice Type dropdown
- Description Template input

**Section 2: Schedule** (visually distinct card)

- **"Auto-create invoices"** toggle (replaces the Manual/Auto buttons) -- with clear helper text: "When enabled, invoices are automatically created on the scheduled date"
- **Frequency**: "Monthly" / "Weekly" / "Daily" (dropdown, default Monthly)
- **Day of Month**: Only when Monthly is selected. Use a cleaner label: "Create on day" with a small number stepper (1-28), helper text: "Invoice will be created on this day each month"
- **Next scheduled date**: Date picker, auto-computed based on frequency + day settings
- **Limit total invoices** (optional): Checkbox to enable, then number input. Show progress: "3 of 12 created"

**Section 3: Actions** (bottom bar)

- Left: Delete button (red outline)
- Right: "Generate Invoice Now" button (green outline) + "Save" button (primary)

### 4. Add Overdue Row Highlighting

In the table, rows where `nextDueDate` is in the past and template is active get:

- A left border accent (e.g., amber-400)
- The date badge shows in amber/red instead of neutral
- Tooltip or small text: "Invoice pending generation"

### 5. Add Summary Stats to Footer

Enhance the existing footer to show:

- Total templates count
- Active count
- Total monthly amount
- Overdue count (if any, in amber)

## Files to Modify

- [services/api/appStateApi.ts](services/api/appStateApi.ts) -- add snake_case-to-camelCase normalization for recurring templates at line 767
- [context/AppContext.tsx](context/AppContext.tsx) -- add WebSocket event listeners for recurring template CRUD events (with normalization)
- [components/rentalManagement/RecurringInvoicesList.tsx](components/rentalManagement/RecurringInvoicesList.tsx) -- main component, all UI changes here
- [types.ts](types.ts) -- no changes needed, existing `RecurringInvoiceTemplate` interface already has all required fields

## Key Existing Code to Leverage

- `handleGenerateInvoice()` (line 256-333) -- reuse for bulk generation
- `handleSaveEdit()` catch-up logic (line 362-474) -- reuse for bulk "Generate All Due"
- `calculateNextDate()` (line 234-254) -- reuse for schedule preview
- Existing `filteredTemplates` memo (line 128-193) -- extend with overdue detection
- UI components: `Button`, `Modal`, `Input`, `Select`, `Card` from `components/ui/`

