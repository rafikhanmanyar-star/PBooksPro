# Paddle Sandbox Setup - Step by Step Guide

This guide will walk you through setting up Paddle sandbox for testing the payment gateway integration.

## Prerequisites

- A Paddle account (sign up at https://vendors.paddle.com/ if you don't have one)
- Access to your Paddle dashboard
- Your API server running and accessible

---

## Step 1: Access Paddle Dashboard

1. **Go to Paddle Dashboard:**
   - Visit: https://vendors.paddle.com/
   - Log in with your Paddle account credentials

2. **Switch to Sandbox Mode:**
   - Look for a toggle or dropdown in the top-right corner
   - Switch from **"Live"** to **"Sandbox"** mode
   - You should see "Sandbox" indicator in the dashboard

---

## Step 2: Get Your Vendor/Project ID

1. **Find Your Vendor ID:**
   - Go to **Settings** → **Account Details** (or **General**)
   - Your **Vendor ID** is displayed here (usually a number like `123456`)
   - **Alternative:** Check the URL when viewing your account: `https://vendors.paddle.com/vendor/123456`
   - The number after `/vendor/` is your Vendor ID
   - **Copy this Vendor ID** - you'll need it for `PADDLE_VENDOR_ID`

---

## Step 3: Get API Keys (Sandbox)

1. **Navigate to Authentication:**
   - Go to **Developer Tools** → **Authentication** (in left sidebar)
   - Make sure you're in **Sandbox** mode (toggle in top-right)

2. **Generate API Key:**
   - Look for **"API Keys"** or **"Server Key"** section
   - Click **"Create API Key"** or **"Generate Key"**
   - Name it something like "PBooksPro Sandbox API Key"
   - **Copy the API Key (Secret Key)** - This is your `PADDLE_API_KEY`
   - ⚠️ **Important:** Copy it immediately - you won't be able to see it again!

3. **Public Key (Optional - Skip for Backend Only):**
   - **Note:** `PADDLE_PUBLIC_KEY` is NOT required for backend API integration
   - The public key is only needed if you're using Paddle.js on the frontend
   - Since we're using server-side API calls only, you can skip this
   - If you need it later for client-side integration, you can find it in **Developer Tools** → **Authentication** → **Public Key**

---

## Step 4: Set Up Webhook (Sandbox)

1. **Navigate to Webhooks:**
   - Go to **Developer Tools** → **Notifications** (or **Webhooks**)
   - Make sure you're in **Sandbox** mode

2. **Create Webhook Endpoint:**
   - Click **"Add Notification"** or **"Create Webhook"**
   - **Webhook URL:** Enter your webhook endpoint URL
     - For production: `https://pbookspro-api.onrender.com/api/payments/webhook/paddle`
     - For local testing (use ngrok): `https://your-ngrok-url.ngrok.io/api/payments/webhook/paddle`
     - For staging: `https://your-staging-url.onrender.com/api/payments/webhook/paddle`

3. **Select Events:**
   - Select the following events:
     - ✅ `transaction.completed`
     - ✅ `transaction.payment_failed`
     - ✅ `transaction.payment_declined`
     - ✅ `transaction.refunded`
     - ✅ `transaction.created`
     - ✅ `transaction.updated`
   - Click **"Save"** or **"Create"**

4. **Get Webhook Secret:**
   - After creating the webhook, Paddle will provide a **Webhook Secret**
   - This is usually displayed immediately after creation
   - Look for **"Signing Secret"** or **"Webhook Secret"**
   - **Copy this secret** - This is your `PADDLE_WEBHOOK_SECRET`
   - ⚠️ **Important:** Copy it immediately - save it securely!

---

## Step 5: Configure Environment Variables

### For Local Development:

Add to your `server/.env` file:

```env
# Payment Gateway Configuration
PAYMENT_GATEWAY=paddle
PAYMENT_SANDBOX=true
PADDLE_ENVIRONMENT=sandbox

# Paddle Sandbox Credentials (Required)
PADDLE_VENDOR_ID=your_vendor_id_here
PADDLE_API_KEY=your_sandbox_api_key_here
PADDLE_WEBHOOK_SECRET=your_webhook_secret_here

# Paddle Public Key (Optional - only needed for client-side Paddle.js integration)
# PADDLE_PUBLIC_KEY=your_sandbox_public_key_here

# API Base URL (for webhook URLs in payment sessions)
API_BASE_URL=http://localhost:3000  # or your ngrok URL for local testing
```

### For Staging/Production on Render:

1. **Go to Render Dashboard:**
   - Navigate to your API service (e.g., `pbookspro-api`)
   - Go to **Environment** tab

2. **Add Environment Variables:**
   - Click **"Add Environment Variable"**
   - Add each variable:

   ```
   PAYMENT_GATEWAY = paddle
   PAYMENT_SANDBOX = true  # Use false for production
   PADDLE_ENVIRONMENT = sandbox  # Use live for production
   PADDLE_VENDOR_ID = your_vendor_id
   PADDLE_API_KEY = your_sandbox_api_key
   PADDLE_WEBHOOK_SECRET = your_webhook_secret
   # PADDLE_PUBLIC_KEY = your_sandbox_public_key  # Optional - only for client-side
   API_BASE_URL = https://pbookspro-api.onrender.com
   ```

3. **Save Changes:**
   - Render will automatically restart your service with new variables

---

## Step 6: Create Products/Prices in Paddle (Required)

Paddle requires you to create products and prices before processing payments.

1. **Navigate to Products:**
   - Go to **Catalog** → **Products** (in left sidebar)
   - Make sure you're in **Sandbox** mode

2. **Create Products for License Types:**

   **Product 1: Monthly License**
   - Click **"Create Product"**
   - **Name:** "PBooksPro Monthly License"
   - **Description:** "Monthly license renewal for PBooksPro"
   - **Type:** One-time (or Subscription if you want recurring)
   - Click **"Create"**

   **Product 2: Yearly License**
   - Click **"Create Product"** again
   - **Name:** "PBooksPro Yearly License"
   - **Description:** "Yearly license renewal for PBooksPro"
   - **Type:** One-time (or Subscription)
   - Click **"Create"**

3. **Create Prices:**

   For each product, create prices:
   - Click on the product
   - Click **"Add Price"** or **"Create Price"**
   - **Currency:** USD or PKR (depending on your needs)
   - **Amount:** Enter the price amount
     - Monthly: $24 USD or equivalent in PKR
     - Yearly: $293 USD or equivalent in PKR
   - **Billing Period:** One-time (or Monthly/Yearly for subscriptions)
   - **Save the Price ID** - You may need this for API calls

---

## Step 7: Test Local Webhook (Using ngrok)

For local testing, you need to expose your local server to the internet:

1. **Install ngrok:**
   - Download from: https://ngrok.com/download
   - Or install via package manager: `npm install -g ngrok`

2. **Start your API server:**
   ```bash
   cd server
   npm run dev
   ```
   Server should be running on port 3000

3. **Start ngrok:**
   ```bash
   ngrok http 3000
   ```

4. **Copy the ngrok URL:**
   - You'll see something like: `https://abc123.ngrok.io`
   - Copy this URL

5. **Update Webhook URL in Paddle:**
   - Go back to Paddle Dashboard → Developer Tools → Notifications
   - Edit your webhook
   - Update URL to: `https://abc123.ngrok.io/api/payments/webhook/paddle`
   - Save changes

6. **Update Environment Variable:**
   - Update `API_BASE_URL` in your `.env` to the ngrok URL temporarily
   - Or use the ngrok URL directly when creating payment sessions

---

## Step 8: Test Payment Flow

1. **Start Your Server:**
   ```bash
   cd server
   npm run dev
   ```

2. **Create a Test Payment:**
   - Use the frontend payment modal or API directly
   - Create a payment session for monthly or yearly license

3. **Complete Payment with Test Card:**
   - Paddle sandbox test cards:
     - **Card Number:** `4242 4242 4242 4242`
     - **Expiry:** Any future date (e.g., 12/25)
     - **CVV:** Any 3 digits (e.g., 123)
     - **Name:** Any name
     - **Postal Code:** Any valid postal code

4. **Verify Webhook:**
   - Check your server logs for webhook events
   - Verify payment status in database
   - Check that license was renewed

---

## Step 9: Verify Setup

### Check Environment Variables:
```bash
# Verify variables are loaded (in server directory)
node -e "require('dotenv').config(); console.log('Vendor ID:', process.env.PADDLE_VENDOR_ID ? 'Set' : 'Missing');"
```

### Test API Connection:
You can test the API connection using curl:

```bash
curl -X GET "https://sandbox-api.paddle.com/transactions" \
  -H "Authorization: Bearer YOUR_SANDBOX_API_KEY" \
  -H "Content-Type: application/json"
```

### Check Webhook Logs:
- Go to Paddle Dashboard → Developer Tools → Notifications
- View webhook delivery logs
- Check for successful deliveries (200 status)

---

## Step 10: Switch to Production (When Ready)

When you're ready to go live:

1. **Switch to Live Mode in Paddle:**
   - Toggle to **"Live"** mode in Paddle dashboard

2. **Get Live Credentials:**
   - Follow Steps 2-4 again in **Live** mode
   - Get **Live** API keys and webhook secret
   - Create products/prices in **Live** mode

3. **Update Environment Variables:**
   ```env
   PAYMENT_GATEWAY=paddle
   PAYMENT_SANDBOX=false
   PADDLE_ENVIRONMENT=live
   PADDLE_VENDOR_ID=your_live_vendor_id
   PADDLE_API_KEY=your_live_api_key
   PADDLE_WEBHOOK_SECRET=your_live_webhook_secret
   # PADDLE_PUBLIC_KEY=your_live_public_key  # Optional - only for client-side
   ```

4. **Update Webhook URL:**
   - Use production API URL: `https://pbookspro-api.onrender.com/api/payments/webhook/paddle`

---

## Quick Reference Checklist

- [ ] Paddle account created
- [ ] Switched to Sandbox mode
- [ ] Vendor ID copied
- [ ] Sandbox API key generated and copied
- [ ] Webhook endpoint created in Paddle
- [ ] Webhook secret copied
- [ ] Products created in Paddle (Monthly, Yearly)
- [ ] Prices created for each product
- [ ] Environment variables added to `.env`
- [ ] Webhook URL configured (with ngrok for local)
- [ ] Test payment completed successfully
- [ ] Webhook received and processed
- [ ] License renewal verified

---

## Troubleshooting

### "Invalid API Key" Error:
- Verify you're using sandbox keys (not live keys)
- Check for extra spaces when copying
- Ensure you're in Sandbox mode in Paddle dashboard

### Webhook Not Received:
- Verify ngrok is running (for local testing)
- Check webhook URL is correct in Paddle dashboard
- Ensure webhook is enabled and events are selected
- Check server logs for incoming requests

### Payment Session Creation Fails:
- Verify products/prices exist in Paddle
- Check Vendor ID is correct
- Ensure API key has correct permissions

### Webhook Signature Verification Fails:
- Verify webhook secret matches in both Paddle and your app
- Check that you're using the raw request body for verification
- Review server logs for signature verification errors

---

## Need Help?

- **Paddle Support:** https://paddle.com/support/
- **Paddle Developer Docs:** https://developer.paddle.com/
- **Paddle API Reference:** https://developer.paddle.com/api-reference/overview
- **Paddle Status:** https://status.paddle.com/
