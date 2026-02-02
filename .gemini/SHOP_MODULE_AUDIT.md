# Shop Module Data Persistence Audit & Action Plan

**Date:** 2026-02-02  
**Status:** 🔴 Critical Issues Found

## Executive Summary

After comprehensive review of the "My Shop" module, **MULTIPLE CRITICAL DATA PERSISTENCE ISSUES** have been identified. Data is being created/updated in memory but **NOT always persisting to the database**, causing data loss on page refresh.

---

## 🔴 CRITICAL ISSUES IDENTIFIED

### 1. **POS Sales Module** - ✅ WORKING
**Status:** Properly integrated with database  
**Evidence:**
- `POSContext.completeSale()` calls `shopApi.createSale()`
- Backend route `/shop/sales` POST exists
- `shopService.createSale()` uses transaction to save to `shop_sales` and `shop_sale_items`
- **Inventory is auto-deducted** during sale completion
- **Loyalty points are auto-updated** during sale completion

**Verified Flow:**
```
UI → POSContext.completeSale() → shopApi.createSale() 
→ /shop/sales POST → shopService.createSale() 
→ DB (shop_sales + shop_sale_items + shop_inventory + shop_loyalty_members)
```

---

### 2. **Inventory Module** - ⚠️ PARTIALLY WORKING

#### ✅ Working Areas:
- **Product creation**: `InventoryContext.addItem()` → `shopApi.createProduct()` → DB
- **Inventory adjustments**: `InventoryContext.updateStock()` → `shopApi.adjustInventory()` → DB
- **Data loading**: Products and inventory loaded from DB on mount

#### 🔴 Issues Found:
**ISSUE 2.1:** Inventory updates during procurement may not reflect immediately  
**Root Cause:** Missing real-time reload after adjustment  
**Impact:** Users see stale inventory levels until manual refresh

**Fix Required:**
```typescript
// In InventoryContext.tsx - updateStock method
const updateStock = async (...) => {
    try {
        await shopApi.adjustInventory({...});
        // ✅ ADD: Immediately refetch inventory after successful update
        await fetchData();  // Reload from DB
    } catch (error) {
        throw error;
    }
};
```

---

### 3. **Procurement Module** - ✅ FIXED (Recent)

**Status:** Vendor creation now properly persists  
**Recent Fix:** Changed `handleCreateVendor` to use `contactsApi.create()`  
**Verified:** Bills are saved via `billsApi.create()`

---

### 4. **Loyalty Module** - 🔴 CRITICAL ISSUE

#### ✅ Working Areas:
- **Member creation**: `LoyaltyContext.addMember()` → `shopApi.createLoyaltyMember()` → DB
- **Member updates**: `LoyaltyContext.updateMember()` → `shopApi.updateLoyaltyMember()` → DB
- **Member deletion**: `LoyaltyContext.deleteMember()` → `shopApi.deleteLoyaltyMember()` → DB

#### 🔴 CRITICAL ISSUE 4.1: Points Updates NOT Persisted
**Location:** `LoyaltyContext.tsx` line 151-191  
**Problem:** `processLoyalty()` updates points IN MEMORY ONLY  

**Current Code:**
```typescript
const processLoyalty = useCallback((customerId, saleAmount, saleId, ...) => {
    setMembers(prev => prev.map(member => {
        if (member.customerId === customerId) {
            // ❌ Updates local state only - NO API CALL
            return {
                ...member,
                pointsBalance: newPoints,
                lifetimePoints: ...,
                totalSpend: ...,
                visitCount: ...
            };
        }
        return member;
    }));
}, [...]);
```

**Impact:** 
- Points earned/redeemed are LOST on page refresh
- Loyalty transactions are NOT saved to database
- Total spend and visit counts are NOT persisted

