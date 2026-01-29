# Debug: No Logs When Receiving WhatsApp Messages

If you sent a message but see no logs in your server, follow this checklist step by step.

---

## Step 1: Check if Webhook is Receiving Requests

### A. Check ngrok Web Interface

1. **Open ngrok web interface:**
   - Go to: http://127.0.0.1:4040
   - This shows all requests going through ngrok

2. **Send a test message** from your mobile

3. **Check if you see any POST requests:**
   - Look for requests to `/api/whatsapp/webhook`
   - If you see requests → Webhook is being called, go to Step 2
   - If NO requests → Meta is not sending webhooks, go to Step 1B

### B. Check Meta Webhook Configuration

1. **Go to Meta Dashboard:**
   - https://developers.facebook.com/apps
   - Select your app → **WhatsApp** → **Configuration**

2. **Check Webhook Fields Subscription:**
   - Make sure these are checked:
     - ✅ **messages** (for incoming/outgoing messages)
     - ✅ **message_status** (for delivery receipts)
   - If not checked, check them and click "Save"

3. **Check Webhook Status:**
   - Look for webhook status indicator
   - Should show "Verified" or "Active"
   - If shows error, re-verify the webhook

4. **Test Webhook:**
   - In Meta Dashboard, find "Test" button next to webhook
   - Click "Test" → Select "messages" → Click "Send test"
   - Check your server logs - you should see a test webhook

---

## Step 2: Check Server Logs

### A. Check Your API Server Terminal

1. **Look for these log messages:**
   ```
   [WhatsApp Webhook] POST received
   ```

2. **If you see this but nothing else:**
   - Check for: `[WhatsApp Webhook] Received but tenant ID not found`
   - This means webhook is received but tenant ID can't be identified
   - Go to Step 3

3. **If you see NO logs at all:**
   - Webhook is not reaching your server
   - Check ngrok is still running
   - Check API server is running
   - Go to Step 1

### B. Check for Tenant ID Issues

Look for this warning in logs:
```
[WhatsApp Webhook] Received but tenant ID not found. Payload may be a non-WhatsApp test (e.g. "about" field). Subscribe to "messages" and "message_status" under WhatsApp → Configuration.
```

**This means:**
- Webhook is received ✅
- But tenant ID cannot be found ❌
- Phone Number ID in webhook doesn't match your config

**Fix:**
1. Check your Phone Number ID in app settings matches Meta
2. Check database has correct phone_number_id

---

## Step 3: Verify Phone Number ID Match

### A. Check Phone Number ID in Your App

1. **In PBooksPro:**
   - Go to Settings → WhatsApp Integration
   - Check the **Phone Number ID** you entered
   - Copy it

2. **In Meta Dashboard:**
   - Go to WhatsApp → API Setup
   - Find "From" phone number
   - The **Phone number ID** is the long number (e.g., `123456789012345`)
   - Copy it

3. **Compare:**
   - They must match EXACTLY
   - If they don't match → Update in your app

### B. Check Database Configuration

1. **Check your database:**
   ```sql
   SELECT tenant_id, phone_number_id, verify_token, is_active 
   FROM whatsapp_configs 
   WHERE is_active = TRUE;
   ```

2. **Verify:**
   - `phone_number_id` matches Meta's Phone Number ID
   - `is_active` is `TRUE`
   - `verify_token` matches what you set in Meta

---

## Step 4: Check Webhook Subscription Fields

### In Meta Dashboard:

1. **Go to:** WhatsApp → Configuration → Webhooks

2. **Click "Manage" or "Edit"** next to Webhook Fields

3. **Make sure these are subscribed:**
   - ✅ **messages** - Required for receiving messages
   - ✅ **message_status** - For delivery receipts

4. **If not subscribed:**
   - Check the boxes
   - Click "Save"
   - Wait a few seconds

5. **Send another test message**

---

## Step 5: Test Webhook Manually

### A. Test Webhook Endpoint

1. **Open browser or use curl:**
   ```
   https://your-ngrok-url.ngrok-free.app/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=YOUR_TOKEN&hub.challenge=test123
   ```

2. **Should return:** `test123`

3. **If it doesn't work:**
   - Check ngrok is running
   - Check API server is running
   - Check the URL is correct

### B. Send Test Webhook from Meta

1. **In Meta Dashboard:**
   - Go to WhatsApp → Configuration → Webhooks
   - Find "Test" button
   - Click it
   - Select "messages" field
   - Click "Send test"

2. **Check your server logs:**
   - Should see: `[WhatsApp Webhook] POST received`
   - Should see test message being processed

---

## Step 6: Check ngrok Status

### A. Verify ngrok is Running

1. **Check ngrok terminal:**
   - Should show: `Session Status: online`
   - Should show forwarding URL

