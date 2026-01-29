# Fix: Phone Number ID Error - Object Does Not Exist

## Error Message
```
Sending of message failed.
Unsupported post request. Object with ID '942860822248152' does not exist, 
cannot be loaded due to missing permissions, or does not support this operation.
```

## Problem
The Phone Number ID `942860822248152` cannot be accessed by your app. This usually means:
1. Phone Number ID is incorrect
2. App doesn't have permissions for this phone number
3. Phone number is not properly configured in Meta
4. Access token doesn't have WhatsApp permissions

---

## Step 1: Verify Phone Number ID in Meta Dashboard

1. **Go to Meta Dashboard:**
   - https://developers.facebook.com/apps
   - Select your app
   - Go to **WhatsApp** → **API Setup**

2. **Find the Phone Number:**
   - Under "From" section, you'll see your WhatsApp Business phone number
   - The **Phone number ID** is the long number displayed (e.g., `123456789012345`)
   - **Copy this exact number**

3. **Compare with Your App:**
   - In PBooksPro: Settings → WhatsApp Integration
   - Check if Phone Number ID matches Meta exactly
   - If different, update it

---

## Step 2: Check WhatsApp Permissions

### A. Check App Permissions

1. **In Meta Dashboard:**
   - Go to: **App Review** → **Permissions and Features**
   - Look for WhatsApp-related permissions:
     - `whatsapp_business_messaging`
     - `whatsapp_business_management`

2. **If permissions are missing:**
   - Request them in App Review
   - Or use a test app with all permissions

### B. Check Phone Number Status

1. **In Meta Dashboard:**
   - Go to: **WhatsApp** → **API Setup**
   - Check phone number status:
     - Should show "Connected" or "Active"
     - If shows "Disconnected" or error, fix it

2. **Verify Phone Number:**
   - Make sure phone number is verified
   - Make sure it's linked to your WhatsApp Business Account

---

## Step 3: Verify Access Token Permissions

### A. Check Token Permissions

1. **In Meta Dashboard:**
   - Go to: **WhatsApp** → **API Setup**
   - Look at your Access Token
   - Check what permissions it has

2. **Required Permissions:**
   - `whatsapp_business_messaging` - To send/receive messages
   - `whatsapp_business_management` - To manage phone numbers

### B. Generate New Token (if needed)

1. **In Meta Dashboard:**
   - Go to: **WhatsApp** → **API Setup**
   - Find "Temporary access token" or "Permanent access token"
   - Click "Generate" or "Refresh"

2. **Copy the new token:**
   - Make sure it's the full token (very long)
   - Update in your PBooksPro app

3. **Update in Your App:**
   - Settings → WhatsApp Integration
   - Paste new Access Token
   - Save configuration

---

## Step 4: Verify Phone Number ID Format

The Phone Number ID should be:
- A long numeric string (e.g., `942860822248152`)
- No spaces, no dashes
- Exactly as shown in Meta Dashboard

**Common mistakes:**
- ❌ Including country code or phone number format
- ❌ Using phone number instead of Phone Number ID
- ❌ Extra spaces or characters

**Correct format:**
- ✅ `942860822248152` (just the ID number)

---

## Step 5: Check WhatsApp Business Account Setup

### A. Verify Business Account

1. **In Meta Dashboard:**
   - Go to: **WhatsApp** → **API Setup**
   - Check "WhatsApp Business Account" section
   - Should show your business account

2. **If missing:**
   - You need to set up WhatsApp Business Account first
   - Link your phone number to the account

### B. Verify Phone Number Link

1. **In Meta Dashboard:**
   - Go to: **WhatsApp** → **Phone Numbers**
   - Should show your phone number
   - Should show status as "Connected"

2. **If not connected:**
   - Follow Meta's setup process
   - Verify phone number via SMS/call
   - Complete setup

---

## Step 6: Test with Graph API Explorer

