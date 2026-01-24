# WhatsApp Business API Testing Guide

This guide will help you test your WhatsApp number that's ready in Meta Business Account.

## Prerequisites

✅ Your WhatsApp number is approved and ready in Meta Business Account  
✅ You have access to Meta App Dashboard  
✅ Your application server is running  

---

## Step 1: Get Your Credentials from Meta Business Account

1. **Go to Meta App Dashboard**
   - Visit: https://developers.facebook.com/apps
   - Select your app (or create a new one)

2. **Navigate to WhatsApp Setup**
   - In the left sidebar, click **"WhatsApp"** → **"API Setup"**
   - You'll see your credentials here

3. **Collect Required Information:**
   - **Access Token** (Temporary or Permanent)
     - Click "Generate access token" or use existing token
     - Copy the token (you'll need this)
   
   - **Phone Number ID**
     - Found under "From" phone number
     - It's a long number like: `123456789012345`
   
   - **Business Account ID** (Optional)
     - Found in Business Settings
     - Not always required

4. **Note Your Webhook URL**
   - You'll need your public API server URL
   - Format: `https://your-api-server.com/api/whatsapp/webhook`
   - Example: `https://pbookspro-api-staging.onrender.com/api/whatsapp/webhook`

---

## Step 2: Configure WhatsApp in Your Application

### Option A: Using the Application UI (Recommended)

1. **Open Settings**
   - Log in to your application
   - Navigate to **Settings** (gear icon in header or sidebar)

2. **Access WhatsApp Integration**
   - In Settings, look for **"WhatsApp Integration"** or **"Preferences"**
   - Click on **"WhatsApp Integration"** card/button

3. **Enter Your Credentials**
   - **Access Token (API Key)**: Paste your Meta access token
   - **Phone Number ID**: Enter your Phone Number ID
   - **Business Account ID**: (Optional) Enter if you have it
   - **Webhook Verify Token**: 
     - Click "Generate New Token" or enter a random secure string
     - **IMPORTANT**: Save this token - you'll need it for Meta webhook setup
   - **Webhook URL**: Enter your public API URL + `/api/whatsapp/webhook`
     - Example: `https://pbookspro-api-staging.onrender.com/api/whatsapp/webhook`

4. **Test Connection**
   - Click **"Test Connection"** button
   - Wait for the result:
     - ✅ **Success**: "Connection successful!" - Your credentials are valid
     - ❌ **Failed**: Check error message and verify your credentials

5. **Save Configuration**
   - If test is successful, click **"Save Configuration"**
   - You should see: "WhatsApp configuration saved successfully!"

---

## Step 3: Configure Webhook in Meta Dashboard

1. **Go to Meta App Dashboard**
   - Navigate to **WhatsApp** → **Configuration**

2. **Set Webhook URL**
   - **Callback URL**: Enter your webhook URL
     - Example: `https://pbookspro-api-staging.onrender.com/api/whatsapp/webhook`
   - **Verify Token**: Enter the same token you saved in Step 2
   - Click **"Verify and Save"**

3. **Subscribe to Webhook Fields**
   - Check the following fields:
     - ✅ `messages`
     - ✅ `message_status`
   - Click **"Save"**

---

## Step 4: Test Sending a Message

### Option A: Test via Application UI

1. **Go to Contacts**
   - Navigate to **Contacts** page
   - Select a contact with a valid phone number

2. **Send WhatsApp Message**
   - Click the WhatsApp icon next to the contact
   - Or use the "Send WhatsApp" button
   - Type a test message
   - Click **"Send"**

3. **Check Result**
   - If successful, the message will be sent via API
   - Check the contact's WhatsApp to confirm receipt

### Option B: Test via API (Using curl or Postman)

1. **Get Your Authentication Token**
   - Login to your application
   - Get your JWT token from browser DevTools (Application → Local Storage)

2. **Send Test Message**
   ```bash
   curl -X POST http://localhost:3000/api/whatsapp/send \
     -H "Authorization: Bearer YOUR_JWT_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{
       "phoneNumber": "1234567890",
       "message": "Hello! This is a test message from PBooksPro."
     }'
   ```

   **Note:**
   - Replace `YOUR_JWT_TOKEN` with your actual token
   - Replace `1234567890` with recipient's phone number (international format, no +)
   - Replace `localhost:3000` with your API server URL if different

3. **Expected Response:**
   ```json
   {
     "messageId": "msg_1234567890_abc123",
     "wamId": "wamid.xyz...",
     "status": "sent"
   }
   ```

---

## Step 5: Verify Message Delivery

1. **Check Recipient's WhatsApp**
   - The recipient should receive the message
   - Message will appear from your WhatsApp Business number

2. **Check Application**
   - Go to **WhatsApp Messages** (if available in header/chat icon)
   - You should see the sent message in the conversation

3. **Check Database** (Optional)
   ```sql
   SELECT * FROM whatsapp_messages 
   WHERE tenant_id = 'your_tenant_id' 
   ORDER BY timestamp DESC 
   LIMIT 5;
   ```

---

## Troubleshooting

### ❌ "Connection test failed"

**Possible Causes:**
1. **Invalid Access Token**
   - Token may have expired
   - Generate a new token in Meta Dashboard
   - Make sure you copied the full token

2. **Wrong Phone Number ID**
   - Verify the Phone Number ID in Meta Dashboard
   - It should be a long numeric string

3. **API Version Mismatch**
   - Check if your API version matches
   - Default is `v21.0`

**Solution:**
- Double-check all credentials
- Regenerate access token if needed
- Verify Phone Number ID is correct

---

### ❌ "Failed to send message"

**Possible Causes:**
1. **Phone Number Format**
   - Must be in international format (without +)
   - Example: `923001234567` (Pakistan) or `1234567890` (US)

2. **Recipient Not Registered**
   - Recipient must have WhatsApp installed
   - Number must be valid WhatsApp number

3. **Message Template Required**
   - For first message to a new contact, you may need an approved template
   - Check Meta Dashboard for template requirements

4. **Rate Limiting**
   - Too many messages sent
   - Wait a few minutes and try again

**Solution:**
- Verify phone number format
- Ensure recipient has WhatsApp
- Check Meta Dashboard for any restrictions

---

### ❌ "Webhook verification failed"

**Possible Causes:**
1. **Wrong Verify Token**
   - Token in Meta Dashboard must match token in application
   - Check both places

2. **Webhook URL Not Accessible**
   - Your API server must be publicly accessible
   - Test the URL in browser: `https://your-api.com/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=YOUR_TOKEN&hub.challenge=test`

**Solution:**
- Verify webhook URL is correct and accessible
- Ensure verify token matches exactly
- Check server logs for webhook requests

---

## Testing Checklist

- [ ] Credentials collected from Meta Dashboard
- [ ] WhatsApp configuration saved in application
- [ ] Connection test successful
- [ ] Webhook configured in Meta Dashboard
- [ ] Webhook verification successful
- [ ] Test message sent successfully
- [ ] Message received by recipient
- [ ] Message appears in application chat history

---

## Next Steps

Once testing is successful:

1. **Set Up Message Templates** (for production)
   - Create approved templates in Meta Dashboard
   - Use templates for initial messages to new contacts

2. **Configure Auto-Responses**
   - Set up automated responses for common queries
   - Configure business hours responses

3. **Monitor Message Status**
   - Track delivery rates
   - Monitor for failed messages
   - Set up alerts for errors

4. **Integrate with Invoices**
   - Test sending invoices via WhatsApp
   - Configure invoice message templates

---

## Quick Reference

### API Endpoints

- **Get Config**: `GET /api/whatsapp/config`
- **Save Config**: `POST /api/whatsapp/config`
- **Test Connection**: `POST /api/whatsapp/test-connection`
- **Send Message**: `POST /api/whatsapp/send`
- **Get Messages**: `GET /api/whatsapp/messages`
- **Webhook**: `GET/POST /api/whatsapp/webhook`

### Required Fields

- ✅ Access Token (API Key)
- ✅ Phone Number ID
- ✅ Webhook Verify Token
- ⚪ Business Account ID (Optional)
- ⚪ API Secret (Optional)

---

## Support

If you encounter issues:

1. Check server logs for detailed error messages
2. Verify all credentials in Meta Dashboard
3. Test webhook URL accessibility
4. Check phone number format
5. Review Meta API documentation: https://developers.facebook.com/docs/whatsapp/cloud-api

---

**Last Updated**: January 2025
