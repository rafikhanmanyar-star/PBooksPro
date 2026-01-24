# WhatsApp Webhook Verification Troubleshooting

## Problem: "The callback URL or verify token couldn't be validated"

This error occurs when Meta cannot verify your webhook endpoint. Here's how to fix it.

---

## Step-by-Step Troubleshooting

### Step 1: Verify Your Configuration is Saved

1. **Check Application Settings**
   - Go to Settings → WhatsApp Integration
   - Verify that:
     - ✅ Access Token is saved
     - ✅ Phone Number ID is saved
     - ✅ **Webhook Verify Token** is saved (this is critical!)
     - ✅ Webhook URL is saved

2. **Verify Token Must Match Exactly**
   - The token in your application MUST match the token in Meta Dashboard
   - Copy the token from your application
   - Paste it exactly (no extra spaces) in Meta Dashboard

---

### Step 2: Test Webhook URL Accessibility

Your webhook URL must be publicly accessible. Test it:

1. **Test in Browser**
   - Open: `https://pbookspro-api-staging.onrender.com/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=YOUR_TOKEN&hub.challenge=test123`
   - Replace `YOUR_TOKEN` with your actual verify token
   - **Expected Result**: Should return `test123` (the challenge string)
   - **If Error**: Your server is not accessible or endpoint is wrong

2. **Check Server Logs**
   - Look for webhook verification attempts in your server logs
   - You should see: "Webhook verified successfully for tenant: ..."
   - If you see: "Webhook verification failed: Invalid verify token" → Token mismatch

---

### Step 3: Verify Database Configuration

The webhook endpoint looks up the verify token in the database. Check:

1. **Query Database** (if you have access):
   ```sql
   SELECT tenant_id, verify_token, is_active 
   FROM whatsapp_configs 
   WHERE is_active = TRUE;
   ```

2. **Verify Token Format**
   - Token should be stored exactly as entered
   - No extra spaces or characters
   - Case-sensitive (if applicable)

---

### Step 4: Common Issues and Solutions

#### Issue 1: Token Not Saved in Database

**Symptom**: Webhook verification fails immediately

**Solution**:
1. Go to Settings → WhatsApp Integration
2. Re-enter your verify token
3. Click "Save Configuration"
4. Try verification again in Meta Dashboard

---

#### Issue 2: Server Not Responding

**Symptom**: Timeout or connection error

**Solution**:
1. **Check Server Status**
   - Ensure your API server is running
   - Check if Render/your hosting service shows the server as "Live"

2. **Check Server Logs**
   - Look for incoming GET requests to `/api/whatsapp/webhook`
   - Check for any errors

3. **Test Endpoint Manually**
   ```bash
   curl "https://pbookspro-api-staging.onrender.com/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=YOUR_TOKEN&hub.challenge=test"
   ```
   - Should return: `test`
   - If error, check server configuration

---

#### Issue 3: Token Mismatch

**Symptom**: "Invalid verify token" in logs

**Solution**:
1. **Get Token from Application**
   - Go to Settings → WhatsApp Integration
   - Copy the verify token (or generate a new one)
   - **IMPORTANT**: Copy it exactly, including all characters

2. **Update Meta Dashboard**
   - Go to WhatsApp → Configuration → Webhooks
   - Paste the token in "Verify token" field
   - Make sure there are no extra spaces

3. **Try Verification Again**

---

#### Issue 4: Wrong Webhook URL

**Symptom**: 404 Not Found

**Solution**:
1. **Verify URL Format**
   - Must be: `https://your-domain.com/api/whatsapp/webhook`
   - Must use HTTPS (not HTTP)
   - Must be publicly accessible

2. **Check Route Registration**
   - Ensure webhook route is registered in your server
   - Check `server/api/index.ts` for webhook route

---

### Step 5: Manual Verification Test

Test the webhook endpoint manually:

```bash
# Replace YOUR_TOKEN with your actual verify token
curl -X GET "https://pbookspro-api-staging.onrender.com/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=YOUR_TOKEN&hub.challenge=test123"
```

**Expected Response**: `test123`

**If you get an error**:
- `403 Forbidden` → Token mismatch or not in database
- `400 Bad Request` → Missing parameters
- `404 Not Found` → Wrong URL or route not registered
- `500 Internal Server Error` → Server error, check logs
- `Connection timeout` → Server not accessible

---

### Step 6: Reconfigure from Scratch

If nothing works, reconfigure:

1. **In Application**:
   - Go to Settings → WhatsApp Integration
   - Click "Generate New Token" for verify token
   - Copy the new token
   - Save configuration

2. **In Meta Dashboard**:
   - Go to WhatsApp → Configuration → Webhooks
   - Enter the new verify token
   - Enter webhook URL: `https://pbookspro-api-staging.onrender.com/api/whatsapp/webhook`
   - Click "Verify and Save"

3. **Wait a Few Seconds**
   - Meta may take 10-30 seconds to verify
   - Check server logs for verification attempt

---

## Verification Checklist

Before trying verification in Meta Dashboard:

- [ ] WhatsApp configuration is saved in application
- [ ] Verify token is visible and copied correctly
- [ ] Webhook URL is correct and accessible
- [ ] Server is running and responding
- [ ] Database has the verify token stored
- [ ] Manual curl test returns the challenge string

---

## Debugging Steps

1. **Check Server Logs** (Most Important!)
   ```bash
   # Look for these log messages:
   - "Webhook verified successfully for tenant: ..." ✅
   - "Webhook verification failed: Invalid verify token" ❌
   - "Error verifying webhook: ..." ❌
   ```

2. **Test Webhook Endpoint**
   ```bash
   curl -v "https://pbookspro-api-staging.onrender.com/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=YOUR_TOKEN&hub.challenge=test"
   ```

3. **Verify Database Entry**
   ```sql
   SELECT * FROM whatsapp_configs WHERE is_active = TRUE;
   ```

4. **Check Application Configuration**
   - Settings → WhatsApp Integration
   - Verify all fields are filled
   - Copy verify token exactly

---

## Quick Fix: Regenerate Token

If you're stuck, regenerate the verify token:

1. **In Application**:
   - Settings → WhatsApp Integration
   - Click "Generate New Token"
   - Copy the new token
   - Click "Save Configuration"

2. **In Meta Dashboard**:
   - WhatsApp → Configuration → Webhooks
   - Paste the NEW token
   - Click "Verify and Save"

---

## Still Not Working?

If verification still fails after all steps:

1. **Check Server Status**
   - Is the server running?
   - Is it accessible from the internet?
   - Check hosting service status page

2. **Check Route Registration**
   - Verify webhook route is registered
   - Check `server/api/index.ts`:
     ```typescript
     app.use('/api/whatsapp/webhook', whatsappWebhookRouter);
     ```

3. **Check Database Connection**
   - Ensure database is accessible
   - Verify `whatsapp_configs` table exists
   - Check if configuration is saved

4. **Contact Support**
   - Share server logs
   - Share the exact error message
   - Share verify token (first/last few characters only for security)

---

## Expected Behavior

When verification succeeds:

1. **Meta Dashboard**: Shows "Webhook verified" ✅
2. **Server Logs**: "Webhook verified successfully for tenant: ..."
3. **Browser Test**: Returns challenge string
4. **Status**: Green checkmark in Meta Dashboard

---

**Last Updated**: January 2025