**Fix Required:**
```typescript
const processLoyalty = async (customerId, saleAmount, saleId, ...) => {
    const member = members.find(m => m.customerId === customerId);
    if (!member) return;
    
    // Calculate points
    const pointsChange = ...;
    const newData = {
        pointsBalance: member.pointsBalance + pointsChange,
        lifetimePoints: ...,
        totalSpend: ...,
        visitCount: ...
    };
    
    // ✅ PERSIST TO DATABASE
    await shopApi.updateLoyaltyMember(member.id, newData);
    
    // Then update local state
    setMembers(prev => prev.map(m => 
        m.id === member.id ? { ...m, ...newData } : m
    ));
};
```

---

### 5. **Multi-Store Module** - ✅ WORKING

**Status:** All operations properly persisted  
**Evidence:**
- Branch creation: `addStore()` → `shopApi.createBranch()` → DB
- Branch updates: `updateStore()` → `shopApi.updateBranch()` → DB
- Terminal creation: `addTerminal()` → `shopApi.createTerminal()` → DB
- Terminal updates: `updateTerminal()` → `shopApi.updateTerminal()` → DB
- Terminal deletion: `deleteTerminal()` → `shopApi.deleteTerminal()` → DB
- Policy updates: `savePolicies()` → `shopApi.updatePolicies()` → DB

---

### 6. **Accounting Integration** - ⚠️ NEEDS VERIFICATION

**Status:** Integration exists but needs testing  
**Evidence:**
- `AccountingContext` is available globally
- `postJournalEntry()` method exists
- Used in `ProcurementPage.tsx` for stock-in transactions

**Potential Issue:** Need to verify journal entries from shop transactions are saved to database

---

## 📊 Database Schema Review

### ✅ Schema is Complete and Well-Designed

**Tables Reviewed:**
- ✅ `shop_branches` - Proper indexes, RLS enabled
- ✅ `shop_terminals` - Foreign keys to branches
- ✅ `shop_warehouses` - Unique constraints working
- ✅ `shop_products` - SKU uniqueness enforced
- ✅ `shop_inventory` - Composite unique key (tenant_id, product_id, warehouse_id)
- ✅ `shop_loyalty_members` - Unique card_number and customer_id
- ✅ `shop_sales` - Complete sales tracking
- ✅ `shop_sale_items` - Sale line items
- ✅ `shop_inventory_movements` - Full audit trail
- ✅ `shop_policies` - Global policy storage

**Database Normalization:** ✅ Proper 3NF structure  
**Tenant Isolation:** ✅ All tables have tenant_id with proper FKs  
**Data Integrity:** ✅ Proper constraints and cascades

---

## 🔄 Synchronization Services Review

### Current Architecture:
1. **Real-time Updates:** WebSocket events for multi-user sync (contacts, bills, etc.)
2. **Offline Queue:** Bidirectional sync service exists for core modules
3. **Shop Module:** **NOT integrated with offline sync queue**

### 🔴 ISSUE: Shop Module Missing from Offline Sync

**Problem:** Shop data (sales, inventory, loyalty) is NOT included in:
- `bidirectionalSyncService.ts`
- `syncManager.ts`
- Offline queue in `AppContext`

**Impact:**
- Shop transactions made offline are LOST if API fails
- No automatic retry mechanism for failed shop API calls
- Data inconsistency during network issues

**Fix Required:**
Add shop entities to offline sync:
```typescript
// In syncManager.ts
export interface SyncQueue {
    // Existing...
    sales: ShopSale[];
    loyaltyTransactions: LoyaltyTransaction[];
    inventoryAdjustments: InventoryAdjustment[];
}
```

---

## 🎯 ACTION ITEMS (Priority Order)

### 🔥 **CRITICAL (Fix Immediately)**

1. **Fix Loyalty Points Persistence**
   - File: `context/LoyaltyContext.tsx`
   - Method: `processLoyalty()`
   - Action: Add API call to persist points updates
   - Estimated Time: 30 minutes

