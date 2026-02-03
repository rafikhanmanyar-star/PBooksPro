# Shop Sales Returns Table Renaming - Complete Implementation

## Overview
Renamed the shop sales returns table from `sales_returns` to `my_shop_sales_returns` to avoid naming conflicts with the existing project sales returns feature.

## Changes Made

### 1. Database Schema (SQLite - Client Side)

**File:** `services/database/schema.ts`
- Added `my_shop_sales_returns` table definition (lines 1124-1139)
- Table includes: id, tenant_id, sale_id, return_date, reason, total_amount, status, notes
- Created indexes for tenant_id and sale_id

**File:** `services/database/databaseService.ts`
- Added `my_shop_sales_returns` to required tables list (line 1108)
- Added `ensureAllTablesExist()` call after database initialization (line 317)
- This ensures the table is automatically created in existing databases

### 2. Repository Layer

**File:** `services/database/repositories/index.ts`
- Created `ShopSalesReturnsRepository` class pointing to `my_shop_sales_returns` table

**File:** `services/database/repositories/appStateRepository.ts`
- Imported and initialized `shopSalesReturnsRepo` (lines 20-21, 65)
- Load shop sales returns in `loadState()` (line 151)
- Save shop sales returns in `saveState()` (line 873)
- Added entity mapping in `getRepoByEntityKey()` (line 1063)

### 3. Type Definitions

**File:** `types.ts`
- Added `ShopSalesReturn` interface (lines 512-513)
- Added `shopSalesReturns: ShopSalesReturn[]` to `AppState` interface (lines 737-740)

### 4. Application Context

**File:** `context/AppContext.tsx`
- Added `shopSalesReturns: []` to initial state (line 259)

### 5. Sync Manager

**File:** `services/sync/syncManager.ts`
- Added endpoint mapping: `my_shop_sales_returns` → `/shop/returns` (line 355)

### 6. Database Schema (PostgreSQL - Server Side)

**File:** `server/migrations/add-shop-sales-returns-table.sql` (NEW)
- Created PostgreSQL migration script for `my_shop_sales_returns` table
- Includes foreign keys to tenants and shop_sales tables
- Includes indexes for performance
- Run with: `psql -d pbooks -f server/migrations/add-shop-sales-returns-table.sql`

### 7. Server API Routes

**File:** `server/api/routes/shopSales.ts`
- Added GET `/shop/returns` - Fetch all returns (lines 278-298)
- Added GET `/shop/returns/:id` - Fetch single return (lines 300-316)
- Added POST `/shop/returns` - Create new return (lines 318-373)
  - Creates return record
  - Updates sale status to 'Returned'
  - Restores inventory stock
- Added PUT `/shop/returns/:id` - Update return (lines 375-401)
- Added DELETE `/shop/returns/:id` - Delete return (lines 403-425)
- Added `normalizeShopSalesReturn()` helper function (lines 590-604)

## Table Separation

### `sales_returns` (Project Sales Returns)
- **Purpose:** Project-level sales returns for project agreements
- **Location:** Existing table, unchanged
- **Fields:** return_number, agreement_id, penalty_amount, refund_amount, etc.
- **Used by:** Project sales return feature

### `my_shop_sales_returns` (Shop Sales Returns)
- **Purpose:** Retail shop sales returns for POS system
- **Location:** New table
- **Fields:** sale_id, return_date, reason, total_amount, status, notes
- **Used by:** My Shop / POS feature

## API Endpoints

### Shop Sales Returns
- `GET /api/shop/returns` - List all shop returns
- `GET /api/shop/returns/:id` - Get specific return
- `POST /api/shop/returns` - Create new return
- `PUT /api/shop/returns/:id` - Update return
- `DELETE /api/shop/returns/:id` - Delete return

### Project Sales Returns (Unchanged)
- Existing endpoints remain at `/api/sales-returns/*`

## Database Migration

### For Existing Users (Client-Side)
The `ensureAllTablesExist()` function will automatically create the `my_shop_sales_returns` table when:
1. The app loads
2. User clicks "Click to Fix Now" button if error appears
3. Database is initialized

### For Server (PostgreSQL)
Run the migration script:
```bash
psql -d pbooks -f server/migrations/add-shop-sales-returns-table.sql
```

## Testing Checklist

- [ ] Client-side database creates `my_shop_sales_returns` table automatically
- [ ] Shop sales returns can be created via POS
- [ ] Returns restore inventory stock correctly
- [ ] Sale status updates to 'Returned'
- [ ] Server API endpoints work correctly
- [ ] WebSocket events emit properly
- [ ] Project sales returns still work (no conflicts)
- [ ] Sync works for shop returns

## Notes

- The original `sales_returns` table remains untouched for project sales returns
- All shop-related returns now use `my_shop_sales_returns`
- Clear separation between project and shop features
- No data migration needed (new feature)
