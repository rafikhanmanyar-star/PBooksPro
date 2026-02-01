# PBooksPro Shop Module - Systematic Test Plan

This document provides a step-by-step guide to verifying the end-to-end functionality of the PBooksPro Shop Module, covering configuration, daily operations, and reporting.

## Phase 1: Configuration & Setup

### 1.1. Multi-Store Configuration
**Goal:** Verify ability to expand the retail network.
1. Navigate to **Shop > Multi-Store**.
2. Click on **Branch Directory** tab (or check the Organization Hub).
3. Click the **Register Store** button.
4. Fill in the form:
   - **Branch Name:** e.g., "Lahore Liberty Outlet"
   - **Code:** e.g., "LHR-002" (or leave empty for auto-gen)
   - **Type:** Select "Express"
   - **Region:** "Punjab"
   - **Manager:** "Ali Khan"
   - **Timezone:** Leave default.
5. Click **Register Branch**.
6. **Verify:**
   - The modal closes.
   - The new store appears in the **Branch Directory** list.
   - The **Organization Hub** active stores count increases.

### 1.2. Inventory Setup
**Goal:** Ensure products exist for sales.
1. Navigate to **Shop > Inventory**.
2. Go to the **Stock Master** tab.
3. (If "Add Product" button exists - verify creation, otherwise verify list view).
4. Verify you can see existing products (e.g., "Ceramic Tiles", "Faucets").
5. Note down the **Stock Level** of a specific item (e.g., "Ceramic Tiles" - Qty: 500).

### 1.3. Loyalty Program Setup
**Goal:** Prepare for customer retention testing.
1. Navigate to **Shop > Loyalty**.
2. Click **Enroll Member**.
3. Enter details:
   - **Name:** "Test Customer"
   - **Phone:** "0300-1234567"
   - **Card Number:** "L-9999" (or auto-generated)
4. Click **Enroll Member**.
5. **Verify:** Validates the member is added to the **Member Directory**.

---

## Phase 2: Point of Sale (POS) Operations

### 2.1. Cart Management
**Goal:** Verify basic sales transaction building.
1. Navigate to **Shop > Point of Sale**.
2. **Search Product:** Type "Tile" or "Faucet" in the search bar.
3. **Add to Cart:** Click a product card twice.
   - **Verify:** Cart shows 2 items. Total updates.
4. **Modify Quantity:** Change quantity of an item in the cart from 1 to 5.
   - **Verify:** Subtotal and Grand Total recalculate correctly.
5. **Remove Item:** Click the trash icon on one line item.
   - **Verify:** Item is removed from cart.

### 2.2. Customer Association
**Goal:** Link sale to the loyalty member created in Phase 1.
1. In the POS Right Panel (Action Panel), look for **"Add Customer"**.
2. Search for "Test Customer" or select from the list.
3. **Verify:** Customer name appears on the checkout panel.

### 2.3. Discount & Hold (Optional)
**Goal:** specific features.
1. **Global Discount:** Click "Global Discount" (if available) or apply a line discount.
2. **Hold Sale:** Click **Hold** (Pause icon).
   - **Verify:** Cart clears.
3. **Recall Sale:** Click **Recall** (Clock/List icon). Select the held sale.
   - **Verify:** Cart is repopulated with previous items.

### 2.4. Checkout & Payment
**Goal:** Finalize the revenue event.
1. Click **Pay / Checkout**.
2. **Modal Opens:** "Finalize Payment".
3. Select **Payment Method:** e.g., "Cash".
4. **Enter Amount:** Click exact amount or enter value (e.g., 5000).
5. Click **Complete Order**.
6. **Verify:**
   - Success message appears ("Sale completed").
   - Cart clears.
   - Navigate back to clean POS state.

---

## Phase 3: Post-Transaction Verification

### 3.1. Inventory Deduction
**Goal:** Verify real-time stock updates.
1. Navigate to **Shop > Inventory**.
2. Check **Stock Master** for the item sold in Step 2.1.
3. **Verify:** Quantity on Hand should be `Initial Qty - Sold Qty` (e.g., 500 - 5 = 495).

### 3.2. Accounting Integration
**Goal:** Verify financial ledger updates.
1. Navigate to **Shop > Accounting**.
2. Go to **General Ledger** (or Dashboard).
3. **Verify:**
   - A new journal entry exists for "Sales Revenue" (Credit) and "Cash/Bank" (Debit).
   - The amount matches the POS transaction grand total.

---

## Phase 4: Business Intelligence (BI) & Reporting

### 4.1. Sales Analytics
**Goal:** Verify data visualization.
1. Navigate to **Shop > Intelligence (BI)**.
2. Go to **Sales Analytics** tab.
3. **Verify:**
   - "Sales Today" metric reflects the recent transaction.
   - The Sales Trend graph shows data for the current timestamp.

### 4.2. Executive Overview
**Goal:** Verify high-level KPIs.
1. Go to **Executive Overview** tab.
2. Check **Total Revenue** KPI.
3. **Verify:** It approximates the consolidated sales (including the new one).

### 4.3. Export Data
1. Click the **Export** (Download) icon in the top right.
2. **Verify:** Alert confirms "Exporting BI Report..." (or file downloads).

---

## Troubleshooting / Edge Cases

- **"Relation does not exist" Error:** If seen during Checkout, ensure `npm run seed-shop-data` (or similar migration script) has been run on the server.
- **Empty Inventory:** Ensure `seed-shop-data.ts` populated warehouses/items, or use the "Add Product" feature if valid.
- **Server Connection:** Ensure `npm run dev` is running in the `server/` directory.
