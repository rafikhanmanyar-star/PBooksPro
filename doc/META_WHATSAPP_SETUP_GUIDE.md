# Step-by-Step Guide: Meta Business Account & WhatsApp API Integration

This guide walks you through creating a Meta Business Account and setting up WhatsApp Business API integration using the latest Meta portal (2024).

## Prerequisites

- A Facebook account (personal account)
- A business email address
- A phone number not currently associated with WhatsApp
- Business verification documents (for full access)
- A publicly accessible webhook URL for receiving messages

---

## Part 1: Create Meta Business Account

### Step 1: Access Meta Business Suite

1. Navigate to [Meta Business Suite](https://business.facebook.com/)
2. Log in with your Facebook credentials
3. If you don't have a business account, you'll be prompted to create one

### Step 2: Create Business Portfolio

1. Click **"Create Account"** or **"Get Started"**
2. Fill in your business details:
   - **Business Name**: Your official business name
   - **Your Name**: Your full name
   - **Business Email**: A business email address (not personal)
3. Click **"Submit"** to create your business account

### Step 3: Verify Your Business Email

1. Check your email inbox for a verification message from Meta
2. Click the verification link in the email
3. Your email will be verified and you'll be redirected back to Meta Business Suite

### Step 4: Complete Business Profile

1. In Meta Business Suite, go to **"Business Settings"** (gear icon in the top right)
2. Navigate to **"Business Info"**
3. Complete your business profile:
   - Business address
   - Phone number
   - Website (if applicable)
   - Business category
   - Business description

---

## Part 2: Verify Your Business (Recommended for Production)

Business verification is required to:
- Remove messaging limits
- Access full API features
- Use message templates
- Increase sending limits

### Step 1: Start Business Verification

1. In **Meta Business Suite**, go to **"Business Settings"**
2. Navigate to **"Security Center"** (in the left sidebar)
3. Click **"Start Verification"** button

### Step 2: Provide Business Information

1. Enter your **Legal Business Name** (must match official documents)
2. Enter your **Business Address**
3. Enter your **Business Phone Number**
4. Enter your **Business Website** (if applicable)
5. Click **"Next"**

### Step 3: Choose Verification Method

Meta offers two verification methods:

**Option A: Phone Verification**
- Enter a phone number that can receive SMS or voice calls
- You'll receive a verification code
- Enter the code to verify

**Option B: Document Verification**
- Upload official business documents:
  - Business license
  - Tax registration certificate
  - Articles of incorporation
  - Bank statement
  - Utility bill (with business address)

### Step 4: Submit and Wait for Approval

1. Review all information
2. Click **"Submit"**
3. Meta will review your submission (typically 10 minutes to 14 days)
4. You'll receive email notifications about the verification status
5. Check **"Security Center"** for updates

---

## Part 3: Create Meta App for WhatsApp

### Step 1: Access Meta for Developers

1. Navigate to [Meta for Developers](https://developers.facebook.com/)
2. Log in with your Facebook account (same account used for Business Suite)
3. If this is your first time, you may need to accept developer terms

### Step 2: Create a New App

1. Click **"My Apps"** in the top right corner
2. Click **"Create App"** button
3. You'll see different app types

### Step 3: Select App Type

1. Choose **"Business"** as the app type
2. Click **"Next"**

### Step 4: Configure App Details

1. Fill in the required information:
   - **App Name**: Choose a name for your app (e.g., "PBooksPro WhatsApp")
   - **App Contact Email**: Your business email
   - **Business Account**: Select your Meta Business Account (created in Part 1)
2. Click **"Create App"**

### Step 5: Add WhatsApp Product

1. In your app dashboard, scroll down to **"Add Products to Your App"** section
2. Find **"WhatsApp"** product card
3. Click **"Set Up"** button
4. Review and accept the **WhatsApp Business API Terms and Conditions**
5. Click **"Continue"**

---

## Part 4: Configure WhatsApp Business API

### Step 1: Access API Setup

1. In your app dashboard, click **"WhatsApp"** in the left sidebar
2. Click **"API Setup"** (or **"Getting Started"**)
3. You'll see the API setup page with important information

### Step 2: Note Your Test Credentials

Meta provides test credentials for development:

1. **Temporary Access Token**: 
   - Displayed on the API Setup page
   - ⚠️ **Expires in 24 hours** - only for testing
   - Copy and save this token temporarily

2. **Test Phone Number**:
   - Meta provides a test phone number
   - Note the **Phone Number ID** (displayed on the page)
   - Format: Usually a long numeric string

3. **App ID**:
   - Your app's unique identifier
   - Found in **"Settings" > "Basic"**

### Step 3: Add Your Phone Number

1. In **"API Setup"**, scroll to **"Phone Numbers"** section
2. Click **"Add Phone Number"** button
3. You'll be guided through a setup wizard:

   **Step 3a: Business Information**
   - Confirm your business details
   - Click **"Next"**

   **Step 3b: WhatsApp Business Profile**
   - **Business Display Name**: The name customers will see
   - **Category**: Select your business category
   - **Description**: Brief description of your business
   - **Profile Picture**: Upload your business logo (optional)
   - Click **"Next"**

   **Step 3c: Phone Number Entry**
   - Enter a phone number **NOT currently associated with WhatsApp**
   - Must be able to receive SMS or voice calls
   - Include country code (e.g., +1 for US, +91 for India)
   - Click **"Next"**

   **Step 3d: Verify Phone Number**
   - Choose verification method:
     - **SMS**: Receive 6-digit code via SMS
     - **Voice Call**: Receive code via automated call
   - Enter the 6-digit verification code
   - Click **"Verify"**

4. Once verified, your phone number will appear in the list
5. **Note the Phone Number ID** for this number (different from test number)

---

## Part 5: Generate Permanent Access Token

The temporary token expires in 24 hours. For production, you need a permanent token.

### Step 1: Create System User

1. Go to [Meta Business Suite](https://business.facebook.com/)
2. Navigate to **"Business Settings"**
3. In the left sidebar, go to **"Users"** > **"System Users"**
4. Click **"Add"** button
5. Fill in:
   - **System User Name**: e.g., "WhatsApp API User"
   - **System User Role**: Select **"Admin"**
6. Click **"Create System User"**

### Step 2: Assign Assets to System User

1. Find your newly created system user in the list
2. Click on the user name
3. Click **"Assign Assets"** button
4. Select **"Apps"** tab
5. Find your WhatsApp app and toggle it **ON**
6. Select permissions:
   - ✅ **Admin** (full access)
7. Click **"Save Changes"**

### Step 3: Generate Access Token

1. Still in the System User page, click **"Generate New Token"** button
2. Select your app from the dropdown
3. Select the following permissions (scopes):
   - ✅ `whatsapp_business_management`
   - ✅ `whatsapp_business_messaging`
   - ✅ `business_management`
4. Click **"Generate Token"**
5. **⚠️ IMPORTANT**: Copy the token immediately - it's shown only once!
6. Store it securely (you'll use this in your application)

### Step 4: Verify Token Permissions

1. Go back to your app dashboard: [developers.facebook.com](https://developers.facebook.com/)
2. Navigate to **"WhatsApp" > "API Setup"**
3. Your permanent token should now be displayed (if you refresh)
4. Note: You can regenerate tokens if needed, but the old one will be invalidated

---

## Part 6: Set Up Webhooks

Webhooks allow Meta to send real-time notifications about incoming messages, message status updates, etc.

### Step 1: Prepare Your Webhook Endpoint

Before configuring in Meta, ensure you have:

1. A **publicly accessible URL** for your webhook endpoint
   - Format: `https://your-domain.com/api/whatsapp/webhook`
   - Must use HTTPS (not HTTP)
   - Must be accessible from the internet (not localhost)

2. A **Verify Token** (a random string you create)
   - Example: `my_secure_verify_token_12345`
   - Store this securely - you'll need it in your code

### Step 2: Configure Webhook in Meta Dashboard

1. In your app dashboard, go to **"WhatsApp" > "Configuration"**
2. Find the **"Webhook"** section
3. Click **"Edit"** button next to Webhook

### Step 3: Enter Webhook Details

1. **Callback URL**: 
   - Enter your public webhook URL
   - Example: `https://api.yourdomain.com/api/whatsapp/webhook`

2. **Verify Token**:
   - Enter the verify token you created
   - This must match the token in your webhook verification code

3. Click **"Verify and Save"**

### Step 4: Webhook Verification Process

Meta will immediately attempt to verify your webhook:

1. Meta sends a GET request to your callback URL with:
   - `hub.mode=subscribe`
   - `hub.verify_token=your_verify_token`
   - `hub.challenge=random_string`

2. Your server must:
   - Check if `hub.verify_token` matches your stored token
   - If match: Return `hub.challenge` as plain text (HTTP 200)
   - If no match: Return HTTP 403

3. If verification succeeds, you'll see **"Webhook verified"** in Meta dashboard

### Step 5: Subscribe to Webhook Fields

After verification, subscribe to the fields you want to receive:

1. In **"WhatsApp" > "Configuration"**, find **"Webhook Fields"**
2. Click **"Manage"** or **"Subscribe"**
3. Select the fields you need:
   - ✅ **messages**: Incoming and outgoing messages
   - ✅ **message_status**: Delivery and read receipts
   - ✅ **message_template_status_update**: Template approval status
4. Click **"Save"**

---

## Part 7: Configure Your Application

Now that you have all the credentials from Meta, configure your application.

### Step 1: Gather Required Information

You need the following from Meta:

- ✅ **Access Token**: Permanent token from System User (Part 5, Step 3)
- ✅ **Phone Number ID**: From API Setup page (Part 4, Step 2 or 3)
- ✅ **Business Account ID**: Found in Business Settings > Business Info
- ✅ **App ID**: Found in App Settings > Basic
- ✅ **Webhook Verify Token**: The token you created (Part 6, Step 1)
- ✅ **Webhook URL**: Your public webhook endpoint (Part 6, Step 1)

### Step 2: Configure in Your Application

1. **Access Token** → Use as `apiKey` in WhatsApp config
2. **Phone Number ID** → Use as `phoneNumberId` in WhatsApp config
3. **Business Account ID** → Use as `businessAccountId` (optional)
4. **Webhook Verify Token** → Use in webhook verification endpoint
5. **Webhook URL** → Configure in Meta dashboard (already done)

### Step 3: Test Connection

Use the test connection endpoint in your application:

```bash
POST /api/whatsapp/test-connection
Authorization: Bearer YOUR_JWT_TOKEN
```

This should return success if credentials are valid.

---

## Part 8: Send Your First Message

### Step 1: Understand Message Types

**Template Messages** (Required for initial messages):
- Must be pre-approved by Meta
- Used for business-initiated conversations
- Submit templates in Meta dashboard

**Session Messages** (Free-form):
- Can only be sent within 24-hour window after customer messages you
- No template approval needed
- Can send any text

### Step 2: Send Test Message (Development)

For testing, you can send messages to:
- Your own WhatsApp number (if added to test numbers)
- Numbers in your Meta test suite

```bash
POST /api/whatsapp/send
Authorization: Bearer YOUR_JWT_TOKEN
Content-Type: application/json

{
  "phoneNumber": "1234567890",
  "message": "Hello, this is a test message!"
}
```

### Step 3: Create Message Templates (Production)

1. In Meta dashboard, go to **"WhatsApp" > "Message Templates"**
2. Click **"Create Template"**
3. Fill in:
   - **Template Name**: Unique identifier (e.g., "welcome_message")
   - **Category**: Select appropriate category
   - **Language**: Select language
   - **Content**: Your message template
4. Submit for approval
5. Wait for approval (usually 24-48 hours)

---

## Part 9: Production Checklist

Before going live, ensure:

- [ ] Business verification is complete
- [ ] Permanent access token is generated and stored securely
- [ ] Phone number is verified and active
- [ ] Webhook is configured and verified
- [ ] Webhook fields are subscribed
- [ ] Message templates are approved (if using)
- [ ] Webhook endpoint is publicly accessible (HTTPS)
- [ ] Error handling is implemented
- [ ] Rate limiting is considered
- [ ] Logging and monitoring are set up

---

## Part 10: Common Issues & Solutions

### Issue: Webhook Verification Fails

**Solutions:**
- Ensure your webhook URL is publicly accessible
- Check that verify token matches exactly
- Verify HTTPS certificate is valid
- Check server logs for incoming requests
- Ensure endpoint returns challenge string, not JSON

### Issue: Access Token Expired

**Solutions:**
- Generate a new permanent token from System User
- Update token in your application configuration
- Consider implementing token refresh logic

### Issue: Messages Not Sending

**Solutions:**
- Verify phone number is approved
- Check if you're using templates for initial messages
- Ensure you're within 24-hour window for session messages
- Check API response for error codes
- Verify rate limits aren't exceeded

### Issue: Webhooks Not Receiving

**Solutions:**
- Verify webhook is subscribed to correct fields
- Check webhook URL is accessible
- Review webhook delivery logs in Meta dashboard
- Ensure webhook signature verification is working
- Check firewall/security settings

### Issue: Business Verification Pending

**Solutions:**
- Wait for review (can take up to 14 days)
- Ensure documents are clear and match business info
- Check email for any requests for additional information
- Contact Meta support if stuck for more than 14 days

---

## API Version Information

Meta regularly updates their API. As of 2024, the current version is typically **v21.0** or later.

To check the latest version:
1. Go to [Meta for Developers](https://developers.facebook.com/docs/whatsapp)
2. Check the API reference for the latest version
3. Update your `META_API_VERSION` environment variable accordingly

---

## Security Best Practices

1. **Never commit tokens to version control**
   - Use environment variables
   - Use secure secret management

2. **Encrypt API keys in database**
   - Use encryption service (as implemented in your app)
   - Store encryption key securely

3. **Verify webhook signatures**
   - Always verify `X-Hub-Signature-256` header
   - Prevents unauthorized webhook calls

4. **Use HTTPS only**
   - All webhook URLs must use HTTPS
   - Valid SSL certificate required

5. **Rotate tokens periodically**
   - Regenerate access tokens every 90 days
   - Revoke old tokens when generating new ones

6. **Limit token permissions**
   - Only grant necessary permissions
   - Use least privilege principle

---

## Additional Resources

- **Meta WhatsApp Business API Documentation**: 
  https://developers.facebook.com/docs/whatsapp/cloud-api

- **Webhook Setup Guide**: 
  https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks

- **Message Templates Guide**: 
  https://developers.facebook.com/docs/whatsapp/business-management-api/message-templates

- **API Reference**: 
  https://developers.facebook.com/docs/whatsapp/cloud-api/reference

- **Meta Business Help Center**: 
  https://www.facebook.com/business/help

- **Meta Developer Community**: 
  https://developers.facebook.com/community

---

## Next Steps

After completing this setup:

1. **Test the integration** using the test endpoints
2. **Configure in your application** using the Settings page
3. **Send test messages** to verify everything works
4. **Set up monitoring** for webhook delivery
5. **Create message templates** for production use
6. **Monitor API usage** and rate limits
7. **Set up alerts** for failed messages or webhook issues

---

## Support

If you encounter issues:

1. Check Meta's status page: https://developers.facebook.com/status
2. Review Meta's troubleshooting guides
3. Check your application logs
4. Contact Meta Business Support (if business verified)
5. Post in Meta Developer Community forums

---

**Last Updated**: 2024
**Meta Portal Version**: Latest (as of 2024)
