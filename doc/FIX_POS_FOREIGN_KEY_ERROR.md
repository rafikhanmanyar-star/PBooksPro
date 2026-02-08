# Fix: POS Sale Foreign Key Constraint Error

## Problem
The POS system was throwing a foreign key constraint error when completing sales:
```
Error completing sale: insert or update on table "shop_sales" violates 
foreign key constraint "shop_sales_branch_id_fkey"
```

## Root Cause
The `POSContext.tsx` was hardcoding `branchId: 'st-1'` and `terminalId: 't-1'`, but these records didn't exist in the `shop_branches` and `shop_terminals` tables.

## Solution Applied

### 1. **Immediate Fix** ✅
Updated `POSContext.tsx` to use `null` for `branchId` and `terminalId` since these fields are nullable in the database schema.

**File**: `context/POSContext.tsx` (lines 318-319)
```typescript
branchId: null, // TODO: Set up branch configuration
terminalId: null, // TODO: Set up terminal configuration
```

### 2. **Proper Setup** (Optional)
Created a SQL script `CREATE_DEFAULT_SHOP_BRANCH.sql` to set up default branch and terminal records.

**Steps to use**:
1. Open `CREATE_DEFAULT_SHOP_BRANCH.sql` in DBeaver
2. Replace `'your-tenant-id'` with your actual tenant ID (check the `tenants` table)
3. Execute the script
4. Update `POSContext.tsx` to use the created IDs:
   ```typescript
   branchId: 'default-branch',
   terminalId: 'default-terminal',
   ```

## Testing
Try completing a sale again - the foreign key error should be resolved.

## Future Enhancement
Consider implementing a branch/terminal selection UI in the POS system to allow users to select their active branch and terminal at login.
