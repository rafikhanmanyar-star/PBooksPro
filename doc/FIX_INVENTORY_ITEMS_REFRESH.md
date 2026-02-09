# Fix: New Inventory Items (SKUs) Not Appearing in Procurement Page

## Issue
When a new inventory item (SKU/product) is created in the Inventory page, it doesn't appear in the Procurement page's product search/combo box.

## Root Cause
Similar to the warehouse issue, the `InventoryContext` fetches products/items only once when it mounts. When a new SKU is created:
1. Product saved to `shop_products` table
2. Frontend `InventoryContext` updates local state
3. **BUT** when user navigates to Procurement page, it still shows old product list
4. New SKU not visible in product search dropdown

## Solution

### 1. Added `refreshItems` Function to InventoryContext

**File**: `context/InventoryContext.tsx`

Added a new function to manually refresh the products/items list:

```typescript
interface InventoryContextType {
    // ... existing fields
    refreshItems: () => Promise<void>; // NEW: Refresh products/SKU list
}

// Implementation
const refreshItems = useCallback(async () => {
    try {
        console.log('🔄 [InventoryContext] Refreshing products/items...');
        const [products, inventory] = await Promise.all([
            shopApi.getProducts(),
            shopApi.getInventory()
        ]);

        // Aggregate Stock
        const stockMap: Record<string, { total: number, reserved: number, byWh: Record<string, number> }> = {};

        inventory.forEach((inv: any) => {
            if (!stockMap[inv.product_id]) {
                stockMap[inv.product_id] = { total: 0, reserved: 0, byWh: {} };
            }
            const qty = parseFloat(inv.quantity_on_hand || '0');
            const reserved = parseFloat(inv.quantity_reserved || '0');
            stockMap[inv.product_id].total += qty;
            stockMap[inv.product_id].reserved += reserved;
            stockMap[inv.product_id].byWh[inv.warehouse_id] = qty;
        });

        // Map Products to InventoryItems
        const mappedItems: InventoryItem[] = products.map((p: any) => ({
            id: p.id,
            sku: p.sku,
            barcode: p.barcode || undefined,
            name: p.name,
            category: p.category_id || 'General',
            unit: p.unit || 'pcs',
            onHand: stockMap[p.id]?.total || 0,
            available: (stockMap[p.id]?.total || 0) - (stockMap[p.id]?.reserved || 0),
            reserved: stockMap[p.id]?.reserved || 0,
            inTransit: 0,
            damaged: 0,
            costPrice: parseFloat(p.cost_price || '0'),
            retailPrice: parseFloat(p.retail_price || '0'),
            reorderPoint: p.reorder_point || 10,
            warehouseStock: stockMap[p.id]?.byWh || {}
        }));

        setItems(mappedItems);
        console.log('✅ [InventoryContext] Products refreshed:', mappedItems.length, 'items');
    } catch (error) {
        console.error('Failed to refresh products:', error);
    }
}, []);

// Added to context value
const value = {
    // ... existing fields
    refreshItems,
};
```

### 2. Auto-Refresh Products in Procurement Page

**File**: `components/shop/ProcurementPage.tsx`

Added automatic refresh when the page mounts:

```typescript
const ProcurementContent: React.FC = () => {
    const { items, warehouses, updateStock, addItem, refreshWarehouses, refreshItems } = useInventory();
    
    // 🔄 Refresh items/products when component mounts to get latest SKUs
    React.useEffect(() => {
        console.log('🔄 [ProcurementPage] Refreshing products on mount...');
        refreshItems();
    }, [refreshItems]);
    
    // ... rest of component
};
```

### 3. Auto-Refresh After Creating New Product

**File**: `context/InventoryContext.tsx`

Updated `addItem` function to refresh items list after creating a product:

```typescript
const addItem = useCallback(async (item: InventoryItem) => {
    try {
        const payload = {
            sku: item.sku,
            barcode: item.barcode || null,
            name: item.name,
            // ... other fields
        };

        const response = await shopApi.createProduct(payload) as any;

        if (response && response.id) {
            const newItem = { ...item, id: response.id };
            setItems(prev => [...prev, newItem]);
            
            // Refresh items list to ensure it's in sync with database
            await refreshItems();
            
            return newItem;
        }
    } catch (error) {
        // ... error handling
    }
}, [refreshItems]);
```

## How It Works Now

### Scenario 1: Creating SKU in Inventory Page
1. User creates new SKU in **Shop → Inventory**
2. Product saved to database
3. `addItem` function called
4. **`refreshItems()` automatically called** after save
5. Items list refreshed from database
6. New SKU immediately available ✅

### Scenario 2: Navigating to Procurement Page
1. User navigates to **Shop → Procurement**
2. **Page calls `refreshItems()` on mount**
3. Latest products fetched from database
4. All SKUs (including newly created ones) appear in search ✅

### Scenario 3: Creating SKU in Procurement Page
1. User clicks "New Product" in Procurement page
2. Product created via `addItem`
3. **`refreshItems()` automatically called**
4. New SKU immediately appears in product search ✅

## Testing

### Test Steps

#### Test 1: Create SKU in Inventory
1. Go to **Shop → Inventory**
2. Click **"New SKU"**
3. Fill in product details (name, SKU, prices, etc.)
4. Click **"Create Product"**
5. Go to **Shop → Procurement**
6. Search for the new product
7. **New SKU should appear in search results** ✅

