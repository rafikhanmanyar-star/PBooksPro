# Marketing Plan Approval Workflow - Debug Guide

## Issue Summary
**Reported Issues:**
1. User B (admin) does not see bell icon notifications when User A submits a plan for approval
2. User B does not see Approve/Reject buttons when viewing the plan

## Investigation Results

### Architecture Overview

The approval workflow involves three main components:

1. **MarketingPage.tsx** - Plan creation and approval UI
2. **Header.tsx** - Bell icon notifications
3. **Server API** (`server/api/routes/installmentPlans.ts`) - Data persistence

### How It Should Work

#### 1. Plan Submission Flow
```
User A creates plan → Clicks "Submit for Approval" → Selects User B from dropdown → 
Server normalizes User B's ID → Saves to database with:
  - status: "Pending Approval"
  - approval_requested_by: User A's ID
  - approval_requested_to: User B's ID
  - approval_requested_at: timestamp
```

#### 2. Notification Display Logic (Header.tsx)
```javascript
// Lines 81-90
if (isPendingApproval && 
    (plan.approvalRequestedToId === currentUserId || 
     isMatchingCurrentUser(plan.approvalRequestedToId))) {
    // Show notification
}
```

The `isMatchingCurrentUser` function checks if the `approvalRequestedToId` matches any of:
- Current user's ID
- Current user's username
- Current user's name

#### 3. Approve/Reject Button Logic (MarketingPage.tsx)
```javascript
// Line 388
const isApproverForSelectedPlan = isPendingApproval && isMatchingUser(effectiveApprovalRequestedToId);
```

Same matching logic as notifications.

### Database Schema

The `installment_plans` table has these approval fields:
- `approval_requested_by` (TEXT) - ID of user who requested approval
- `approval_requested_to` (TEXT) - ID of user assigned to approve
- `approval_requested_at` (TEXT) - Timestamp
- `approval_reviewed_by` (TEXT) - ID of user who reviewed
- `approval_reviewed_at` (TEXT) - Timestamp

### Server-Side Normalization

The server normalizes the `approvalRequestedToId` before saving (lines 218-232):

```javascript
// Tries to find the user by ID, username, or name
// If found, uses their actual ID from the database
const approverRows = await db.query(
  'SELECT id FROM users WHERE tenant_id = $1 AND (id = $2 OR username = $2 OR name = $2) LIMIT 1',
  [req.tenantId, normalizedApprovalRequestedToId]
);
```

### Privacy Filter (Important!)

For non-admin users, the server filters plans (lines 44-67):
- Only returns plans where the user is:
  - The creator (`user_id` matches)
  - The requester (`approval_requested_by` matches)
  - The approver (`approval_requested_to` matches)

**If User B is Admin:** They should see ALL plans regardless of this filter.
**If User B is NOT Admin:** They must be explicitly assigned as approver.

## Debugging Enhancements Added

### 1. Enhanced Debug Panel (MarketingPage.tsx)

I've added a comprehensive debug panel that shows:
- Plan status and ID
- Whether plan is pending approval
- **Approver matching details:**
  - The `approvalRequestedToId` value from the plan
  - Current user's ID, username, name, and role
  - Whether the values match
- **Active plan data:** Direct database values

### 2. Console Logging

**MarketingPage.tsx:**
- Logs matching logic details whenever `isMatchingUser()` is called
- Logs complete approval state when a plan is selected

**Header.tsx:**
- Logs when approval notifications are found
- Logs total notification count and pending approval plans
- Shows direct vs fuzzy matching results

## Testing Steps

### Step 1: Reproduce the Issue

1. **As User A:**
   - Log in to the system
   - Navigate to Marketing section
   - Create a new plan
   - Click "Submit for Approval"
   - Select User B from the dropdown
   - Submit

2. **As User B:**
   - Log in to the system
   - Open browser console (F12)
   - Navigate to Marketing section
   - Check the console logs for `[NOTIFICATION DEBUG]` and `[APPROVAL DEBUG]`

### Step 2: Check the Debug Panel

When viewing the plan as User B, look at the debug panel in the Marketing page:

**Expected values (if working correctly):**
```
isPendingApproval: true
Approver Value (requested_to): [User B's ID]
Current User ID: [User B's ID]  ← THESE SHOULD MATCH!
isApproverForSelectedPlan: true
```

**If values DON'T match, possible causes:**
1. Different ID formats (e.g., "user_123" vs "123")
2. Wrong user selected from dropdown
3. Database sync issue

### Step 3: Check Console Logs

Look for these log entries:

#### In MarketingPage Console:
```javascript
[APPROVAL DEBUG] Active plan approval state: {
  planId: "...",
  status: "Pending Approval",
  approvalRequestedToId: "...",  ← User B's ID
  currentUserId: "...",           ← Should match above
  isApproverForSelectedPlan: true or false
}

[APPROVAL DEBUG] Matching check: {
  value: "...",
  normalizedValue: "...",
  candidates: [...],  ← Should include current user's ID
  matches: true or false
}
```

