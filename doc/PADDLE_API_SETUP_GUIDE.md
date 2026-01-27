# Paddle API Setup Guide

This guide will help you retrieve all the necessary API information from your Paddle account to integrate payment processing into your application.

## 📋 Prerequisites

- You have created a Paddle account
- You have access to your Paddle dashboard
- Your account is verified (if required by Paddle)

---

## 🔑 Step 1: Access Paddle Dashboard

1. **Log in to Paddle:**
   - Go to: https://vendors.paddle.com/
   - Log in with your Paddle account credentials

2. **Navigate to Developer Tools:**
   - Once logged in, look for **"Developer Tools"** or **"Settings"** in the left sidebar
   - Click on **"Developer Tools"** → **"Authentication"**

---

## 🔐 Step 2: Get Your API Keys

### For Testing (Sandbox Mode):

1. **Switch to Sandbox Mode:**
   - In the Paddle dashboard, look for a toggle or dropdown to switch between **"Live"** and **"Sandbox"** mode
   - Switch to **"Sandbox"** mode for testing

2. **Get Sandbox API Keys:**
   - Navigate to: **Developer Tools** → **Authentication**
   - You'll see two types of keys:
     - **API Key (Secret Key)** - Keep this secret! Used for server-side operations
     - **Public Key** - Safe to use in client-side code
   - **Copy both keys** and save them securely

### For Production (Live Mode):

1. **Switch to Live Mode:**
   - Toggle to **"Live"** mode in the dashboard

2. **Get Live API Keys:**
   - Navigate to: **Developer Tools** → **Authentication**
   - Copy your **Live API Key (Secret Key)** and **Live Public Key**
   - ⚠️ **Important:** Never commit live keys to version control!

---

## 🆔 Step 3: Get Your Vendor ID

1. **Find Vendor ID:**
   - In the Paddle dashboard, go to **"Account"** or **"Settings"** → **"Account Details"**
   - Your **Vendor ID** is displayed here (usually a number like `123456`)
   - **Copy this Vendor ID**

   **Alternative location:**
   - Sometimes visible in the URL when viewing your account: `https://vendors.paddle.com/vendor/123456`
   - The number after `/vendor/` is your Vendor ID

---

## 🔔 Step 4: Set Up Webhooks

Webhooks allow Paddle to notify your server about payment events (purchases, refunds, subscriptions, etc.).

### Get Webhook Secret:

1. **Navigate to Webhooks:**
   - Go to: **Developer Tools** → **Notifications** (or **Webhooks**)

2. **Create/View Webhook Endpoint:**
   - Click **"Add Notification"** or **"Create Webhook"**
   - Enter your webhook URL (e.g., `https://api.pbookspro.com/api/payments/webhook/paddle`)
   - Select the events you want to receive:
     - `transaction.completed` - When payment is successful
     - `transaction.payment_failed` - When payment fails
     - `transaction.payment_declined` - When payment is declined
     - `transaction.refunded` - When refund is processed
     - `transaction.created` - When transaction is created
     - `transaction.updated` - When transaction is updated
     - And any other events you need

3. **Get Webhook Secret:**
   - After creating the webhook, Paddle will provide a **Webhook Secret** or **Signing Secret**
   - **Copy this secret** - you'll need it to verify webhook authenticity

---

## 📝 Step 5: Information Summary

After completing the steps above, you should have:

| Information | Location | Usage |
|------------|----------|-------|
| **Sandbox API Key** | Developer Tools → Authentication (Sandbox mode) | Server-side API calls (testing) |
| **Sandbox Public Key** | Developer Tools → Authentication (Sandbox mode) | Client-side integration (testing) |
| **Live API Key** | Developer Tools → Authentication (Live mode) | Server-side API calls (production) |
| **Live Public Key** | Developer Tools → Authentication (Live mode) | Client-side integration (production) |
| **Vendor ID** | Account Settings → Account Details | Required for API calls |
| **Webhook Secret** | Developer Tools → Notifications/Webhooks | Verify webhook authenticity |

---

## 🔧 Step 6: Environment Variables

Add these to your `.env` files:

### For Server (`server/.env`):

