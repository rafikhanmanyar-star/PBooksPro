# Meta WhatsApp Business API - Required Permissions Guide

## When Generating Permanent Access Token

When Meta asks you to "Assign permissions" for your app, you need to select the WhatsApp-related permissions.

---

## Required Permissions for WhatsApp Business API

### Essential Permissions (Must Have):

1. **`whatsapp_business_messaging`**
   - **Purpose**: Send and receive WhatsApp messages
   - **Required**: ✅ Yes - This is the core permission for messaging
   - **What it allows**: 
     - Send text messages
     - Send media messages
     - Receive incoming messages
     - Check message status

2. **`whatsapp_business_management`**
   - **Purpose**: Manage WhatsApp Business account settings
   - **Required**: ✅ Yes - Needed for account management
   - **What it allows**:
     - Read phone number information
     - Manage webhooks
     - Access business account details
     - View message templates

---

## How to Find These Permissions

### Option 1: Search for Permissions

1. In the "Assign permissions" screen, use the **search bar** (magnifying glass icon)
2. Type: `whatsapp`
3. You should see:
   - `whatsapp_business_messaging`
   - `whatsapp_business_management`
4. Check both boxes ✅

### Option 2: Scroll Through List

1. Scroll down in the permissions list
2. Look for permissions starting with `whatsapp_`
3. Select:
   - ✅ `whatsapp_business_messaging`
   - ✅ `whatsapp_business_management`

---

## Optional Permissions (Not Required, but Useful)

These are NOT required for basic messaging, but can be useful:

- **`whatsapp_business_phone_number_id`** - If you need to manage multiple phone numbers
- **`whatsapp_business_account`** - For advanced account management

**Note**: For basic WhatsApp messaging, you only need the 2 essential permissions above.

---

## Step-by-Step Instructions

1. **In the Search Bar**:
   - Type: `whatsapp`
   - Press Enter or click search

2. **Select Permissions**:
   - ✅ Check `whatsapp_business_messaging`
   - ✅ Check `whatsapp_business_management`

3. **Verify Selection**:
   - The dropdown should show "2 options selected" (or more if you selected optional ones)
   - You can click the dropdown to see your selected permissions

4. **Continue**:
   - Click "Next" or "Done" to proceed
   - Complete the token generation process

---

## What NOT to Select

You don't need these for WhatsApp messaging:
- ❌ `catalog_management` - For Facebook Shop catalogs
- ❌ `commerce_account_*` - For commerce features
- ❌ `instagram_*` - For Instagram features
- ❌ `pages_*` - For Facebook Pages (unless you also use Pages)
- ❌ `ads_*` - For Facebook Ads (unless you also run ads)

**Keep it simple**: Only select WhatsApp permissions unless you need other features.

---

## Verification

After selecting permissions and generating the token:

1. **Check Token Permissions**:
   - Go to Meta App Dashboard → Settings → Advanced
   - View your app's permissions
   - Verify `whatsapp_business_messaging` and `whatsapp_business_management` are listed

2. **Test the Token**:
   - Use the token in your application
   - Try sending a test message
   - If it works, permissions are correct ✅

---

## Common Issues

### Issue 1: "Permission not found"

**Solution**:
- Make sure you're using the correct app (the one with WhatsApp product added)
- Check that WhatsApp product is added to your app
- Try refreshing the page

### Issue 2: "Insufficient permissions"

**Solution**:
- Make sure both `whatsapp_business_messaging` and `whatsapp_business_management` are selected
- Regenerate the token with correct permissions
- Wait a few minutes for permissions to propagate

### Issue 3: "Token works but can't send messages"

**Possible Causes**:
- Missing `whatsapp_business_messaging` permission
- Phone number not approved
- Business account not verified

**Solution**:
- Verify permissions include `whatsapp_business_messaging`
- Check phone number status in Meta Dashboard
- Ensure business account is verified

---

## Quick Checklist

Before generating the token:

- [ ] WhatsApp product is added to your app
- [ ] Phone number is approved and ready
- [ ] You're on the "Assign permissions" step
- [ ] You've searched for `whatsapp` permissions
- [ ] ✅ `whatsapp_business_messaging` is selected
- [ ] ✅ `whatsapp_business_management` is selected
- [ ] Dropdown shows "2 options selected" (or more)
- [ ] Ready to generate token

---

## After Token Generation

Once you have the permanent access token:

1. **Copy the Token**:
   - Copy the entire token (it's long!)
   - Store it securely

2. **Use in Application**:
   - Go to Settings → WhatsApp Integration
   - Paste token in "Access Token (API Key)" field
   - Enter Phone Number ID
   - Save configuration

3. **Test**:
   - Click "Test Connection"
   - Should show "Connection successful!" ✅

---

## Summary

**Minimum Required Permissions:**
- ✅ `whatsapp_business_messaging`
- ✅ `whatsapp_business_management`

**That's it!** You don't need any other permissions for basic WhatsApp messaging functionality.

---

**Last Updated**: January 2025
