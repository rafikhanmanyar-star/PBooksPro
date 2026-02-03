# WhatsApp Message Not Received - Troubleshooting Guide

**Issue:** Message shows as "sent" in logs with WAM ID, but recipient hasn't received it.

## Understanding the Flow

When you see this log:
```
✅✅✅ MESSAGE SENT SUCCESSFULLY ✅✅✅
{
  messageId: 'msg_xxx',
  wamId: 'wamid.xxx...',
  status: 'sent'
}
```

This means:
- ✅ Your server successfully sent the message to Meta API
- ✅ Meta API accepted the message and returned a WAM ID
- ⚠️ **BUT** this doesn't guarantee delivery to recipient

## Message Status Lifecycle

1. **sent** - Message accepted by Meta (you see this in logs)
2. **delivered** - Message delivered to recipient's device (webhook update)
3. **read** - Recipient opened the message (webhook update)
4. **failed** - Delivery failed (webhook update with error)

## Step 1: Check Message Status in Database

### Check Current Status
```sql
SELECT 
  id,
  wam_id,
  phone_number,
  status,
  message_text,
  timestamp,
  created_at
FROM whatsapp_messages
WHERE wam_id = 'wamid.HBgMOTIzMTc1NTA1NTc1FQIAERgSMTI5NkU1MkYwM0MwMEE0RDRGAA=='
ORDER BY created_at DESC;
```

**Expected statuses:**
- `sent` - Meta accepted, waiting for delivery confirmation
- `delivered` - Delivered to device (should see this if working)
- `read` - Recipient read it
- `failed` - Delivery failed

### Check Status via API
```bash
# Replace with your actual message ID
curl -X GET "https://your-api.com/api/whatsapp/messages/msg_1769361582337_bcd522c6/status" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## Step 2: Check Webhook Status Updates

### Check Server Logs for Webhook Updates

**Look for:**
```
[WhatsApp API Service] [status_xxx] ===== PROCESSING MESSAGE STATUS UPDATE =====
[WhatsApp API Service] [status_xxx] ✅✅✅ MESSAGE STATUS UPDATED IN DATABASE ✅✅✅
```

**If you see:**
- `📱 MESSAGE DELIVERED TO RECIPIENT` - Message was delivered
- `👁️ MESSAGE READ BY RECIPIENT` - Recipient read it
- `❌ MESSAGE DELIVERY FAILED` - Delivery failed

**If you DON'T see status updates:**
- Webhook not configured properly
- Webhook not receiving updates from Meta
- Check webhook configuration in Meta Dashboard

## Step 3: Check Meta Business Suite Dashboard

1. **Go to Meta Business Suite**
   - https://business.facebook.com/
   - Navigate to your App → WhatsApp → API Setup

2. **Check Message Logs**
   - Look for your message by WAM ID
   - Check delivery status
   - Look for error messages

3. **Check Webhook Logs**
   - Go to Webhooks section
   - Check if status updates are being received
   - Look for failed webhook deliveries

## Step 4: Common Issues & Solutions

### Issue 1: Message Template Required

**Symptom:** Message accepted but not delivered, no error

**Cause:** First message to a new contact requires approved template

**Solution:**
1. Go to Meta Business Suite → Message Templates
2. Create and submit a template
3. Wait for approval (can take 24-48 hours)
4. Use template ID when sending first message

**Check in logs:**
```
⚠️ META API RETURNED ERROR IN RESPONSE
errorMessage: "Message template required for first contact"
```

### Issue 2: Phone Number Not Verified/Opted In

**Symptom:** Message sent but not delivered

**Cause:** Recipient phone number not verified or hasn't opted in

**Solution:**
- **Sandbox Mode:** Add phone number to test list in Meta Dashboard
- **Production:** Recipient must opt-in first (send "START" or similar)

**Check:**
- Meta Dashboard → WhatsApp → Phone Numbers → Test Numbers
- Ensure recipient number is in test list (sandbox) or has opted in (production)

### Issue 3: Rate Limiting

**Symptom:** Some messages work, others don't

**Cause:** Exceeded Meta API rate limits

**Solution:**
- Check rate limits in Meta Dashboard
- Wait before sending more messages
- Upgrade Meta plan if needed

**Check in logs:**
```
⚠️ META API RETURNED ERROR IN RESPONSE
errorCode: 4
errorMessage: "Rate limit exceeded"
```

### Issue 4: Invalid Phone Number Format

**Symptom:** Message accepted but fails silently

**Cause:** Phone number format incorrect

**Solution:**
- Use international format without + or spaces
- Example: `919876543210` (not `+91 9876543210`)

**Check in logs:**
```
[WhatsApp API Service] Phone number formatted
original: 91987***
formatted: 91987***
```

### Issue 5: Webhook Not Receiving Status Updates

**Symptom:** Message shows "sent" but never updates to "delivered"

**Cause:** Webhook not configured or not working

**Solution:**
1. **Verify Webhook URL:**
   ```
   https://your-api.com/api/whatsapp/webhook
   ```

2. **Verify Webhook is subscribed:**
   - Meta Dashboard → Webhooks
   - Ensure "messages" and "message_status" are subscribed

3. **Test Webhook:**
   - Use Meta's webhook test tool
   - Check server logs for test webhook

4. **Check Webhook Logs:**
   ```
   [WhatsApp API Service] [webhook_xxx] Processing webhook
   ```

### Issue 6: Message Blocked by Meta

**Symptom:** Message accepted but never delivered, no status update

**Cause:** Content violates Meta policies or spam filters

**Solution:**
- Review message content
- Avoid spam keywords
- Use approved templates for first messages
- Check Meta Dashboard for policy violations

## Step 5: Verify Webhook Configuration

### Check Webhook URL
```bash
# Test webhook verification
curl -X GET "https://your-api.com/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=YOUR_TOKEN&hub.challenge=test123"
```

Should return: `test123`

### Check Webhook Subscriptions
In Meta Dashboard, ensure these are subscribed:
- ✅ `messages` - Incoming messages
- ✅ `message_status` - Status updates (sent/delivered/read/failed)

## Step 6: Check Message in Meta Dashboard

### Find Your Message
1. Go to Meta Business Suite
2. Navigate to: **WhatsApp → API Setup → Message Logs**
3. Search for WAM ID: `wamid.HBgMOTIzMTc1NTA1NTc1FQIAERgSMTI5NkU1MkYwM0MwMEE0RDRGAA==`

### Check Status
- **Accepted** - Meta received it
- **Delivered** - Reached recipient's device
- **Read** - Recipient opened it
- **Failed** - Delivery failed (check error)

### Check Error Details
If status is "Failed", click to see:
- Error code
- Error message
- Suggested fix

## Step 7: Test with Meta's Test Phone Numbers

### Get Test Numbers
1. Meta Dashboard → WhatsApp → API Setup
2. Find "Test Phone Numbers" section
3. Use provided test numbers

### Send Test Message
```bash
curl -X POST "https://your-api.com/api/whatsapp/send" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "phoneNumber": "TEST_PHONE_NUMBER",
    "message": "Test message"
  }'