```env
# Payment Gateway Configuration
PAYMENT_GATEWAY=paddle
PAYMENT_SANDBOX=true  # Set to false for production

# Paddle Configuration
PADDLE_VENDOR_ID=your_vendor_id_here
PADDLE_API_KEY=your_sandbox_or_live_api_key
PADDLE_PUBLIC_KEY=your_sandbox_or_live_public_key
PADDLE_WEBHOOK_SECRET=your_webhook_secret
PADDLE_ENVIRONMENT=sandbox  # or 'live' for production
```

### For Render (Production):

Add these environment variables in your Render dashboard:

1. Go to your API service (`pbookspro-api`)
2. Navigate to **Environment** tab
3. Add the following variables:
   - `PAYMENT_GATEWAY` = `paddle`
   - `PAYMENT_SANDBOX` = `false`
   - `PADDLE_VENDOR_ID` = Your vendor ID
   - `PADDLE_API_KEY` = Your **LIVE** API key
   - `PADDLE_PUBLIC_KEY` = Your **LIVE** public key
   - `PADDLE_WEBHOOK_SECRET` = Your webhook secret
   - `PADDLE_ENVIRONMENT` = `live`

### For Render (Staging):

Add the same variables but use **Sandbox** keys:
   - `PAYMENT_GATEWAY` = `paddle`
   - `PAYMENT_SANDBOX` = `true`
   - `PADDLE_API_KEY` = Your **SANDBOX** API key
   - `PADDLE_PUBLIC_KEY` = Your **SANDBOX** public key
   - `PADDLE_ENVIRONMENT` = `sandbox`

---

## 🧪 Step 7: Testing Your Setup

### Test API Connection:

You can test your API key using curl or Postman:

```bash
# Test API connection (replace with your actual API key)
curl -X GET "https://sandbox-api.paddle.com/transactions" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json"
```

### Test Webhook:

1. Use Paddle's webhook testing tool in the dashboard
2. Or use a service like **ngrok** to expose your local server:
   ```bash
   ngrok http 3000
   ```
3. Use the ngrok URL as your webhook endpoint for testing:
   ```
   https://your-ngrok-url.ngrok.io/api/payments/webhook/paddle
   ```

---

## 📚 Additional Resources

- **Paddle API Documentation:** https://developer.paddle.com/
- **Paddle Webhook Events:** https://developer.paddle.com/webhook-reference/overview
- **Paddle SDKs:** https://developer.paddle.com/sdks/overview
- **Paddle Transaction API:** https://developer.paddle.com/api-reference/overview

---

## ⚠️ Security Best Practices

1. **Never commit API keys to Git:**
   - Always use environment variables
   - Add `.env` to `.gitignore`

2. **Use different keys for staging and production:**
   - Sandbox keys for testing
   - Live keys only in production environment

3. **Rotate keys regularly:**
   - If a key is compromised, regenerate it immediately in Paddle dashboard

4. **Verify webhook signatures:**
   - Always verify webhook requests using the webhook secret
   - Never trust unverified webhook payloads

5. **Use HTTPS for webhooks:**
   - Always use HTTPS endpoints for webhook URLs
   - Never use HTTP in production

---

## 🎯 Next Steps

After obtaining all the API information:

1. ✅ Add environment variables to your server configuration
2. ✅ Set up webhook endpoint in Paddle dashboard
3. ✅ Test with sandbox mode first
4. ✅ Verify webhook signature verification works
5. ✅ Test payment flow end-to-end
6. ✅ Switch to live mode when ready for production

---

## 🔍 Troubleshooting

### Common Issues:

1. **"Invalid API Key" error:**
   - Verify you're using the correct key (sandbox vs live)
   - Check that the key is copied correctly (no extra spaces)

2. **Webhook signature verification fails:**
   - Ensure you're using the correct webhook secret
   - Verify the raw body is being used for signature verification
   - Check that the timestamp in the signature is valid

3. **Transaction creation fails:**
   - Verify your vendor ID is correct
   - Check that you have the necessary permissions in your Paddle account
   - Ensure you're using the correct API endpoint (sandbox vs live)

4. **Webhook not receiving events:**
   - Verify the webhook URL is accessible (use ngrok for local testing)
   - Check that the webhook is enabled in Paddle dashboard
   - Ensure the webhook URL uses HTTPS in production

---

## 📞 Need Help?

- **Paddle Support:** https://paddle.com/support/
- **Paddle Developer Community:** https://developer.paddle.com/
- **Paddle Status Page:** https://status.paddle.com/
- **Paddle API Reference:** https://developer.paddle.com/api-reference/overview
