# Inventory Items - Expense Category Integration

## Overview
Added **Expense Category** field to inventory items to enable purchase tracking in the "My Shop" section. When inventory items are purchased, expenses will be automatically recorded under the linked expense category.

---

## 🎯 What's New

### Expense Category Field
- **Optional field** in inventory item form
- Links inventory items to expense categories
- Dropdown selection from existing expense categories (EXPENSE type only)
- Future-ready for purchase tracking in "My Shop" module

---

## 📊 Database Changes

### PostgreSQL Schema Update

```sql
-- Added to inventory_items table
expense_category_id TEXT,

-- Foreign key constraint
FOREIGN KEY (expense_category_id) REFERENCES categories(id) ON DELETE SET NULL

-- New index
CREATE INDEX idx_inventory_items_expense_category_id ON inventory_items(expense_category_id);
```

### SQLite Schema Update
```sql
-- Added to inventory_items table
expense_category_id TEXT,

-- Foreign key constraint
FOREIGN KEY (expense_category_id) REFERENCES categories(id) ON DELETE SET NULL

-- New index
CREATE INDEX idx_inventory_items_expense_category ON inventory_items(expense_category_id);
```

### Data Integrity
- **ON DELETE SET NULL**: If expense category is deleted, inventory items are preserved (category link removed)
- **Indexed**: Fast lookups for category-based queries
- **Optional**: Not required, can be null

---

## 🔌 API Changes

### Updated Endpoints

#### POST `/api/inventory-items`
**New Field in Request Body:**
```json
{
  "name": "Wood Planks",
  "expenseCategoryId": "cat_123",  // ← NEW: Optional
  "unitType": "LENGTH_FEET",
  "pricePerUnit": 5.50,
  "description": "Pine wood planks"
}
```

#### GET `/api/inventory-items/:id`
**New Field in Response:**
```json
{
  "id": "inv_item_123",
  "name": "Wood Planks",
  "expense_category_id": "cat_123",  // ← NEW
  "category_name": "Construction Materials",  // ← NEW (populated)
  "unit_type": "LENGTH_FEET",
  "price_per_unit": 5.50,
  "description": "Pine wood planks"
}
```

---

## 🎨 UI Changes

### InventoryItemForm Component

**New Field Added (after Parent selection):**

```typescript
// Expense Category Selection
<div>
  <label>
    Expense Category
    <span>(Optional - for purchase tracking in My Shop)</span>
  </label>
  <select value={expenseCategoryId} onChange={(e) => setExpenseCategoryId(e.target.value)}>
    <option value="">No Category</option>
    {expenseCategories.map(category => (
      <option key={category.id} value={category.id}>
        {category.name}
      </option>
    ))}
  </select>
  {expenseCategoryId && (
    <p className="text-xs text-slate-500">
      Purchases will be recorded under: {categoryName}
    </p>
  )}
</div>
```

**Features:**
- Only shows **expense categories** (filters out income categories)
- Sorted alphabetically
- Shows "No Category" option
- Helper text shows selected category name
- Explains purpose: "for purchase tracking in My Shop"

### SettingsPage (Table View)

**New Column Added:**

| Name | **Expense Category** | Unit Type | Price/Unit | Description |
|------|---------------------|-----------|------------|-------------|
| Wood | Construction Materials | Length (Feet) | $5.50 | Pine wood |

**Display Logic:**
- Shows category name (not ID)
- Shows "-" if no category assigned
- Populated via category lookup in data preparation

---

## 💾 State Management

### TypeScript Types

```typescript
export interface InventoryItem {
  id: string;
  name: string;
  parentId?: string;
  expenseCategoryId?: string;  // ← NEW
  unitType: InventoryUnitType;
  pricePerUnit: number;
  description?: string;
  userId?: string;
  createdAt?: string;
  updatedAt?: string;
  // Virtual fields
  children?: InventoryItem[];
  parentName?: string;
  categoryName?: string;  // ← NEW (for UI display)
}
```