### A. Use Meta Graph API Explorer

1. **Go to:** https://developers.facebook.com/tools/explorer/
2. **Select your app**
3. **Set Access Token:**
   - Use your WhatsApp access token
   - Or generate one from API Setup

4. **Test Phone Number ID:**
   ```
   GET /942860822248152
   ```
   - Should return phone number info
   - If error, ID is wrong or no permissions

### B. Test Sending Message

1. **In Graph API Explorer:**
   ```
   POST /942860822248152/messages
   ```
   - With proper payload
   - Check if it works

2. **If error:**
   - Check token permissions
   - Check phone number ID
   - Check app permissions

---

## Step 7: Common Solutions

### Solution 1: Phone Number ID Mismatch

**Fix:**
1. Get correct Phone Number ID from Meta Dashboard
2. Update in your app
3. Save configuration
4. Test again

### Solution 2: Access Token Missing Permissions

**Fix:**
1. Generate new access token in Meta Dashboard
2. Make sure it has WhatsApp permissions
3. Update in your app
4. Test again

### Solution 3: App Not Published

**Fix:**
1. Publish app in Meta Dashboard
2. Or use test mode with proper permissions
3. Add test users if needed

### Solution 4: Phone Number Not Verified

**Fix:**
1. Complete phone number verification in Meta
2. Link phone number to WhatsApp Business Account
3. Wait for activation

---

## Step 8: Verify Configuration

### Checklist:

- [ ] Phone Number ID in app matches Meta Dashboard exactly
- [ ] Access Token is valid and has WhatsApp permissions
- [ ] Phone number is verified and connected in Meta
- [ ] App has WhatsApp permissions in App Review
- [ ] WhatsApp Business Account is set up
- [ ] Phone number is linked to Business Account
- [ ] Tested with Graph API Explorer (if possible)

---

## Step 9: Get Correct Phone Number ID

### Method 1: From Meta Dashboard

1. **Go to:** WhatsApp → API Setup
2. **Find "From" section**
3. **Copy Phone number ID** (the long number)

### Method 2: From API Response

1. **Use Graph API Explorer:**
   ```
   GET /me?fields=whatsapp_business_account
   ```
2. **Navigate to phone numbers:**
   ```
   GET /{business-account-id}/phone_numbers
   ```
3. **Find your phone number and get its ID**

### Method 3: From Webhook Payload

The webhook payload you received shows:
```json
"metadata": {
  "phone_number_id": "942860822248152"
}
```

**This is the correct Phone Number ID** - use this in your app!

---

## Step 10: Update Configuration

1. **In PBooksPro:**
   - Settings → WhatsApp Integration
   - Update Phone Number ID to: `942860822248152`
   - Verify Access Token is correct
   - Click "Test Connection"
   - If successful, click "Save Configuration"

2. **Verify in Database:**
   ```sql
   SELECT phone_number_id, tenant_id, is_active 
   FROM whatsapp_configs 
   WHERE is_active = TRUE;
   ```
   - Should show: `phone_number_id = '942860822248152'`

---

## Still Getting Error?

If you've verified everything and still get the error:

1. **Check Meta Dashboard Status:**
   - App status
   - Phone number status
   - Business account status

2. **Try Generating New Token:**
   - Get fresh access token
   - Make sure it has all permissions
   - Update in app

3. **Contact Meta Support:**
   - If phone number is verified but still not working
   - Check Meta Business Support

4. **Check App Mode:**
   - Development mode: Limited permissions
   - Production mode: Full permissions
   - May need to publish app

---

## Quick Fix Summary

Based on your webhook payload, the correct Phone Number ID is: `942860822248152`

**Do this:**
1. Go to PBooksPro → Settings → WhatsApp Integration
2. Set Phone Number ID to: `942860822248152`
3. Verify Access Token is correct (get new one if needed)
4. Click "Test Connection"
5. If successful, save and try sending message again
