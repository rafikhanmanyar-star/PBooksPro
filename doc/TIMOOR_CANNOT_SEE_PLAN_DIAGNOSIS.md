# Timoor Cannot See Plan - Diagnosis Guide

## Issue Summary
- Hassan created plan and submitted for approval to Timoor ✅
- Plan stores: `approval_requested_to = user_1768807976723_craxbjm5q` (Timoor's ID) ✅
- `approval_requested_by = user_1768722096525_5q8io1wh1` (Hassan's ID) ✅
- **Timoor logs in "in a new system"** ❓
- **Timoor CANNOT see the plan** ❌

## 🔍 Critical Question

**"New system" means what exactly?**

### Option A: Same Tenant, Different Device ✅ Should Work
- Hassan and Timoor are in the **same organization/tenant**
- Timoor just logs in from a different computer/browser
- **Expected:** Timoor should see the plan
- **If not working:** ID mismatch or role issue

### Option B: Different Tenant ❌ WON'T Work
- Hassan is in **Tenant A**
- Timoor is in **Tenant B** (different organization)
- **Expected:** Timoor will NEVER see Hassan's plans
- **Reason:** Server filters by `tenant_id`

### Option C: Different Server/Database ❌ WON'T Work
- Hassan's system = Server A / Database A
- Timoor's system = Server B / Database B
- **Expected:** Plans are not shared between systems
- **Reason:** Completely separate databases

## 🧪 Diagnostic Steps

### Step 1: Check Tenant IDs

**On Hassan's system:**
```javascript
// In browser console
console.log('Tenant ID:', localStorage.getItem('tenant_id'));
```

**On Timoor's system:**
```javascript
// In browser console
console.log('Tenant ID:', localStorage.getItem('tenant_id'));
```

**Compare:** Do they match?
- ✅ **YES → Same tenant, proceed to Step 2**
- ❌ **NO → DIFFERENT TENANTS - This is the problem!**

### Step 2: Check Server Logs

**When Timoor loads the Marketing page**, check the server logs for:

```
[PLAN API] GET /installment-plans request: {
  tenantId: "...",
  currentUserId: "...",
  currentUsername: "...",
  userRole: "..."
}

[PLAN API] Executing query: {
  query: "...",
  params: [...],
  userRole: "...",
  isAdmin: true/false
}

[PLAN API] Query results: {
  totalPlans: X,
  pendingApprovalPlans: Y,
  plansForCurrentUser: Z
}
```

**Analysis:**
- `totalPlans: 0` → No plans in this tenant OR wrong tenant
- `pendingApprovalPlans: 0` → No pending plans (but might have other plans)
- `plansForCurrentUser: 0` → Matching failed

### Step 3: Verify Timoor's User Details

**Run this query on the database Timoor is connected to:**

```sql
-- Check Timoor's user account
SELECT id, username, name, role, tenant_id 
FROM users 
WHERE username = 'timoor' OR name ILIKE '%timoor%';
```

**Expected results:**
```
id: user_1768807976723_craxbjm5q  ← Should match what's in the plan
username: timoor
name: Timoor
role: Admin
tenant_id: [TENANT_ID]  ← Should match Hassan's tenant
```

**If results show:**
- **Different `id`** → Timoor has a different account (multiple accounts issue)
- **Different `tenant_id`** → Timoor is in a different organization
- **No results** → Timoor doesn't exist in this database

### Step 4: Check the Plan in Database

**On the database where Hassan created the plan:**

```sql
SELECT 
  id,
  tenant_id,
  status,
  user_id,
  approval_requested_by,
  approval_requested_to,
  created_at
FROM installment_plans 
WHERE id = 'plan_1769149471299'
  AND status = 'Pending Approval';
```

**Expected:**
```
tenant_id: [HASSAN'S_TENANT_ID]
approval_requested_to: user_1768807976723_craxbjm5q
```

**Compare with Timoor's login:**
- Does Timoor's `tenant_id` match this plan's `tenant_id`?
- Does Timoor's `user_id` match `approval_requested_to`?

## 🚨 Common Scenarios and Solutions

### Scenario 1: Different Tenants (Most Likely)

**Problem:**
```
Hassan's tenant_id: tenant_abc123
Timoor's tenant_id: tenant_xyz789
```

**Why it happens:**
- Hassan registered his own organization
- Timoor registered his own organization
- They are completely separate

**Solution:**
Hassan needs to **invite Timoor to his organization**:

1. Hassan logs in
2. Goes to Settings → Users
3. Clicks "Add User" or "Invite User"
4. Enters Timoor's email/username
5. Sets role to "Admin"
6. Timoor receives invitation
7. Timoor accepts and joins Hassan's organization

**OR** Timoor needs to:
1. Delete his own organization account
2. Log in using credentials for Hassan's organization

### Scenario 2: Multiple User Accounts

**Problem:**
```
Timoor has TWO accounts in the same tenant:
- Account A: user_1768807976723_craxbjm5q (correct one)
- Account B: user_xyz999888 (wrong one)

Hassan selected Account A
Timoor logs in with Account B
```

**Solution:**
```sql
-- Find all Timoor accounts
SELECT id, username, name, tenant_id, created_at 
FROM users 
WHERE (name ILIKE '%timoor%' OR username ILIKE '%timoor%')
  AND tenant_id = 'HASSAN_TENANT_ID'
ORDER BY created_at;

-- Delete duplicate accounts (keep the correct one)
DELETE FROM users WHERE id = 'user_xyz999888';

-- OR update the plan to use the correct account
UPDATE installment_plans 
SET approval_requested_to = 'TIMOOR_CORRECT_ID'
WHERE id = 'plan_1769149471299';
```

### Scenario 3: Case/Spelling Mismatch

**Problem:**
```
Database: approval_requested_to = 'user_1768807976723_craxbjm5q'
Timoor's actual ID = 'USER_1768807976723_CRAXBJM5Q' (uppercase)
```

**Solution:**
The server already handles this with lowercase comparison (lines 57-64), but verify:

```sql
-- Check exact ID
SELECT id FROM users WHERE LOWER(id) = LOWER('user_1768807976723_craxbjm5q');
```

### Scenario 4: Role Not Admin

**Problem:**
```
Timoor's role = 'User' (not 'Admin')
```

**Why it matters:**
- Non-admin users see filtered plans
- If matching fails, plan won't show

**Solution:**
```sql
-- Update Timoor's role
UPDATE users 
SET role = 'Admin' 
WHERE id = 'user_1768807976723_craxbjm5q';
```

### Scenario 5: Plan in Different Database

**Problem:**
- Hassan created plan in **Database A** (Production)
- Timoor logs in to **Database B** (Staging/Dev)

**Why it happens:**
- Multiple environments (dev, staging, production)
- Using different database connection strings

**Solution:**
- Ensure both are using the same environment
- Check environment variables:
  ```bash
  # On Hassan's system
  echo $DATABASE_URL
  
  # On Timoor's system
  echo $DATABASE_URL
  ```
- They should point to the same database

## 📊 Quick Diagnostic Checklist

Run these checks in order:

- [ ] **Check tenant IDs match** (localStorage in browser console)
- [ ] **Check server logs** when Timoor loads Marketing page
- [ ] **Verify Timoor exists** in the database with correct tenant_id
- [ ] **Verify plan exists** in the database Timoor is querying
- [ ] **Check Timoor's role** is "Admin"
- [ ] **Verify no duplicate accounts** for Timoor
- [ ] **Confirm same database/environment** (check DATABASE_URL)

## 🔧 Quick Fixes

### If Different Tenants:
**Hassan invites Timoor:**
1. Settings → Users → Add User
2. Enter: timoor (username)
3. Role: Admin
4. Save

### If Wrong User ID:
```sql
UPDATE installment_plans 
SET approval_requested_to = 'CORRECT_TIMOOR_ID'
WHERE id = 'plan_1769149471299';
```

### If Multiple Accounts:
```sql
-- Keep the one Hassan used, delete others
DELETE FROM users 
WHERE name = 'Timoor' 
  AND id != 'user_1768807976723_craxbjm5q';
```

## 🎯 Most Likely Root Cause

Based on "logs in in a new system", the most probable issue is:

**🏆 Different Tenants/Organizations**

Hassan and Timoor are registered as separate organizations. Plans are **NOT shared across tenants** by design (for security and data isolation).

**Fix:** Hassan needs to invite Timoor to his organization, OR they need to share the same tenant credentials.

## 📝 Next Steps

1. **Clarify what "new system" means**
2. **Check tenant IDs** (Step 1 above)
3. **Check server logs** when Timoor loads the page
4. **Share the results** from the diagnostic queries

This will immediately reveal the issue!