2. **If ngrok stopped:**
   - Restart it: `ngrok http 3000`
   - **Important:** Update webhook URL in Meta Dashboard with new URL

### B. Check ngrok Web Interface

1. **Open:** http://127.0.0.1:4040

2. **Check "Requests" tab:**
   - Should show recent requests
   - Look for POST to `/api/whatsapp/webhook`

3. **If no requests:**
   - Meta is not sending webhooks
   - Check webhook configuration in Meta
   - Check webhook fields are subscribed

---

## Step 7: Check App Status in Meta

### Important: App Must Be Published (for production)

1. **Check app status:**
   - Go to: https://developers.facebook.com/apps
   - Select your app
   - Check app status

2. **If app is in "Development" mode:**
   - Webhooks only work for test users
   - To receive messages from any user, app must be published
   - Or add the sender as a test user

3. **If app is published:**
   - Webhooks should work for all users
   - Check if sender is blocked or restricted

---

## Step 8: Enable Detailed Logging

### Add More Logging (if needed)

Check your server logs for these specific messages:

1. **When webhook is received:**
   ```
   [WhatsApp Webhook] POST received
   ```

2. **When processing:**
   ```
   [WhatsApp Webhook] Processing entries
   [WhatsApp Webhook] Found phone number ID in metadata
   [WhatsApp Webhook] Config lookup result
   ```

3. **When messages found:**
   ```
   [WhatsApp Webhook] Found incoming messages
   [WhatsApp API Service] 📨📨📨 INCOMING MESSAGES DETECTED 📨📨📨
   ```

4. **When processing message:**
   ```
   [WhatsApp API Service] Processing incoming message
   [WhatsApp API Service] ✅✅✅ INCOMING MESSAGE SAVED TO DATABASE ✅✅✅
   ```

---

## Common Issues and Solutions

### Issue 1: No logs at all

**Possible causes:**
- ❌ ngrok not running
- ❌ API server not running
- ❌ Webhook URL incorrect in Meta
- ❌ Webhook fields not subscribed

**Solution:**
1. Check ngrok is running (http://127.0.0.1:4040)
2. Check API server is running (http://localhost:3000/health)
3. Verify webhook URL in Meta matches ngrok URL
4. Subscribe to "messages" field in Meta

### Issue 2: Webhook received but tenant ID not found

**Possible causes:**
- ❌ Phone Number ID mismatch
- ❌ Config not active in database
- ❌ Multiple configs with different phone numbers

**Solution:**
1. Verify Phone Number ID in app matches Meta
2. Check database: `SELECT * FROM whatsapp_configs WHERE is_active = TRUE;`
3. Update Phone Number ID if wrong

### Issue 3: Webhook received but no messages

**Possible causes:**
- ❌ Webhook fields not subscribed (only "about" field subscribed)
- ❌ Message sent to wrong number
- ❌ App not published (only test users)

**Solution:**
1. Subscribe to "messages" field in Meta Dashboard
2. Verify you're sending to the correct WhatsApp number
3. Check app status and test user permissions

### Issue 4: ngrok URL changed

**Possible causes:**
- ❌ ngrok restarted (free URLs change)
- ❌ Webhook URL in Meta is outdated

**Solution:**
1. Get new ngrok URL
2. Update webhook URL in Meta Dashboard
3. Re-verify webhook

---

## Quick Debug Checklist

Run through this checklist:

- [ ] ngrok is running and shows "online" status
- [ ] API server is running on port 3000
- [ ] Can access ngrok web interface: http://127.0.0.1:4040
- [ ] Webhook URL in Meta matches ngrok URL exactly
- [ ] Verify Token in Meta matches app
- [ ] Webhook fields subscribed: "messages" and "message_status"
- [ ] Phone Number ID in app matches Meta's Phone Number ID
- [ ] Database has active config with correct phone_number_id
- [ ] App is published OR sender is a test user
- [ ] Sent message to correct WhatsApp number
- [ ] Checked ngrok web interface for incoming requests
- [ ] Checked server terminal for logs

---

## Next Steps

Once you identify the issue:

1. **Fix the problem** (using solutions above)
2. **Send another test message**
3. **Check logs again**
4. **Verify message appears in database:**
   ```sql
   SELECT * FROM whatsapp_messages 
   WHERE direction = 'incoming' 
   ORDER BY timestamp DESC 
   LIMIT 10;
   ```

---

## Still Not Working?

If you've checked everything and still no logs:

1. **Share these details:**
   - Screenshot of ngrok web interface (http://127.0.0.1:4040)
   - Screenshot of Meta webhook configuration
   - Your server logs (if any)
   - Phone Number ID from Meta vs your app

2. **Try sending test webhook from Meta:**
   - Meta Dashboard → WhatsApp → Configuration → Webhooks → Test
   - This will help identify if it's a webhook delivery issue or message processing issue
