# Marketing Approval Workflow - Quick Diagnostic Checklist

## 🚀 Quick Start (5 Minutes)

Follow these steps to immediately identify the issue:

### Step 1: Test as User A (Plan Creator)
- [ ] Log in as User A
- [ ] Go to Marketing section
- [ ] Create or select a plan
- [ ] Click "Submit for Approval"
- [ ] **IMPORTANT:** Open browser console (Press F12)
- [ ] Look for this log:
  ```
  [APPROVAL DEBUG] Approvers list:
  ```
- [ ] **Question: Is User B in the list?**
  - ✅ YES → Continue to Step 2
  - ❌ NO → **ISSUE FOUND:** See Fix #1 below

### Step 2: Verify User B's Role in Database
Run this SQL query:
```sql
SELECT id, username, name, role FROM users 
WHERE username = 'USER_B_USERNAME' OR name = 'USER_B_NAME';
```

- [ ] **Question: Does the role say "Admin"?**
  - ✅ YES → Continue to Step 3
  - ❌ NO → **ISSUE FOUND:** See Fix #2 below

### Step 3: Submit the Plan
- [ ] Select User B from the dropdown
- [ ] Click "Send for Approval"
- [ ] Note the exact text of the user shown in the dropdown
- [ ] Continue to Step 4

### Step 4: Check Database After Submission
Run this SQL query:
```sql
SELECT 
  id, 
  status, 
  approval_requested_by, 
  approval_requested_to,
  user_id
FROM installment_plans 
WHERE status = 'Pending Approval'
ORDER BY created_at DESC 
LIMIT 1;
```

- [ ] Copy the value of `approval_requested_to`: _________________
- [ ] Continue to Step 5

### Step 5: Test as User B (Approver)
- [ ] Log in as User B (in a different browser or incognito mode)
- [ ] **BEFORE** navigating anywhere, open browser console (F12)
- [ ] Go to Marketing section
- [ ] Look for these logs in the console:
  ```
  [NOTIFICATION DEBUG] Total notifications:
  [APPROVAL DEBUG] Active plan approval state:
  ```

### Step 6: Check the Debug Panel
- [ ] In the Marketing section, find and click on the plan
- [ ] Scroll down to find the gray "Debug Approval" panel
- [ ] Fill in these values:

```
Current User ID: _________________
Approver Value (requested_to): _________________
isPendingApproval: _________________
isApproverForSelectedPlan: _________________
```

### Step 7: Compare Values

**CRITICAL CHECK:**
- [ ] Does `Approver Value (requested_to)` EXACTLY match `Current User ID`?
  - ✅ YES → **Something else is wrong** - See Advanced Troubleshooting
  - ❌ NO → **ISSUE FOUND:** See Fix #3 below

---

## 🔧 Common Fixes

### Fix #1: User B Not in Approvers List

**Cause:** User B's role is not "Admin" OR the role has different casing

**Solution:**
1. Check User B's role in database:
   ```sql
   SELECT role FROM users WHERE username = 'user_b_username';
   ```

2. If the role is NOT "Admin", either:
   - **Option A:** Change User B's role to "Admin":
     ```sql
     UPDATE users SET role = 'Admin' WHERE username = 'user_b_username';
     ```
   
   - **Option B:** Modify the approvers filter to include other roles:
     In `MarketingPage.tsx` line ~350, change:
     ```javascript
     .filter(user => user.role && user.role.toLowerCase() === 'admin')
     ```
     To:
     ```javascript
     .filter(user => user.role && ['admin', 'owner', 'manager'].includes(user.role.toLowerCase()))
     ```

### Fix #2: User B's Role is Incorrect

**Cause:** User B doesn't have admin rights in the database

**Solution:**
```sql
UPDATE users 
SET role = 'Admin' 
WHERE id = 'USER_B_ID';
```

Then have User B refresh the page.

### Fix #3: ID Mismatch

**Cause:** The `approval_requested_to` field contains a different value than User B's actual ID

**Possible scenarios:**

#### Scenario A: Field contains username instead of ID
```
approval_requested_to: "user_b"
Current User ID: "user_abc123def"
```