### AppStateRepository Update

```typescript
inventoryItems: (inventoryItems || []).map(item => ({
    id: item.id || '',
    name: item.name || '',
    parentId: item.parentId ?? item.parent_id ?? undefined,
    expenseCategoryId: item.expenseCategoryId ?? item.expense_category_id ?? undefined,  // ← NEW
    unitType: item.unitType ?? item.unit_type ?? 'QUANTITY',
    pricePerUnit: /* ... */,
    description: item.description ?? undefined,
    userId: item.userId ?? item.user_id ?? undefined,
    createdAt: item.createdAt ?? item.created_at ?? undefined,
    updatedAt: item.updatedAt ?? item.updated_at ?? undefined
}))
```

---

## 🔄 Synchronization

### No Changes Required
- Existing sync logic handles new field automatically
- `expense_category_id` syncs like other optional fields
- Local SQLite → Cloud PostgreSQL sync unchanged

### Sync Flow (No Changes)
```
User creates/updates item with category
    ↓
dispatch({ type: 'ADD_INVENTORY_ITEM', payload })
    ↓
Local SQLite updated (with expense_category_id)
    ↓
Sync queue operation
    ↓
API POST /inventory-items (includes expenseCategoryId)
    ↓
Cloud PostgreSQL updated
    ↓
WebSocket broadcast (future)
```

---

## 🚀 Future Use Case: Purchase Tracking in "My Shop"

### Planned Implementation

When inventory items are purchased in the **My Shop** module:

```typescript
// Example: Purchase flow (to be implemented)
const purchaseInventoryItem = async (itemId: string, quantity: number) => {
  const item = state.inventoryItems.find(i => i.id === itemId);
  
  if (item.expenseCategoryId) {
    // Create expense transaction
    const expense = {
      amount: item.pricePerUnit * quantity,
      categoryId: item.expenseCategoryId,  // ← Links to expense category
      description: `Purchase: ${item.name} (${quantity} ${item.unitType})`,
      type: 'EXPENSE'
    };
    
    // Record transaction
    await createTransaction(expense);
    
    // Update inventory stock (future feature)
    await updateInventoryStock(itemId, quantity);
  }
};
```

### Benefits
1. **Automatic Expense Tracking**: Purchases auto-categorized
2. **Budget Management**: Track spending by category
3. **Inventory Valuation**: Link inventory to financial records
4. **Reporting**: Generate purchase reports by category
5. **Tax Preparation**: Categorized expenses for tax filing

---

## 📝 Migration Guide

### For Existing Installations

#### Step 1: Backup Database
```bash
pg_dump -h [host] -U [user] -d [database] > backup_before_category_update.sql
```

#### Step 2: Run Migration
```bash
psql -h [host] -U [user] -d [database] -f server/migrations/add-expense-category-to-inventory-items.sql
```

#### Step 3: Verify Migration
```sql
-- Check column exists
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'inventory_items' AND column_name = 'expense_category_id';

-- Check index exists
SELECT indexname FROM pg_indexes 
WHERE tablename = 'inventory_items' AND indexname = 'idx_inventory_items_expense_category_id';

-- Check foreign key exists
SELECT conname FROM pg_constraint 
WHERE conrelid = 'inventory_items'::regclass AND conname = 'inventory_items_expense_category_id_fkey';
```

#### Step 4: Restart Services
```bash
npm run server:restart
```

#### Step 5: Test
1. Login to application
2. Navigate to Settings → Inventory Items
3. Create/Edit inventory item
4. Verify "Expense Category" dropdown appears
5. Select a category and save
6. Verify category shows in table view

### For New Installations
- Schema already includes `expense_category_id`
- No migration needed
- Ready to use immediately

---

## 🧪 Testing Checklist

