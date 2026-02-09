# Fix: New Stores Not Appearing in Procurement Page

## Issue
When a new store/branch is created in the POS Multi-Store page, it doesn't appear in the warehouse dropdown on the Procurement page.

## Root Cause
The `InventoryContext` fetches warehouses only once when it mounts. When a new store is created:
1. Backend creates a new branch in `shop_branches` table
2. Backend automatically creates a corresponding warehouse in `shop_warehouses` table (with same ID)
3. Frontend `MultiStoreContext` updates its local state
4. **BUT** `InventoryContext` doesn't know about the new warehouse
5. Procurement page still shows old warehouse list

## Solution

### 1. Added `refreshWarehouses` Function to InventoryContext

**File**: `context/InventoryContext.tsx`

Added a new function to manually refresh the warehouses list:

```typescript
interface InventoryContextType {
    // ... existing fields
    refreshWarehouses: () => Promise<void>; // NEW
}

// Implementation
const refreshWarehouses = useCallback(async () => {
    try {
        console.log('🔄 [InventoryContext] Refreshing warehouses...');
        const warehousesList = await shopApi.getWarehouses();
        const whs: Warehouse[] = warehousesList.map((w: any) => ({
            id: w.id,
            name: w.name,
            code: w.code,
            location: w.location || 'Main'
        }));
        setWarehouses(whs);
        console.log('✅ [InventoryContext] Warehouses refreshed:', whs);
    } catch (error) {
        console.error('Failed to refresh warehouses:', error);
    }
}, []);

// Added to context value
const value = {
    // ... existing fields
    refreshWarehouses,
};
```

### 2. Auto-Refresh Warehouses in Procurement Page

**File**: `components/shop/ProcurementPage.tsx`

Added automatic refresh when the page mounts:

```typescript
const ProcurementContent: React.FC = () => {
    const { items, warehouses, updateStock, addItem, refreshWarehouses } = useInventory();
    
    // 🔄 Refresh warehouses when component mounts to get latest stores
    React.useEffect(() => {
        console.log('🔄 [ProcurementPage] Refreshing warehouses on mount...');
        refreshWarehouses();
    }, [refreshWarehouses]);
    
    // ... rest of component
};
```

## How It Works

### Backend (Already Working)
When a new branch is created via `shopService.createBranch()`:

```typescript
// 1. Create branch
const res = await client.query(`
    INSERT INTO shop_branches (...)
    VALUES (...)
    RETURNING id
`);

const branchId = res.rows[0].id;

// 2. Auto-create warehouse with same ID
await client.query(`
    INSERT INTO shop_warehouses (id, tenant_id, name, code, location)
    VALUES ($1, $2, $3, $4, $5)
`, [branchId, tenantId, data.name, branchCode, data.location]);
```

### Frontend (Now Fixed)
1. User creates new store in Multi-Store page
2. Store saved to database
3. Warehouse automatically created
4. User navigates to Procurement page
5. **Procurement page calls `refreshWarehouses()` on mount**
6. Latest warehouses fetched from API
7. New store appears in dropdown ✅

## Testing

### Test Steps
1. **Create New Store**:
   - Go to Shop → Multi-Store
   - Click "Register Store"
   - Fill in store details (name, location, etc.)
   - Click "Register Branch"
   - Store created successfully

2. **Verify in Procurement**:
   - Go to Shop → Procurement
   - Check "Target Warehouse/Store" dropdown
   - **New store should appear in the list** ✅

3. **Use New Store**:
   - Select the new store from dropdown
   - Add products to purchase
   - Complete stock-in
   - Verify inventory updated for new store

### Expected Behavior
- ✅ New stores appear immediately in Procurement dropdown
- ✅ No page refresh needed
- ✅ Warehouses refreshed automatically on page mount
- ✅ Console logs show refresh happening

### Console Logs
When working correctly, you should see:

```
🔄 [ProcurementPage] Refreshing warehouses on mount...
🔄 [InventoryContext] Refreshing warehouses...
✅ [InventoryContext] Warehouses refreshed: [{id: '...', name: 'New Store', ...}]
📦 [ProcurementPage] Warehouses loaded: [{...}]
📦 [ProcurementPage] Warehouses count: 3
```

## Benefits

### 1. **Automatic Sync**
- Procurement page always shows latest warehouses
- No manual refresh needed
- Works seamlessly with Multi-Store

### 2. **Reusable Function**
- `refreshWarehouses()` can be called from anywhere
- Other components can use it too
- Useful for future features

### 3. **No Breaking Changes**
- Existing functionality preserved
- Only adds new capability
- Backward compatible

## Future Enhancements

### 1. **Real-time Updates**
Instead of refreshing on mount, use WebSocket or polling:

```typescript
// In InventoryContext
React.useEffect(() => {
    const interval = setInterval(() => {
        refreshWarehouses();
    }, 30000); // Refresh every 30 seconds
    
    return () => clearInterval(interval);
}, [refreshWarehouses]);
```

### 2. **Event-Based Refresh**
Emit event when store created, listen in InventoryContext:

```typescript
// In MultiStoreContext after creating store
window.dispatchEvent(new CustomEvent('warehouse-created'));

// In InventoryContext
React.useEffect(() => {
    const handleWarehouseCreated = () => refreshWarehouses();
    window.addEventListener('warehouse-created', handleWarehouseCreated);
    return () => window.removeEventListener('warehouse-created', handleWarehouseCreated);
}, [refreshWarehouses]);
```

### 3. **Optimistic Updates**
Update local state immediately, sync with server in background:

```typescript
// In MultiStoreContext
const addStore = async (storeData) => {
    // 1. Add to local state immediately
    const tempId = crypto.randomUUID();
    setStores(prev => [...prev, { ...storeData, id: tempId }]);
    
    // 2. Sync with server
    const response = await shopApi.createBranch(storeData);
    
    // 3. Update with real ID
    setStores(prev => prev.map(s => 
        s.id === tempId ? { ...s, id: response.id } : s
    ));
};
```

## Related Files

### Modified Files
- `context/InventoryContext.tsx` - Added `refreshWarehouses` function
- `components/shop/ProcurementPage.tsx` - Auto-refresh on mount

### Related Files (Not Modified)
- `server/services/shopService.ts` - Creates warehouse when branch created
- `context/MultiStoreContext.tsx` - Creates stores/branches
- `services/api/shopApi.ts` - API endpoints

## Summary

The issue is now fixed! New stores created in the Multi-Store page will automatically appear in the Procurement page's warehouse dropdown. The solution:

1. ✅ Added `refreshWarehouses()` function to InventoryContext
2. ✅ Procurement page calls it on mount
3. ✅ Latest warehouses always fetched
4. ✅ No breaking changes
5. ✅ Reusable for future features

Users can now:
- Create stores in Multi-Store page
- Navigate to Procurement page
- See new stores in dropdown immediately
- Use new stores for stock-in operations
