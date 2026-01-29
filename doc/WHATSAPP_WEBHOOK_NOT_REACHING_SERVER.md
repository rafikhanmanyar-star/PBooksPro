# Fix: Webhook Event in Meta Test But Not Reaching Server

## Problem
You see the webhook payload in Meta's test section, but nothing appears in ngrok terminal or server logs.

## Root Cause
Meta is generating the webhook payload, but **not actually sending it** to your ngrok URL. This usually means:
1. Webhook URL in Meta is incorrect or not verified
2. Meta is only showing the test payload, not sending it
3. Webhook subscription is not active

---

## Step 1: Verify Webhook URL in Meta

1. **Go to Meta Dashboard:**
   - https://developers.facebook.com/apps
   - Select your app → **WhatsApp** → **Configuration**

2. **Check Webhook section:**
   - Look at "Callback URL" field
   - Should be: `https://jaycob-unslackening-binately.ngrok-free.app/api/whatsapp/webhook`
   - **Must NOT include:** `-> http://localhost:3000` or any other text

3. **Verify Status:**
   - Should show "Verified" or green checkmark
   - If shows error, click "Verify and save" again

---

## Step 2: Test Webhook Endpoint Manually

### A. Test GET (Verification)

Open in browser:
```
https://jaycob-unslackening-binately.ngrok-free.app/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=whatsapp_verify_1769352619431_ldn7at70bs&hub.challenge=test123
```

**Expected:** Browser shows `test123`

**If it doesn't work:**
- ngrok is not running
- API server is not running
- URL is incorrect

### B. Test POST (Webhook Delivery)

Use curl or Postman to send a test POST:

```bash
curl -X POST https://jaycob-unslackening-binately.ngrok-free.app/api/whatsapp/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "object": "whatsapp_business_account",
    "entry": [{
      "id": "926493967222561",
      "changes": [{
        "value": {
          "messaging_product": "whatsapp",
          "metadata": {
            "phone_number_id": "942860822248152"
          },
          "messages": [{
            "from": "923175505575",
            "id": "test123",
            "timestamp": "1769582911",
            "text": {
              "body": "Test"
            },
            "type": "text"
          }]
        },
        "field": "messages"
      }]
    }]
  }'
```

