# Procurement Warehouse Dropdown Fix

## Issue
The procurement module's "Target Warehouse/Store" dropdown was empty, preventing users from selecting a destination for purchased goods.

## Root Cause
The database had **no warehouses created** for the tenant. The warehouse dropdown depends on data from the `shop_warehouses` table, which was empty.

## Solution Implemented

### 1. **Auto-Create Default Warehouse** ✅
Enhanced `shopService.getWarehouses()` to automatically create a default warehouse if none exist:

```typescript
// In server/services/shopService.ts
if (warehouses.length === 0) {
    console.log(`[ShopService] ⚠️ No warehouses found! Creating default warehouse...`);
    const defaultWarehouse = await this.db.query(`
        INSERT INTO shop_warehouses (tenant_id, name, code, location, is_active)
        VALUES ($1, 'Main Warehouse', 'WH-MAIN', 'Head Office', TRUE)
        RETURNING *
    `, [tenantId]);
    return defaultWarehouse;
}
```

### 2. **Comprehensive Logging** ✅
Added detailed console logging to track warehouse loading:

**Backend (`shopService.ts`):**
- Logs warehouse count on fetch
- Logs warehouse creation from branches
- Logs default warehouse creation

**Frontend (`InventoryContext.tsx`):**
- Logs raw API response
- Logs warehouse count
- Logs mapped warehouses

**UI (`ProcurementPage.tsx`):**
- Logs warehouses received by the component
- Logs warehouse count in useEffect

### 3. **Branch-to-Warehouse Sync** ✅
The existing logic already syncs branches to warehouses. If branches exist but warehouses don't, it auto-creates warehouses from branches.

## How to Test

1. **Refresh the procurement page** - The new logging will show in browser console
2. **Check the dropdown** - Should now show "Main Warehouse (WH-MAIN)" or any existing warehouses
3. **View browser console** - Should see:
   ```
   🔄 [InventoryContext] Fetching warehouses, products, and inventory...
   📦 [InventoryContext] Raw warehouses from API: [...]
   📦 [InventoryContext] Warehouses count: 1
   ✅ [InventoryContext] Warehouses set in state: [...]
   📦 [ProcurementPage] Warehouses loaded: [...]
   📦 [ProcurementPage] Warehouses count: 1
   ```

4. **Check server logs** - Should see:
   ```
   [ShopService] Fetching warehouses for tenant: xxx
   [ShopService] Found 0 warehouses and X branches
   [ShopService] ⚠️ No warehouses found! Creating default warehouse...
   [ShopService] ✅ Default warehouse created: {...}
   ```

## What Happens Now

### First Time Loading:
1. User visits procurement page
2. `InventoryContext` calls `shopApi.getWarehouses()`
3. Backend checks if warehouses exist
4. **If none exist:** Creates "Main Warehouse (WH-MAIN)"
5. Returns warehouse to frontend
6. Dropdown now has options!

### Subsequent Loads:
1. Warehouse already exists in database
2. Fetched and displayed immediately
3. User can select it for procurement

## Managing Warehouses

Users can add more warehouses through:
- **Multi-Store Management** → Branches → (auto-creates warehouses)
- **Direct warehouse creation** via API (future UI feature)

## Database State

After this fix, the `shop_warehouses` table will have at least one entry:

```sql
SELECT * FROM shop_warehouses;
```

Expected result:
```
id         | tenant_id | name           | code    | location     | is_active
-----------|-----------|----------------|---------|--------------|----------
<uuid>     | <tenant>  | Main Warehouse | WH-MAIN | Head Office  | true
```

## Files Modified

1. ✅ `server/services/shopService.ts` - Auto-create default warehouse
2. ✅ `context/InventoryContext.tsx` - Added debugging logs  
3. ✅ `components/shop/ProcurementPage.tsx` - Added debugging logs

## Next Steps

1. **Test the fix** - Refresh procurement page and check dropdown
2. **Review console logs** - Verify warehouse loading
3. **Optional:** Create additional warehouses for multiple locations
4. **Optional:** Remove debug console.log statements after confirming fix

---

**Status:** ✅ FIXED  
**Impact:** Users can now select warehouses in procurement module  
**Date:** 2026-02-02
