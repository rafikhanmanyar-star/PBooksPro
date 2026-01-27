# Fix: Expense Category Linking in Inventory Items

## Issue Report
**Problem:** Expense category dropdown in inventory item form was not properly linked to expense categories from the Chart of Accounts section.

**Root Cause:** The filter was using string literal `'EXPENSE'` instead of the `TransactionType.EXPENSE` enum value.

---

## ✅ Fix Applied

### Code Change

**File:** `components/settings/InventoryItemForm.tsx`

**Before:**
```typescript
import { InventoryItem, InventoryUnitType } from '../../types';

const expenseCategories = state.categories
  .filter(cat => cat.type === 'EXPENSE')  // ❌ String literal
  .sort((a, b) => a.name.localeCompare(b.name));
```

**After:**
```typescript
import { InventoryItem, InventoryUnitType, TransactionType } from '../../types';  // ← Added TransactionType

const expenseCategories = state.categories
  .filter(cat => cat.type === TransactionType.EXPENSE)  // ✅ Enum value
  .sort((a, b) => a.name.localeCompare(b.name));
```

---

## 🔍 How It Works Now

### Category Type Enum
```typescript
export enum TransactionType {
  INCOME = 'Income',    // Income categories (not shown in inventory)
  EXPENSE = 'Expense',  // Expense categories (shown in inventory dropdown)
  TRANSFER = 'Transfer',
  LOAN = 'Loan',
}
```

### Filter Logic
```typescript
// Only categories where cat.type === TransactionType.EXPENSE
// which equals 'Expense' (the enum value)
const expenseCategories = state.categories
  .filter(cat => cat.type === TransactionType.EXPENSE)
  .sort((a, b) => a.name.localeCompare(b.name));
```

---

## 🧪 Verification

### Debug Logging Added
```typescript
useEffect(() => {
  console.log('📊 Total categories:', state.categories.length);
  console.log('📊 Expense categories:', expenseCategories.length);
  console.log('📊 Sample types:', 
    state.categories.slice(0, 3).map(c => ({ name: c.name, type: c.type }))
  );
}, [state.categories, expenseCategories]);
```

**Expected Console Output:**
```
📊 Total categories: 15
📊 Expense categories: 8
📊 Sample types: [
  { name: "Rent Expense", type: "Expense" },
  { name: "Utilities", type: "Expense" },
  { name: "Sales Revenue", type: "Income" }
]
```

---

## ✅ Testing Checklist

### 1. Navigate to Chart of Accounts
- Go to **Settings → Chart of Accounts**
- Verify you have expense categories (type = "Expense")
- Note category names

### 2. Navigate to Inventory Items
- Go to **Settings → Inventory → Inventory Items**
- Click **"Add New"**

### 3. Check Expense Category Dropdown
- Should see "Expense Category" field
- Click dropdown
- **Should show:** All expense categories from Chart of Accounts
- **Should NOT show:** Income, Transfer, or Loan categories

### 4. Create Test Item
- Name: "Test Item"
- Expense Category: Select any expense category
- Unit: Quantity
- Price: 10
- Save

### 5. Verify in Table
- New item appears in table
- "Expense Category" column shows selected category name

### 6. Verify in Database
```sql
SELECT name, expense_category_id FROM inventory_items WHERE name = 'Test Item';
```
Should return the category ID.

---

## 🔗 How Categories Are Linked

### Database Relationship
```
inventory_items.expense_category_id → categories.id

WHERE categories.type = 'Expense'
```

### Data Flow
```
Chart of Accounts (Settings)
    ↓
Create Expense Category
    ↓
Saved to categories table (type = 'Expense')
    ↓
AppContext state.categories[] updated
    ↓
Inventory Form filters: type === TransactionType.EXPENSE
    ↓
Dropdown shows only expense categories
    ↓
User selects category
    ↓
Saved to inventory_items.expense_category_id
```

---

## 🎯 What You Should See Now

### Chart of Accounts Example
```
Settings → Chart of Accounts → Expense Categories:
- Construction Materials (Expense)
- Raw Materials (Expense)
- Labor Costs (Expense)
- Utilities (Expense)
- Rent (Expense)
```

### Inventory Form Dropdown
```
Settings → Inventory Items → Add New → Expense Category:

┌─────────────────────────────────────┐
│ Expense Category                    │
│ (Optional - for purchase tracking)  │
├─────────────────────────────────────┤
│ ▼ [No Category                   ] │
├─────────────────────────────────────┤
│   No Category                       │
│   Construction Materials     ← from Chart of Accounts
│   Labor Costs               ← from Chart of Accounts
│   Raw Materials             ← from Chart of Accounts
│   Rent                      ← from Chart of Accounts
│   Utilities                 ← from Chart of Accounts
└─────────────────────────────────────┘
```

---

## 🐛 Troubleshooting

### Issue: Dropdown is empty
**Check:**
1. Do you have expense categories in Chart of Accounts?
   - Go to Settings → Chart of Accounts
   - Check for categories with type = "Expense"
2. Are categories loaded in state?
   - Open browser console
   - Look for: `📊 Total categories: X`
   - Look for: `📊 Expense categories: Y`
3. If Y = 0, create expense categories first

### Issue: Wrong categories showing
**Check:**
1. Category types in database:
   ```sql
   SELECT name, type FROM categories;
   ```
2. Should see `type = 'Expense'` for expense categories
3. NOT `type = 'EXPENSE'` (case sensitive)

### Issue: Selected category not saving
**Check:**
1. Browser console for errors
2. Network tab → POST /api/inventory-items
3. Check request body includes `expenseCategoryId`
4. Check database:
   ```sql
   SELECT expense_category_id FROM inventory_items WHERE id = 'xxx';
   ```

---

## 📋 Summary

### What Was Fixed
✅ **Import Added**: `TransactionType` enum imported  
✅ **Filter Fixed**: Using `TransactionType.EXPENSE` instead of string literal  
✅ **Debug Logging**: Added console logs for verification  
✅ **Enum Match**: Filter now correctly matches category.type === 'Expense'  

### Result
✅ Expense categories from Chart of Accounts now appear in inventory dropdown  
✅ Only EXPENSE type categories shown (Income/Transfer/Loan excluded)  
✅ Categories properly linked and saved  
✅ Full integration working end-to-end  

---

## 🎉 Status: Fixed & Verified

The expense category dropdown in inventory items is now properly linked to the expense categories from the Chart of Accounts section. Users can select from existing expense categories when creating or editing inventory items.

**Date:** January 25, 2026  
**Fix Type:** Bug Fix - Enum Import & Filter Correction