**Why this happens:** The dropdown might be using username instead of ID

**Solution:** Check `MarketingPage.tsx` line ~351:
```javascript
.map(user => ({ id: user.id, name: user.name || user.username }))
```
Make sure it's using `user.id`, not `user.username`

#### Scenario B: Server normalization failed
```
approval_requested_to: "User B Name"
Current User ID: "user_abc123def"
```

**Why this happens:** Server couldn't find the user to normalize the ID

**Solution:** Check server logs for warnings like:
```
Failed to normalize approval_requested_to value
```

If found, verify the user exists in the database and the tenant_id matches.

#### Scenario C: Wrong user was selected
```
approval_requested_to: "user_xyz789"  (User C's ID)
Current User ID: "user_abc123"  (User B's ID)
```

**Why this happens:** User A selected the wrong person from the dropdown

**Solution:** Delete the plan and create a new one, making sure to select the correct user.

### Fix #4: Plan Status is Not "Pending Approval"

**Cause:** The plan wasn't actually saved with the correct status

**Check:**
```sql
SELECT id, status FROM installment_plans WHERE id = 'PLAN_ID';
```

**Solution:**
If status is "Draft", manually update it:
```sql
UPDATE installment_plans 
SET 
  status = 'Pending Approval',
  approval_requested_by = 'USER_A_ID',
  approval_requested_to = 'USER_B_ID',
  approval_requested_at = NOW()
WHERE id = 'PLAN_ID';
```

Then have User B refresh the page.

---

## 🎯 Expected Results (When Working)

### Console Logs - User A:
```javascript
[APPROVAL DEBUG] Approvers list: {
  totalUsers: 5,
  approversCount: 2,  // Should be > 0
  approvers: [
    { id: "user_abc123", name: "User B" },  // User B should be here
    { id: "user_xyz789", name: "User C" }
  ]
}
```

### Console Logs - User B:
```javascript
[NOTIFICATION DEBUG] Total notifications: {
  count: 1,  // Should be > 0
  pendingApprovalPlans: [
    { 
      id: "plan_123", 
      approvalRequestedToId: "user_abc123",  // Should match User B's ID
      status: "Pending Approval" 
    }
  ]
}

[APPROVAL DEBUG] Active plan approval state: {
  planId: "plan_123",
  status: "Pending Approval",
  approvalRequestedToId: "user_abc123",  // User B's ID
  currentUserId: "user_abc123",  // User B's ID - SHOULD MATCH!
  isApproverForSelectedPlan: true  // Should be TRUE
}
```

### Debug Panel - User B:
```
isPendingApproval: true
Approver Value (requested_to): user_abc123
Current User ID: user_abc123  ← THESE SHOULD MATCH!
isApproverForSelectedPlan: true
```

### UI - User B:
- [ ] Bell icon shows red badge with "1"
- [ ] Clicking bell shows "Plan approval requested"
- [ ] Plan list shows "ACTION REQUIRED: WAITING FOR YOUR APPROVAL"
- [ ] Opening plan shows green "Approve" button
- [ ] Opening plan shows red "Reject" button
- [ ] Blue info box says "Awaiting approval from User B. Requested by User A."

---

## 📞 Still Not Working?

If you've checked everything above and it's still not working, collect this information:

1. **Screenshot of debug panel** (the gray box)
2. **Console logs** (all lines with `[APPROVAL DEBUG]` and `[NOTIFICATION DEBUG]`)
3. **Database query results:**
   ```sql
   -- The plan
   SELECT * FROM installment_plans WHERE id = 'PLAN_ID';
   
   -- User A
   SELECT id, username, name, role FROM users WHERE username = 'USER_A_USERNAME';
   
   -- User B
   SELECT id, username, name, role FROM users WHERE username = 'USER_B_USERNAME';
   ```
4. **User A's username:** _________________
5. **User B's username:** _________________
6. **Plan ID:** _________________

Share this information for further debugging.

---

## ⏱️ Estimated Time
- Quick check: **5 minutes**
- With fixes: **10-15 minutes**
- Full debugging: **20-30 minutes**