#### In Header Console (for notifications):
```javascript
[NOTIFICATION DEBUG] Total notifications: {
  count: 1,  ← Should be at least 1
  currentUserId: "...",
  pendingApprovalPlans: [...]
}

[NOTIFICATION DEBUG] Found approval notification: {
  planId: "...",
  approvalRequestedToId: "...",
  currentUserId: "...",
  directMatch: true or false,
  fuzzyMatch: true or false
}
```

### Step 4: Verify Database

Check the database directly:

```sql
SELECT 
  id, 
  status, 
  approval_requested_by, 
  approval_requested_to,
  approval_requested_at,
  user_id
FROM installment_plans 
WHERE status = 'Pending Approval'
ORDER BY created_at DESC 
LIMIT 5;
```

**Then check User B's ID:**
```sql
SELECT id, username, name, role 
FROM users 
WHERE username = '[User B username]' OR name = '[User B name]';
```

Compare the IDs - they should match EXACTLY.

## Common Issues and Solutions

### Issue 1: ID Format Mismatch
**Symptom:** Debug panel shows different ID formats
```
Approver Value: "admin"
Current User ID: "user_abc123"
```

**Solution:** The approver dropdown is using `username` or `name` instead of `id`. Check line 351 in MarketingPage.tsx:
```javascript
.map(user => ({ id: user.id, name: user.name || user.username }))
```
Make sure `user.id` is the actual database ID.

### Issue 2: User Not in Approvers List
**Symptom:** User B not shown in dropdown when User A tries to submit

**Solution:** Check User B's role. The approvers filter (line 350) only includes users with `role === 'Admin'`:
```javascript
.filter(user => user.role === 'Admin')
```

If User B should be an approver but isn't an Admin, either:
- Change their role to Admin, OR
- Modify the filter to include other roles

### Issue 3: orgUsers Not Loading
**Symptom:** Approvers list is empty or showing local users only

**Solution:** Check if the API endpoint `/api/users` is working:
```javascript
// In browser console:
fetch('/api/users', {
  headers: { 'Authorization': 'Bearer YOUR_TOKEN' }
}).then(r => r.json()).then(console.log)
```

### Issue 4: Plan Data Not Syncing
**Symptom:** Plan shows "Pending Approval" status but approval fields are empty

**Solution:** 
1. Check WebSocket connection (bottom of the screen)
2. Refresh the page to force data reload
3. Check server logs for save errors

### Issue 5: Case Sensitivity
**Symptom:** IDs look the same but don't match

**Solution:** The matching logic converts to lowercase, so this shouldn't be an issue. But check for extra whitespace:
```javascript
// In console:
console.log(`"${approvalRequestedToId}"`, `"${currentUserId}"`);
// Look for extra spaces or special characters
```

## Quick Fix Checklist

Run through these checks:

- [ ] User B has `role = 'Admin'` in the database
- [ ] User B's ID in the database matches what's stored in `approval_requested_to`
- [ ] The plan status is exactly `'Pending Approval'` (case-sensitive)
- [ ] User B can see the plan in the list (privacy filter allows it)
- [ ] The page has loaded fresh data (try hard refresh: Ctrl+Shift+R)
- [ ] WebSocket connection is active (check indicators in header)
- [ ] Console shows no JavaScript errors

## API Endpoint for Manual Testing

You can test the approval workflow manually using the API:

### 1. Get all plans
```bash
GET /api/installment-plans
```

### 2. Submit a plan for approval
```bash
POST /api/installment-plans
Body: {
  "id": "existing_plan_id",
  "status": "Pending Approval",
  "approvalRequestedById": "user_a_id",
  "approvalRequestedToId": "user_b_id",
  "approvalRequestedAt": "2026-01-22T10:00:00Z",
  ... (other plan fields)
}
```

### 3. Approve a plan
```bash
POST /api/installment-plans
Body: {
  "id": "existing_plan_id",
  "status": "Approved",
  "approvalReviewedById": "user_b_id",
  "approvalReviewedAt": "2026-01-22T11:00:00Z",
  ... (other plan fields)
}
```

## Next Steps

1. **Test with the enhanced debug panel** - The new debug information should immediately reveal the mismatch
2. **Share console logs** - Copy the `[APPROVAL DEBUG]` and `[NOTIFICATION DEBUG]` logs
3. **Check database** - Verify the IDs are stored correctly
4. **Verify user roles** - Ensure User B is an Admin

## File References

- **MarketingPage.tsx** - Main approval workflow UI
  - Line 350: Approvers filter
  - Line 388: `isApproverForSelectedPlan` calculation
  - Line 1287-1304: Approve/Reject buttons
  - Line 1337+: Debug panel
  
- **Header.tsx** - Notification logic
  - Line 31-113: `notifications` calculation
  - Line 81: Approval notification condition
  
- **server/api/routes/installmentPlans.ts** - Server API
  - Line 218-232: ID normalization
  - Line 340-344: Approval field saving
  - Line 109-113: Approval field retrieval

## Contact

If you need further assistance, please provide:
1. Screenshots of the debug panel
2. Console logs with `[APPROVAL DEBUG]` and `[NOTIFICATION DEBUG]`
3. Database query results
4. User A and User B's usernames/IDs
