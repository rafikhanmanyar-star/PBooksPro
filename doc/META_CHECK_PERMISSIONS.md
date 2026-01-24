# How to Check App Permissions in Meta Dashboard

## Problem: Can't Find "Advanced" Settings

The "Advanced" section location has changed in Meta Dashboard. Here are the correct ways to check your app permissions.

---

## Method 1: Check Permissions via App Dashboard (Easiest)

1. **Go to Meta App Dashboard**
   - Visit: https://developers.facebook.com/apps
   - Select your app

2. **Navigate to App Settings**
   - In the left sidebar, click **"Settings"** → **"Basic"**
   - Scroll down to see app information

3. **Check Permissions**
   - Go to **"Products"** in the left sidebar
   - Click **"WhatsApp"**
   - Click **"API Setup"** tab
   - Your permissions should be visible here

---

## Method 2: Check via Access Token

1. **Go to WhatsApp Setup**
   - Meta App Dashboard → **WhatsApp** → **API Setup**

2. **View Current Token**
   - Look at your current access token
   - If token is working, permissions are correct ✅

3. **Test Token Permissions**
   - Use the token in your application
   - If "Test Connection" works, permissions are fine ✅

---

## Method 3: Check via Graph API Explorer

1. **Go to Graph API Explorer**
   - Visit: https://developers.facebook.com/tools/explorer/
   - Select your app from dropdown

2. **Check Permissions**
   - Click **"Get Token"** → **"Get User Access Token"**
   - You'll see a list of available permissions
   - Look for `whatsapp_business_messaging` and `whatsapp_business_management`

---

## Method 4: Check via App Review (If Available)

1. **Go to App Review**
   - Meta App Dashboard → **"App Review"** (in left sidebar)
   - Click **"Permissions and Features"**
   - You'll see all permissions your app has

---

## Method 5: Verify by Testing (Recommended)

The easiest way to verify permissions is to test them:

1. **Generate Token with Permissions**
   - When generating token, select:
     - ✅ `whatsapp_business_messaging`
     - ✅ `whatsapp_business_management`

2. **Use Token in Application**
   - Go to Settings → WhatsApp Integration
   - Paste the token
   - Click **"Test Connection"**

3. **If Test Succeeds**
   - ✅ Permissions are correct!
   - You don't need to check anywhere else

4. **If Test Fails**
   - Check error message
   - Usually says "Insufficient permissions" if wrong permissions selected
   - Regenerate token with correct permissions

---

## What to Look For

When checking permissions, you should see:

- ✅ `whatsapp_business_messaging` - For sending/receiving messages
- ✅ `whatsapp_business_management` - For account management

If both are present (or your token works), you're good to go!

---

## Quick Verification Checklist

Instead of looking for "Advanced" settings, verify permissions this way:

- [ ] Generated token with `whatsapp_business_messaging` selected
- [ ] Generated token with `whatsapp_business_management` selected
- [ ] Token saved in application
- [ ] "Test Connection" button works ✅
- [ ] Can send test message ✅

**If all above work, permissions are correct!** ✅

---

## Alternative: Check Token Info Directly

You can also check what permissions a token has by making an API call:

```bash
# Replace YOUR_ACCESS_TOKEN with your actual token
curl "https://graph.facebook.com/me/permissions?access_token=YOUR_ACCESS_TOKEN"
```

This will return a list of permissions granted to the token.

---

## Summary

**You don't need to find "Advanced" settings!**

Just verify permissions by:
1. ✅ Selecting them when generating token
2. ✅ Testing the token in your application
3. ✅ If "Test Connection" works, permissions are correct!

The "Test Connection" button in your application is the best way to verify everything is set up correctly.

---

**Last Updated**: January 2025
