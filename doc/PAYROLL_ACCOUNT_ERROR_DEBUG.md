# Payroll Account Error Debugging Guide

## Issue
"Payment account not found" error when trying to pay a payslip, even though an account is selected in the UI.

## Root Cause Analysis

### Possible Causes:
1. **Account ID Mismatch**: The account ID in the frontend doesn't match the database ID
2. **Tenant Mismatch**: Account belongs to a different tenant
3. **Account Not Loaded**: Account exists but wasn't loaded into the frontend state
4. **ID Format Issue**: Account ID has whitespace or type mismatch (string vs number)

## Debugging Steps

### 1. Check Browser Console Logs
When selecting an account, look for:
```
🔵 ComboBox onSelect called with item: {...}
🔵 Original account found: {...}
🔵 Setting selectedAccountId to: [account-id]
```

When clicking "Confirm Payment", look for:
```
📤 Sending payment request: { accountId: "...", ... }
💰 payPayslip API call: { payslipId: "...", paymentData: {...} }
```

### 2. Check Server Logs
Look for:
```
🔍 Verifying account: { accountId: "...", tenantId: "...", ... }
❌ Account not found for tenant: { accountId: "...", availableAccounts: [...] }
```

### 3. Verify Account in Database
Run this query to see what accounts exist:
```sql
SELECT id, name, type, tenant_id 
FROM accounts 
WHERE tenant_id = '[your-tenant-id]' 
  AND (type = 'Bank' OR type = 'Cash')
ORDER BY name;
```

### 4. Compare Frontend vs Backend
- Check if the account ID in the console logs matches the database ID
- Verify the tenant_id matches
- Check for any whitespace or formatting differences

## Fixes Applied

### 1. Enhanced Account ID Validation
- Normalizes account ID (trim, string conversion)
- Uses original account object ID instead of ComboBox item ID
- Flexible matching (case-insensitive, handles whitespace)

### 2. Improved Error Messages
- Shows available accounts if selected account not found
- Indicates if account exists in different tenant
- Provides actionable guidance

### 3. Better Logging
- Logs account selection process
- Logs account ID format and type
- Logs available accounts for comparison

## Testing Checklist

- [ ] Select an account from the dropdown
- [ ] Check browser console for account selection logs
- [ ] Click "Confirm Payment"
- [ ] Check browser console for payment request logs
- [ ] Check server logs for account validation
- [ ] Verify account ID matches between frontend and backend
- [ ] Verify tenant_id matches

## Common Issues and Solutions

### Issue: Account ID is undefined
**Solution**: Ensure accounts are loaded before opening payment modal

### Issue: Account ID doesn't match database
**Solution**: Check if account was deleted or recreated with different ID

### Issue: Tenant mismatch
**Solution**: Verify you're logged in with the correct tenant

### Issue: Account type not Bank or Cash
**Solution**: Only Bank and Cash accounts can be used for payments

## Next Steps if Error Persists

1. **Check Account Loading**:
   - Verify accounts are loaded in AppContext
   - Check if API fetch is successful
   - Verify account filtering (Bank/Cash only)

2. **Verify Account Selection**:
   - Check ComboBox onSelect callback
   - Verify account ID is being set correctly
   - Check if account exists in paymentAccounts array

3. **Check Backend Validation**:
   - Verify account exists in database
   - Check tenant_id matches
   - Verify account type is Bank or Cash

4. **Database Check**:
   - Run diagnostic query to see all accounts
   - Compare account IDs with frontend logs
   - Check for any data inconsistencies