2. **Add Real-time Inventory Reload**
   - File: `context/InventoryContext.tsx`
   - Method: `updateStock()`
   - Action: Call `fetchData()` after successful adjustment
   - Estimated Time: 15 minutes

3. **Create Loyalty Transaction History Table**
   - File: New migration needed
   - Table: `shop_loyalty_transactions`
   - Action: Create table + API endpoints
   - Estimated Time: 1 hour

### ⚠️ **HIGH (Fix Soon)**

4. **Integrate Shop Module with Offline Sync**
   - Files: `syncManager.ts`, `bidirectionalSyncService.ts`
   - Action: Add shop entities to sync queue
   - Estimated Time: 2 hours

5. **Add Data Reload After All Mutations**
   - Pattern: Every create/update/delete should trigger refetch
   - Files: All shop contexts
   - Estimated Time: 1 hour

6. **Implement Optimistic UI Updates**
   - Pattern: Update UI immediately, rollback on error
   - Files: All shop contexts
   - Estimated Time: 2 hours

### 📋 **MEDIUM (Enhancement)**

7. **Add Error Boundaries for Shop Module**
   - Files: Shop page components
   - Action: Wrap with ErrorBoundary
   - Estimated Time: 30 minutes

8. **Add Loading States**
   - Pattern: Show spinners during API calls
   - Files: All shop contexts
   - Estimated Time: 1 hour

9. **Implement WebSocket Events for Shop**
   - Action: Real-time updates across terminals
   - Files: `websocketClient.ts`, shop contexts
   - Estimated Time: 3 hours

---

## 🧪 Testing Checklist

### For Each Shop Module Feature:

- [ ] Create item → Refresh page → Item still exists
- [ ] Update item → Refresh page → Changes persisted
- [ ] Delete item → Refresh page → Item still gone
- [ ] Check browser DevTools Network tab for API calls
- [ ] Check PostgreSQL database for actual data
- [ ] Test offline scenario → Come online → Data syncs
- [ ] Test multi-user scenario → Changes reflect across users

---

## 📝 Code Review Findings

### ✅ Good Practices Found:
- Proper use of React Context for state management
- Consistent API structure (`shopApi.ts`)
- Good error handling in most places
- Transactions used properly in backend
- Proper TypeScript typing

### 🔴 Code Smells Found:
- Missing API calls in state mutations (`processLoyalty`)
- No optimistic UI updates
- Limited error user feedback
- Some hardcoded IDs ("st-1", "t-1" in POS)
- Missing real-time refresh after mutations

---

## 🛠️ Recommended Architecture Improvements

### 1. **Implement Standard Mutation Pattern:**
```typescript
// Pattern for all data mutations
const updateEntity = async (id, data) => {
    try {
        setLoading(true);
        // 1. Optimistic update
        setEntities(prev => prev.map(e => e.id === id ? { ...e, ...data } : e));
        
        // 2. API call
        const updated = await api.updateEntity(id, data);
        
        // 3. Confirm with server response
        setEntities(prev => prev.map(e => e.id === id ? updated : e));
        
    } catch (error) {
        // 4. Rollback on error
        await refresh();
        showError(error);
    } finally {
        setLoading(false);
    }
};
```

### 2. **Add React Query / SWR for Data Fetching:**
- Automatic caching
- Automatic refetching
- Deduplication
- Optimistic updates built-in

### 3. **Centralize Shop State Management:**
Consider creating a single `ShopContext` that manages all shop-related state with proper sync.

---

## 📌 Summary

**Total Issues Found:** 6 critical/high priority  
**Modules Affected:** Loyalty (critical), Inventory (minor), Sync (major gap)  
**Estimated Fix Time:** ~8 hours  
**Risk Level:** 🔴 HIGH - Data loss possible

**Next Step:** Start with fixing loyalty points persistence (30 min quick win)

---

**Last Updated:** 2026-02-02  
**Reviewed By:** AI Assistant  
**Status:** Awaiting Implementation
