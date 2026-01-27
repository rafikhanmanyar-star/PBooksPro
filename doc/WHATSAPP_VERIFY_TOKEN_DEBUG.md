# WhatsApp Verify Token Debugging Guide

## Problem: "Webhook verification failed: Invalid verify token"

This means the verify token in your database doesn't match what Meta is sending.

---

## Step 1: Check What's in Your Database

Run this SQL query in DBeaver to see what verify token is stored:

```sql
SELECT 
    tenant_id,
    verify_token,
    phone_number_id,
    is_active,
    created_at,
    updated_at
FROM whatsapp_configs
WHERE is_active = TRUE;
```

**Note the verify_token value** - this is what should be in Meta Dashboard.

---

## Step 2: Check What's in Meta Dashboard

1. Go to Meta App Dashboard → WhatsApp → Configuration → Webhooks
2. Check the **"Verify token"** field
3. Compare it with the token from Step 1

**They must match EXACTLY** (including spaces, case, etc.)

---

## Step 3: Fix the Mismatch

### Option A: Update Meta Dashboard (Recommended)

1. **Copy the verify_token from your database** (from Step 1)
2. **Go to Meta Dashboard** → WhatsApp → Configuration → Webhooks
3. **Paste the token** in the "Verify token" field (make sure no extra spaces)
4. **Click "Verify and Save"**

### Option B: Update Database to Match Meta Dashboard

If you want to use the token from Meta Dashboard:

1. **Copy the verify token from Meta Dashboard**
2. **Run this SQL** (replace `YOUR_TENANT_ID` and `YOUR_VERIFY_TOKEN`):

```sql
UPDATE whatsapp_configs
SET verify_token = 'YOUR_VERIFY_TOKEN',
    updated_at = NOW()
WHERE tenant_id = 'YOUR_TENANT_ID' 
  AND is_active = TRUE;
```

3. **Then try verification again in Meta Dashboard**

---

## Step 4: Verify Token Format

The verify token should be:
- A string (no special requirements)
- Stored exactly as entered (no trimming)
- Case-sensitive (if applicable)

**Common Issues:**
- ❌ Extra spaces at the beginning or end
- ❌ Different case (though tokens are usually case-insensitive)
- ❌ Token not saved to database
- ❌ Multiple active configs (only one should be active)

---

## Step 5: Check for Multiple Configs

If you have multiple tenants, make sure only ONE config is active:

```sql
-- Check for multiple active configs
SELECT tenant_id, verify_token, is_active
FROM whatsapp_configs
WHERE is_active = TRUE;

-- If you see multiple, deactivate the wrong ones:
-- UPDATE whatsapp_configs SET is_active = FALSE WHERE tenant_id = 'WRONG_TENANT_ID';
```

---

## Step 6: Test Webhook Verification Manually

Test if your webhook endpoint works with the token from database:

```bash
# Replace YOUR_TOKEN with the verify_token from database
curl "https://pbookspro-api-staging.onrender.com/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=YOUR_TOKEN&hub.challenge=test123"
```

**Expected Response**: `test123`

**If you get 403 Forbidden**: Token mismatch
**If you get 200 with test123**: Token is correct, but Meta might be sending a different token

---

## Step 7: Check Server Logs

When Meta tries to verify, check your server logs. You should see:

```
Webhook verification failed: Invalid verify token
```

This means the token Meta sent doesn't match what's in the database.

**To see what token Meta is sending**, you can temporarily add logging:

```typescript
// In server/api/routes/whatsapp-webhook.ts (line 17)
console.log('Meta sent verify token:', token);
console.log('Looking for token in database...');
```

---

## Quick Fix: Regenerate and Resync

1. **In Application**:
   - Go to Settings → WhatsApp Integration
   - Click "Generate New Token"
   - **Copy the new token**
   - Click "Save Configuration"

2. **In Meta Dashboard**:
   - Go to WhatsApp → Configuration → Webhooks
   - **Paste the NEW token** from step 1
   - Click "Verify and Save"

3. **Verify**:
   - Check server logs for "Webhook verified successfully"
   - Meta Dashboard should show "Webhook verified" ✅

---

## SQL Queries for Debugging

### Check Current Config
```sql
SELECT 
    id,
    tenant_id,
    LEFT(verify_token, 20) || '...' as verify_token_preview,
    phone_number_id,
    is_active,
    created_at
FROM whatsapp_configs
WHERE is_active = TRUE;
```

### Check Token Length
```sql
SELECT 
    tenant_id,
    LENGTH(verify_token) as token_length,
    verify_token
FROM whatsapp_configs
WHERE is_active = TRUE;
```

### Update Token (if needed)
```sql
-- Replace YOUR_TENANT_ID and YOUR_NEW_TOKEN
UPDATE whatsapp_configs
SET verify_token = 'YOUR_NEW_TOKEN',
    updated_at = NOW()
WHERE tenant_id = 'YOUR_TENANT_ID';
```

### Clear and Start Fresh
```sql
-- Deactivate all configs
UPDATE whatsapp_configs SET is_active = FALSE;

-- Or delete all (if you want to start over)
-- DELETE FROM whatsapp_configs;
```

---

## Common Causes

1. **Token Not Saved**: Configuration wasn't saved properly
2. **Token Mismatch**: Different token in app vs Meta Dashboard
3. **Extra Spaces**: Token has leading/trailing spaces
4. **Multiple Tenants**: Wrong tenant's token is being checked
5. **Token Regenerated**: Token was changed but Meta Dashboard wasn't updated

---

## Verification Checklist

- [ ] Token exists in database (check with SQL)
- [ ] Token in database matches token in Meta Dashboard
- [ ] No extra spaces in token
- [ ] Only one active config per tenant
- [ ] Server logs show verification attempts
- [ ] Webhook URL is correct and accessible

---

**Last Updated**: January 2025
