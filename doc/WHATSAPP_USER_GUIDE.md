# WhatsApp Configuration - User Guide

## Quick Setup Guide

### First Time Setup

1. **Get Your Credentials**
   - Go to [Meta Business Suite](https://business.facebook.com/)
   - Navigate to your App → WhatsApp → API Setup
   - Copy your **Access Token** and **Phone Number ID**

2. **Configure in PBooksPro**
   - Open Settings → WhatsApp Configuration
   - Enter your **Access Token** (API Key)
   - Enter your **Phone Number ID**
   - The system will auto-generate a **Verify Token** for you
   - Enter your **Webhook URL**: `https://your-server.com/api/whatsapp/webhook`

3. **Configure Meta Webhook**
   - Go back to Meta App Dashboard
   - Navigate to WhatsApp → Configuration
   - Click "Edit" next to Webhook
   - Enter your Webhook URL
   - Enter the Verify Token (copy from PBooksPro)
   - Subscribe to webhook events

4. **Test Connection**
   - Click "Test Connection" button in PBooksPro
   - Wait for the 🟢 **Connected** badge
   - If you see 🔴 **Disconnected**, check your credentials

5. **Send Test Message**
   - Scroll to "Send Test Message" section
   - Enter a phone number (e.g., 919876543210 for India)
   - Click "Send Test Message"
   - Check WhatsApp on that number

## Understanding Connection Status

### 🟢 Connected
- **Meaning:** Your WhatsApp integration is working perfectly
- **What you can do:** Send messages, receive messages, use all features
- **Action:** No action needed, you're good to go!

### 🔴 Disconnected
- **Meaning:** Cannot connect to WhatsApp API
- **Possible causes:**
  - Invalid or expired Access Token
  - Incorrect Phone Number ID
  - Network issues
  - WhatsApp API service down
- **Action:** Click "Test Connection" to retry, or update credentials

### 🔵 Unknown
- **Meaning:** Configuration exists but hasn't been tested yet
- **Action:** Click "Test Connection" to check status

## After Login / Reload

When you log back in or reload the page:

✅ **API Key is preserved** - Shows as `••••••••••••••••`  
✅ **Verify Token is loaded** - No need to regenerate  
✅ **Connection auto-tested** - Status updates automatically  
✅ **All settings restored** - Phone Number ID, Webhook URL, etc.  

You don't need to re-enter your API key unless you want to change it.

## Updating Configuration

### To Update Non-Sensitive Fields
1. Change Phone Number ID, Webhook URL, etc.
2. Leave API Key as `••••••••••••••••` (keeps existing)
3. Click "Update Configuration"

### To Update API Key
1. Clear the API Key field
2. Enter new Access Token
3. Click "Update Configuration"

## Sending Test Messages

### Phone Number Format

✅ **Correct formats:**
- `919876543210` (India)
- `1234567890` (USA)
- `447700900000` (UK)

❌ **Incorrect formats:**
- `+919876543210` (no + sign)
- `+1-234-567-8900` (no dashes or spaces)
- `91 9876543210` (no spaces)

### Message Guidelines

**For Testing (Sandbox):**
- Any message text works
- No template required

**For Production:**
- First message to new contact requires approved template
- Reply messages can be free-form
- 24-hour conversation window applies

## Troubleshooting

### "Connection test failed"

**Check:**
1. Access Token is valid and not expired
2. Phone Number ID is correct
3. Meta app has WhatsApp product enabled
4. API permissions are granted

**Fix:**
- Go to Meta Dashboard and verify credentials
- Try generating a new Access Token
- Ensure Phone Number is verified in Meta

### "Failed to send test message"

**Check:**
1. Connection status is 🟢 Connected
2. Phone number format is correct (no + or spaces)
3. Message templates are approved (production only)

**Fix:**
- Test connection first
- Use correct phone number format
- For production, use approved templates

### "API key is required"

**Cause:** Trying to save new configuration without API key

**Fix:** Enter your Access Token from Meta Dashboard

### Can't see Test Message section

**Cause:** Not connected to WhatsApp

**Fix:** 
1. Configure your credentials
2. Click "Test Connection"
3. Wait for 🟢 Connected status
4. Test Message section will appear

## Security Notes

🔒 **Your API key is encrypted** - Stored securely in database  
🔒 **Never exposed in responses** - Only a flag indicates it exists  
🔒 **Placeholder in UI** - `••••••••••••••••` prevents exposure  
🔒 **HTTPS required** - Webhook URL must use HTTPS  

## Best Practices

### Development
- Use Meta's test phone numbers
- Test thoroughly before production
- Keep separate staging and production configs

### Production
- Use approved message templates
- Monitor connection status regularly
- Keep Access Token secure
- Rotate tokens periodically

### Maintenance
- Test connection after any Meta app changes
- Update webhook URL if server changes
- Monitor WhatsApp API quotas and limits

## Common Questions

### Q: Do I need to re-enter my API key after logging out?
**A:** No! The key is stored securely. You'll see `••••••••••••••••` placeholder.

### Q: How do I know if WhatsApp is working?
**A:** Look for the 🟢 **Connected** badge at the top of the configuration page.

### Q: Can I test without configuring the webhook in Meta?
**A:** Yes! Outgoing messages work without webhook. Webhook is only needed for receiving messages.

### Q: What if my Access Token expires?
**A:** You'll see 🔴 **Disconnected** status. Generate a new token in Meta Dashboard and update it in PBooksPro.

### Q: Can I use the same configuration on staging and production?
**A:** Not recommended. Use separate WhatsApp numbers and configurations for each environment.

## Getting Help

If you encounter issues:

1. Check the connection status indicator
2. Try "Test Connection" button
3. Review Meta App Dashboard for errors
4. Check server logs for detailed error messages
5. Verify all credentials are correct

For technical support, contact your system administrator with:
- Screenshot of error message
- Connection status (🟢/🔴/🔵)
- When the issue started
- What you were trying to do

---

**Need more help?** Check the [WhatsApp Business API Documentation](https://developers.facebook.com/docs/whatsapp)