### Database Tests
- ✅ Create item with expense category
- ✅ Create item without expense category (null)
- ✅ Update item to add category
- ✅ Update item to remove category (set to null)
- ✅ Delete category → verify item preserved (category set to null)
- ✅ Verify foreign key constraint works
- ✅ Verify index improves query performance

### API Tests
- ✅ POST with `expenseCategoryId` → verify saved
- ✅ POST without `expenseCategoryId` → verify null stored
- ✅ GET item → verify `category_name` populated
- ✅ Update item category → verify updated
- ✅ Invalid category ID → verify error handling

### UI Tests
- ✅ Form shows expense category dropdown
- ✅ Dropdown only shows EXPENSE type categories
- ✅ "No Category" option available
- ✅ Selected category shows in helper text
- ✅ Table column shows category name
- ✅ Table shows "-" when no category
- ✅ Search works with category names

### Sync Tests
- ✅ Online create with category → verify cloud save
- ✅ Offline create with category → reconnect → verify sync
- ✅ Update category → verify sync across clients

---

## 📋 Files Modified

### Backend (5 files)
1. **`server/migrations/postgresql-schema.sql`**
   - Added `expense_category_id` column
   - Added foreign key constraint
   - Added index

2. **`services/database/schema.ts`**
   - Added `expense_category_id` column (SQLite)
   - Added foreign key constraint
   - Added index

3. **`server/migrations/add-inventory-items-table.sql`**
   - Updated to include `expense_category_id`

4. **`server/api/routes/inventoryItems.ts`**
   - Added `expenseCategoryId` handling in POST
   - Added `category_name` lookup in GET by ID
   - Updated INSERT/UPDATE queries

5. **`services/database/repositories/appStateRepository.ts`**
   - Added `expenseCategoryId` mapping in `loadState()`

### Frontend (3 files)
6. **`types.ts`**
   - Added `expenseCategoryId?: string` to `InventoryItem`
   - Added `categoryName?: string` virtual field

7. **`components/settings/InventoryItemForm.tsx`**
   - Added `expenseCategoryId` state
   - Added expense category dropdown (after parent selection)
   - Filtered categories to EXPENSE type only
   - Added helper text showing selected category

8. **`components/settings/SettingsPage.tsx`**
   - Added "Expense Category" column to table
   - Added category name lookup in data preparation

### Migration (1 file)
9. **`server/migrations/add-expense-category-to-inventory-items.sql`**
   - New migration script for existing installations

### Documentation (1 file)
10. **`doc/INVENTORY_EXPENSE_CATEGORY.md`**
    - This comprehensive guide

**Total: 10 files modified/created**

---

## 🎯 Summary

### What Was Added
✅ **Database Field**: `expense_category_id` (optional, indexed, foreign key)  
✅ **API Support**: POST/GET endpoints handle new field  
✅ **UI Component**: Expense category dropdown in form  
✅ **Table Display**: Category name column in settings table  
✅ **State Management**: Full sync and persistence support  
✅ **Migration Script**: For existing installations  
✅ **Documentation**: Complete implementation guide  

### Future-Ready For
🔜 Purchase tracking in "My Shop" module  
🔜 Automatic expense categorization  
🔜 Budget tracking by category  
🔜 Inventory-to-finance linkage  
🔜 Purchase reports and analytics  

### Backward Compatible
✅ Existing inventory items unaffected (category is optional)  
✅ No breaking changes to existing functionality  
✅ Graceful handling of null values  

---

## ✅ Implementation Complete

The expense category integration is **fully implemented** and **production-ready**. Users can now:

1. **Assign expense categories** to inventory items
2. **Track future purchases** under specific expense categories
3. **View category assignments** in the settings table
4. **Filter and search** by expense category
5. **Prepare for "My Shop"** purchase tracking module

**Status: ✅ Complete & Ready for Production**

---

**Implementation Date:** January 25, 2026  
**Feature:** Expense Category Integration for Inventory Items  
**Module:** Settings → Inventory Items  
**Future Use:** My Shop → Purchase Tracking