```

**If test numbers work but real numbers don't:**
- Real number not verified/opted in
- Need approved template for first message
- Production restrictions apply

## Step 8: Check Server Logs for Status Updates

### Look for Status Update Logs

**Successful delivery:**
```
[WhatsApp API Service] [status_xxx] ===== PROCESSING MESSAGE STATUS UPDATE =====
[WhatsApp API Service] [status_xxx] Status details extracted {
  wamId: "wamid.xxx...",
  statusValue: "delivered"
}
[WhatsApp API Service] [status_xxx] 📱 MESSAGE DELIVERED TO RECIPIENT
```

**Failed delivery:**
```
[WhatsApp API Service] [status_xxx] ❌ MESSAGE DELIVERY FAILED {
  error: {
    code: 131047,
    message: "Message failed to send"
  }
}
```

### If No Status Updates Appear

**Problem:** Webhook not receiving updates

**Check:**
1. Webhook URL is correct and accessible
2. Webhook is subscribed to `message_status`
3. Webhook verification token matches
4. Server is receiving webhook requests (check logs)

## Step 9: Verify Phone Number

### Check Phone Number Format
- ✅ Correct: `919876543210` (12 digits, no +, no spaces)
- ❌ Wrong: `+91 9876543210`
- ❌ Wrong: `91-9876543210`
- ❌ Wrong: `9876543210` (missing country code)

### Verify in Meta Dashboard
1. Go to WhatsApp → Phone Numbers
2. Check if number is verified
3. For sandbox: Add to test numbers list
4. For production: Ensure recipient opted in

## Step 10: Check Message Content

### Template Requirements (First Message)
- Must use approved template
- Cannot be free-form text
- Template must be approved by Meta

### Content Restrictions
- No spam keywords
- No promotional content (unless template approved)
- Follow Meta's messaging policies

## Diagnostic Commands

### Check Message Status
```bash
# Get status from database
curl -X GET "https://your-api.com/api/whatsapp/messages/msg_xxx/status" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Check Meta status (if available)
curl -X GET "https://your-api.com/api/whatsapp/messages/msg_xxx/check-meta" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Check Recent Messages
```sql
SELECT 
  wam_id,
  phone_number,
  status,
  message_text,
  created_at,
  timestamp
FROM whatsapp_messages
WHERE tenant_id = 'your_tenant_id'
ORDER BY created_at DESC
LIMIT 10;
```

## Quick Checklist

- [ ] Message has WAM ID (Meta accepted it)
- [ ] Check database status (sent/delivered/read/failed)
- [ ] Check Meta Dashboard for message status
- [ ] Verify webhook is receiving status updates
- [ ] Check phone number format and verification
- [ ] Verify template requirements (first message)
- [ ] Check for rate limiting
- [ ] Review error messages in Meta Dashboard
- [ ] Test with Meta's test phone numbers
- [ ] Check webhook configuration and subscriptions

## Expected Behavior

### Successful Delivery Flow

1. **Server sends to Meta:**
   ```
   [WhatsApp API Service] ===== CALLING META API =====
   [WhatsApp API Service] ✅ MESSAGE ID EXTRACTED FROM META RESPONSE
   ```

2. **Meta accepts:**
   ```
   ✅✅✅ MESSAGE SENT SUCCESSFULLY ✅✅✅
   wamId: 'wamid.xxx...'
   ```

3. **Webhook receives status update (within seconds):**
   ```
   [WhatsApp API Service] ===== PROCESSING MESSAGE STATUS UPDATE =====
   [WhatsApp API Service] 📱 MESSAGE DELIVERED TO RECIPIENT
   ```

4. **Database updated:**
   ```sql
   status: 'delivered'
   ```

5. **Recipient receives message on device**

## If Still Not Working

1. **Check Meta Dashboard** - Most reliable source of truth
2. **Contact Meta Support** - If message shows as sent but not delivered
3. **Review Meta Documentation** - For latest requirements
4. **Check Meta Status Page** - For API outages

## Additional Resources

- [Meta WhatsApp Business API Docs](https://developers.facebook.com/docs/whatsapp)
- [Message Templates Guide](https://developers.facebook.com/docs/whatsapp/message-templates)
- [Webhook Setup Guide](https://developers.facebook.com/docs/whatsapp/webhooks)

---

**Last Updated:** January 25, 2026
