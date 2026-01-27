# Purchase Bills Error Fix - Inventory Items Not Found

## Problem
When creating a purchase bill, the API returned a 500 error:
```
POST /api/purchase-bills/{billId}/items 500 (Internal Server Error)
{error: 'Failed to save purchase bill item'}
```

## Root Cause
The error occurred because:
1. **Inventory items weren't loaded** - The UI wasn't fetching inventory items from the API on page load
2. **Foreign key constraint violation** - When saving bill items, the API tried to insert a record referencing an `inventory_item_id` that didn't exist in the database
3. **No validation** - The API didn't check if the inventory item existed before trying to insert
4. **Poor error messages** - The API only showed "Failed to save" without details

## Fixes Applied

### 1. Enhanced API Error Handling (`server/api/routes/purchaseBills.ts`)

**Added pre-save validation:**
```typescript
// Verify inventory item exists
const [inventoryItem] = await db.query(
  'SELECT id, name FROM inventory_items WHERE id = $1 AND tenant_id = $2',
  [item.inventoryItemId, req.tenantId]
);

if (!inventoryItem) {
  return res.status(400).json({ 
    error: 'Invalid inventory item',
    message: 'The selected inventory item does not exist. Please refresh and try again.'
  });
}
```

**Better error logging:**
```typescript
console.error('Error details:', {
  message: error.message,
  code: error.code,
  detail: error.detail,
  constraint: error.constraint,
  table: error.table
});
```

**Specific error messages for foreign key violations:**
```typescript
if (error.code === '23503') { // Foreign key violation
  return res.status(400).json({ 
    error: 'Invalid reference',
    message: 'The inventory item or bill reference is invalid. Please refresh the page and try again.'
  });
}
```

### 2. Load Inventory Items on Page Load (`components/inventory/PurchasesTab.tsx`)

**Added inventory items fetch:**
```typescript
useEffect(() => {
    loadPurchaseBills();
    loadInventoryItems();  // NEW: Load inventory items
}, []);

const loadInventoryItems = async () => {
    try {
        const items = await apiClient.get<InventoryItem[]>('/inventory-items');
        console.log('Loaded inventory items:', items.length, items);
        dispatch({ type: 'SET_INVENTORY_ITEMS', payload: items });
    } catch (error) {
        console.error('Error loading inventory items:', error);
        showAlert('Failed to load inventory items. Please refresh the page.');
    }
};
```

### 3. Better UI Error Handling

**Per-item error reporting:**
```typescript
const itemErrors: string[] = [];
for (let i = 0; i < billItems.length; i++) {
    try {
        await apiClient.post(`/purchase-bills/${savedBill.id}/items`, itemData);
    } catch (itemError: any) {
        const invItem = state.inventoryItems.find(inv => inv.id === item.inventoryItemId);
        itemErrors.push(`Item ${i + 1} (${invItem?.name || item.itemName}): ${itemError.response?.data?.message}`);
    }
}

if (itemErrors.length > 0) {
    showAlert(`Bill created but some items failed:\n${itemErrors.join('\n')}`);
}
```

### 4. Added Missing Action Types

**Updated types (`types.ts`):**
```typescript
| { type: 'SET_INVENTORY_ITEMS'; payload: InventoryItem[] }
```

**Updated reducer (`context/AppContext.tsx`):**
```typescript
case 'SET_INVENTORY_ITEMS':
    return { ...state, inventoryItems: action.payload };
```

## How to Test the Fix

1. **Ensure inventory items exist:**
   - Go to Settings → Inventory Items
   - Create at least one inventory item
   - Note the item ID and verify it's in the database

2. **Create a purchase bill:**
   - Go to My Biz Transaction → Purchases
   - Click "New Bill"
   - Select a vendor
   - Add a line item with the inventory item you created
   - Save the bill

3. **Check the console:**
   - Open browser DevTools (F12)
   - Look for: `Loaded inventory items: X [...]`
   - This confirms items are loading

4. **If errors occur:**
   - Check the detailed error message
   - Verify the inventory item exists in the database:
     ```sql
     SELECT * FROM inventory_items WHERE tenant_id = 'your_tenant_id';
     ```
   - Check if the item ID matches what's being sent from the UI

## Prevention

To prevent this error in the future:

1. **Always create inventory items first** before creating purchase bills
2. **Use the inventory item dropdown** - don't manually enter IDs
3. **Refresh the page** if you just created a new inventory item
4. **Check the console** for "Loaded inventory items" message on page load

## Database Integrity

The foreign key constraint is working correctly:
```sql
FOREIGN KEY (inventory_item_id) REFERENCES inventory_items(id) ON DELETE RESTRICT
```

This ensures:
- ✅ Can't reference non-existent inventory items
- ✅ Can't delete inventory items that are used in bills
- ✅ Data integrity maintained

## Summary

**Before:**
- ❌ Inventory items not loaded
- ❌ Generic 500 error
- ❌ No validation
- ❌ Can't identify which item failed

**After:**
- ✅ Inventory items auto-loaded on page mount
- ✅ Clear error messages ("inventory item does not exist")
- ✅ Pre-save validation checks
- ✅ Per-item error reporting
- ✅ Better debugging with console logs

The fix ensures that inventory items are available when creating bills and provides clear feedback if something goes wrong.