#### Test 2: Create SKU in Procurement
1. Go to **Shop → Procurement**
2. Search for a product that doesn't exist
3. Click **"+ New Product"** in dropdown
4. Fill in product details
5. Click **"Create & Add to Order"**
6. **New SKU should immediately appear in search** ✅
7. **New SKU should be added to purchase draft** ✅

#### Test 3: Multiple SKUs
1. Create 3 new SKUs in Inventory page
2. Navigate to Procurement page
3. **All 3 new SKUs should appear in search** ✅

### Expected Behavior
- ✅ New SKUs appear immediately after creation
- ✅ No page refresh needed
- ✅ Products refreshed automatically on page mount
- ✅ Products refreshed automatically after creation
- ✅ Console logs show refresh happening

### Console Logs
When working correctly, you should see:

```
🔄 [ProcurementPage] Refreshing products on mount...
🔄 [InventoryContext] Refreshing products/items...
✅ [InventoryContext] Products refreshed: 25 items

// After creating new SKU:
🔄 [InventoryContext] Refreshing products/items...
✅ [InventoryContext] Products refreshed: 26 items
```

## Benefits

### 1. **Immediate Availability**
- New SKUs appear instantly
- No manual refresh needed
- Seamless user experience

### 2. **Automatic Sync**
- Procurement page always shows latest products
- Inventory page and Procurement page stay in sync
- Database is source of truth

### 3. **Dual Refresh Strategy**
- **On mount**: Ensures latest data when page loads
- **After creation**: Ensures immediate availability after adding SKU
- **Best of both worlds**

### 4. **Reusable Function**
- `refreshItems()` can be called from anywhere
- Other components can use it too
- Useful for future features

## Technical Details

### Refresh Triggers

1. **Procurement Page Mount**
   ```typescript
   React.useEffect(() => {
       refreshItems();
   }, [refreshItems]);
   ```

2. **After Creating Product**
   ```typescript
   const response = await shopApi.createProduct(payload);
   await refreshItems(); // Refresh immediately
   ```

3. **Manual Refresh** (available for future use)
   ```typescript
   const { refreshItems } = useInventory();
   // Call anywhere: await refreshItems();
   ```

### Data Flow

```
User Creates SKU
    ↓
shopApi.createProduct()
    ↓
Database Updated
    ↓
refreshItems() Called
    ↓
shopApi.getProducts()
    ↓
Latest Products Fetched
    ↓
InventoryContext Updated
    ↓
All Components Re-render
    ↓
New SKU Visible ✅
```

## Related Fixes

This fix complements the warehouse refresh fix:

### Warehouse Refresh
- **Function**: `refreshWarehouses()`
- **Purpose**: Sync stores/warehouses
- **Trigger**: Procurement page mount

### Items Refresh (This Fix)
- **Function**: `refreshItems()`
- **Purpose**: Sync products/SKUs
- **Triggers**: 
  - Procurement page mount
  - After creating product

### Combined Effect
Both warehouses and products stay in sync:
- ✅ New stores appear in warehouse dropdown
- ✅ New SKUs appear in product search
- ✅ Complete synchronization

## Future Enhancements

### 1. **Optimistic Updates**
Update UI immediately, sync in background:

```typescript
const addItem = async (item) => {
    // 1. Add to local state immediately
    const tempId = crypto.randomUUID();
    setItems(prev => [...prev, { ...item, id: tempId }]);
    
    // 2. Sync with server
    const response = await shopApi.createProduct(item);
    
    // 3. Update with real ID
    setItems(prev => prev.map(i => 
        i.id === tempId ? { ...i, id: response.id } : i
    ));
};
```

### 2. **Real-time Updates**
Use WebSocket for instant sync across tabs/users:

```typescript
// Listen for product created events
socket.on('product-created', (product) => {
    setItems(prev => [...prev, product]);
});
```

### 3. **Selective Refresh**
Only refresh changed items, not entire list:

```typescript
const refreshItem = async (itemId) => {
    const product = await shopApi.getProduct(itemId);
    setItems(prev => prev.map(i => 
        i.id === itemId ? mapProduct(product) : i
    ));
};
```

### 4. **Cache Invalidation**
Smart caching with automatic invalidation:

```typescript
const cache = {
    products: null,
    timestamp: null,
    maxAge: 60000 // 1 minute
};

const getProducts = async () => {
    if (cache.products && Date.now() - cache.timestamp < cache.maxAge) {
        return cache.products;
    }
    cache.products = await shopApi.getProducts();
    cache.timestamp = Date.now();
    return cache.products;
};
```

## Related Files

### Modified Files
- `context/InventoryContext.tsx` - Added `refreshItems` function
- `components/shop/ProcurementPage.tsx` - Auto-refresh on mount

### Related Files (Not Modified)
- `services/api/shopApi.ts` - API endpoints
- `components/shop/InventoryPage.tsx` - Creates SKUs
- `server/services/shopService.ts` - Database operations

## Summary

The issue is now fixed! New inventory items (SKUs) created in the Inventory page will automatically appear in the Procurement page's product search. The solution:

1. ✅ Added `refreshItems()` function to InventoryContext
2. ✅ Procurement page calls it on mount
3. ✅ `addItem` calls it after creating product
4. ✅ Dual refresh strategy ensures immediate availability
5. ✅ No breaking changes
6. ✅ Reusable for future features

Users can now:
- Create SKUs in Inventory page
- Navigate to Procurement page
- See new SKUs in product search immediately
- Create SKUs directly in Procurement page
- Use new SKUs for purchase orders instantly

**Both warehouse and product synchronization issues are now resolved!** 🎉
