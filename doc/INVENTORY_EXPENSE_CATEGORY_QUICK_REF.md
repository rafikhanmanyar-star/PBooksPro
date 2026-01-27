# Quick Reference: Expense Category Field in Inventory Items

## 📋 At a Glance

**Field Name**: Expense Category  
**Database Column**: `expense_category_id`  
**Type**: Optional (nullable)  
**Purpose**: Link inventory items to expense categories for future purchase tracking  
**UI Location**: Settings → Inventory Items → Add/Edit Form  

---

## 🗂️ Database Structure

```
inventory_items
├── id                      TEXT PRIMARY KEY
├── tenant_id               TEXT NOT NULL
├── user_id                 TEXT
├── name                    TEXT NOT NULL
├── parent_id               TEXT                    (FK → inventory_items)
├── expense_category_id     TEXT                    ← NEW (FK → categories)
├── unit_type               TEXT NOT NULL
├── price_per_unit          DECIMAL(15, 2)
├── description             TEXT
├── created_at              TIMESTAMP
└── updated_at              TIMESTAMP
```

---

## 🔌 API Quick Reference

### Create/Update Item
```http
POST /api/inventory-items
Content-Type: application/json

{
  "name": "Wood Planks",
  "expenseCategoryId": "cat_expense_123",  ← NEW (optional)
  "unitType": "LENGTH_FEET",
  "pricePerUnit": 5.50
}
```

### Response Includes Category Name
```json
{
  "id": "inv_item_123",
  "name": "Wood Planks",
  "expense_category_id": "cat_expense_123",
  "category_name": "Construction Materials",  ← NEW (populated)
  "unit_type": "LENGTH_FEET",
  "price_per_unit": 5.50
}
```

---

## 🎨 UI Form Order

```
1. Inventory Name *           [Required text input]
2. Parent Item                [Optional dropdown - existing items]
3. Expense Category           [Optional dropdown - expense categories only] ← NEW
4. Unit Type *                [Required radio buttons - 4 options]
5. Price per Unit *           [Required number input]
6. Description                [Optional textarea]
```

---

## 🔍 Filter Logic

**Expense Categories Only:**
```typescript
const expenseCategories = state.categories
  .filter(cat => cat.type === 'EXPENSE')  // ← Only EXPENSE type
  .sort((a, b) => a.name.localeCompare(b.name));
```

**Why?** Purchase transactions are expenses, not income.

---

## 📊 Table Display

**New Column Position:**

```
| Name | Expense Category | Unit Type | Price/Unit | Description |
|------|------------------|-----------|------------|-------------|
| Wood | Materials        | Length/Ft | $5.50      | Pine wood   |
       ↑ NEW COLUMN
```

---

## 🚀 Future Integration

### My Shop Module (To Be Developed)

**When user purchases inventory item:**

```typescript
// Automatic expense recording
if (item.expenseCategoryId) {
  createTransaction({
    amount: item.pricePerUnit * quantity,
    categoryId: item.expenseCategoryId,  // ← Uses linked category
    type: 'EXPENSE',
    description: `Purchase: ${item.name}`
  });
}
```

**Result:** No manual category selection needed during purchase!

---

## ⚙️ Key Features

✅ **Optional Field** - Not required, can be null  
✅ **Expense Only** - Dropdown filters to EXPENSE type categories  
✅ **Foreign Key** - Links to categories table  
✅ **ON DELETE SET NULL** - Item preserved if category deleted  
✅ **Indexed** - Fast lookups for category-based queries  
✅ **Synced** - Full offline/online synchronization  
✅ **Helper Text** - Shows "Purchases will be recorded under: [Category]"  

---

## 🔄 Migration Command

```bash
# For existing installations
psql -h [host] -U [user] -d [database] \
  -f server/migrations/add-expense-category-to-inventory-items.sql
```

---

## ✅ Testing Quick Checks

1. **Form**: Does expense category dropdown appear after parent field?
2. **Options**: Does dropdown only show EXPENSE type categories?
3. **Save**: Does selected category save correctly?
4. **Table**: Does category name appear in table column?
5. **Search**: Can you search/filter by category name?
6. **Delete**: If category deleted, is item preserved (category set to null)?

---

## 📞 Common Questions

### Q: Is expense category required?
**A:** No, it's optional. Items can be created without a category.

### Q: What happens if I delete the category?
**A:** The inventory item is preserved, but the category link is removed (set to NULL).

### Q: Can I use income categories?
**A:** No, the dropdown only shows EXPENSE type categories (since purchases are expenses).

### Q: Where will this be used?
**A:** In the future "My Shop" module for automatic expense tracking during purchases.

### Q: Can I change the category later?
**A:** Yes, edit the item and select a different category from the dropdown.

### Q: Does this affect existing items?
**A:** No, existing items continue to work. The field is optional and defaults to null.

---

## 🎯 Success Criteria

✅ Expense category dropdown appears in form  
✅ Only EXPENSE categories shown  
✅ Selected category saves to database  
✅ Category name displays in table  
✅ Optional field (not required)  
✅ Items work with or without category  
✅ Ready for future My Shop integration  

---

**Status:** ✅ Complete & Production Ready  
**Version:** 1.0  
**Date:** January 25, 2026