**Check:**
- ngrok web interface (http://127.0.0.1:4040) should show the request
- Server logs should show: `[WhatsApp Webhook] POST received`

---

## Step 3: Check Meta Webhook Delivery

### A. Check Webhook Status

1. **In Meta Dashboard:**
   - Go to: WhatsApp → Configuration → Webhooks
   - Look for webhook status indicator
   - Should show "Active" or "Verified"

2. **Check Webhook Fields:**
   - Click "Manage" next to Webhook Fields
   - Must have:
     - ✅ **messages** (checked)
     - ✅ **message_status** (checked)

### B. Send Test Webhook from Meta

1. **In Meta Dashboard:**
   - WhatsApp → Configuration → Webhooks
   - Find **"Test"** button (usually near webhook URL)
   - Click it
   - Select **"messages"** from dropdown
   - Click **"Send test"**

2. **What to check:**
   - ngrok web interface (http://127.0.0.1:4040) - should show POST request
   - Server terminal - should show logs
   - If nothing appears, Meta is not sending webhooks

---

## Step 4: Verify ngrok is Forwarding

1. **Check ngrok terminal:**
   - Should show: `Session Status: online`
   - Should show: `Forwarding https://... -> http://localhost:3000`

2. **Check ngrok web interface:**
   - Open: http://127.0.0.1:4040
   - Go to "Requests" tab
   - Should show all requests going through ngrok

3. **If ngrok shows requests but server doesn't:**
   - Check API server is running
   - Check server is on port 3000
   - Check server logs for errors

---

## Step 5: Common Issues

### Issue 1: Meta Test Shows Payload But Doesn't Send

**Symptom:**
- You see payload in Meta test section
- But no request in ngrok
- No logs in server

**Cause:**
- Meta test section only shows what the payload WOULD look like
- It doesn't actually send it unless webhook is properly configured

**Fix:**
1. Make sure webhook URL is verified (green checkmark)
2. Make sure webhook fields are subscribed
3. Use "Send test" button, not just viewing test payload

### Issue 2: Webhook URL Not Verified

**Symptom:**
- Webhook URL shows error or not verified
- "Verify and save" button available

**Fix:**
1. Make sure ngrok is running
2. Make sure API server is running
3. Click "Verify and save" in Meta
4. Should return success

### Issue 3: Webhook Fields Not Subscribed

**Symptom:**
- Webhook URL verified
- But no messages received

**Fix:**
1. Go to Webhook Fields
2. Check "messages" and "message_status"
3. Click "Save"

### Issue 4: App Not Published

**Symptom:**
- Webhook works for test webhooks
- But not for real messages

**Fix:**
- Publish app in Meta Dashboard
- Or add sender as test user

---

## Step 6: Debug Checklist

Run through this:

- [ ] ngrok is running and shows "online"
- [ ] API server is running on port 3000
- [ ] Can access ngrok web interface: http://127.0.0.1:4040
- [ ] Webhook URL in Meta is exactly: `https://jaycob-unslackening-binately.ngrok-free.app/api/whatsapp/webhook`
- [ ] Webhook URL shows "Verified" in Meta
- [ ] Webhook fields subscribed: "messages" and "message_status"
- [ ] Test GET request works (returns challenge)
- [ ] Test POST request works (shows in ngrok and server logs)
- [ ] "Send test" from Meta works (shows in ngrok and server logs)

---

## Step 7: Force Meta to Send Webhook

### Method 1: Use Meta Test Button

1. **In Meta Dashboard:**
   - WhatsApp → Configuration → Webhooks
   - Find "Test" button
   - Click it
   - Select "messages"
   - Click "Send test"

### Method 2: Send Real Message

1. **Make sure:**
   - App is published OR sender is test user
   - Webhook fields are subscribed
   - Webhook URL is verified

2. **Send message:**
   - From your mobile to the WhatsApp Business number
   - Check ngrok web interface immediately
   - Check server logs

### Method 3: Use Meta Graph API Explorer

1. **Go to:** https://developers.facebook.com/tools/explorer/
2. **Select your app**
3. **Send test webhook via API**

---

## Step 8: Verify Phone Number ID Match

From your payload, I can see:
- `phone_number_id`: `942860822248152`

**Check:**
1. In your PBooksPro app settings, Phone Number ID should be: `942860822248152`
2. In database, `whatsapp_configs.phone_number_id` should be: `942860822248152`

**If mismatch:**
- Update Phone Number ID in your app
- Save configuration
- Try again

---

## Quick Test Commands

### Test 1: Check ngrok is working
```bash
curl https://jaycob-unslackening-binately.ngrok-free.app/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=whatsapp_verify_1769352619431_ldn7at70bs&hub.challenge=test
```

Should return: `test`

### Test 2: Check server is reachable
```bash
curl https://jaycob-unslackening-binately.ngrok-free.app/health
```

Should return server health check

### Test 3: Send test webhook
Use the curl command in Step 2B above

---

## Still Not Working?

If Meta test shows payload but nothing reaches ngrok:

1. **Check Meta Webhook Logs:**
   - In Meta Dashboard, check webhook delivery logs
   - Should show delivery attempts and status codes

2. **Check ngrok Logs:**
   - ngrok web interface shows all requests
   - If no requests, Meta is not sending

3. **Verify Webhook URL One More Time:**
   - Copy webhook URL from Meta
   - Compare character-by-character with ngrok URL
   - Must match exactly

4. **Try Re-verifying:**
   - Click "Remove subscription" in Meta
   - Re-enter webhook URL
   - Re-enter verify token
   - Click "Verify and save"
   - Subscribe to fields again

---

## Expected Flow

When everything works:

1. **You send message from mobile** → WhatsApp
2. **WhatsApp receives message** → Sends to Meta
3. **Meta processes message** → Sends webhook to your URL
4. **ngrok receives webhook** → Forwards to localhost:3000
5. **Your server receives webhook** → Processes message
6. **Message saved to database** → Appears in your app

**Check each step:**
- Step 3-4: Check ngrok web interface
- Step 4-5: Check server logs
- Step 5-6: Check database
