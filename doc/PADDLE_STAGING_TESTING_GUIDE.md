# Paddle Sandbox Testing Guide - Staging Environment

This guide will help you test the Paddle payment integration in your staging environment.

## Prerequisites Checklist

Before testing, ensure you have:

- [x] ✅ All environment variables set in Render Dashboard (staging service)
- [x] ✅ Products and prices created in Paddle Sandbox
- [ ] ⬜ Webhook configured in Paddle Dashboard with staging URL
- [ ] ⬜ Staging API service is running and accessible

---

## Step 1: Verify Staging API URL

Your staging API should be accessible at:
```
https://pbookspro-api-staging.onrender.com
```

**Test the API is running:**
```bash
curl https://pbookspro-api-staging.onrender.com/health
```

Expected response: `{"status":"ok"}`

---

## Step 2: Configure Webhook in Paddle Dashboard

1. **Go to Paddle Dashboard:**
   - Visit: https://vendors.paddle.com/
   - Make sure you're in **Sandbox** mode (toggle in top-right)

2. **Navigate to Webhooks:**
   - Go to **Developer Tools** → **Notifications** (or **Webhooks**)

3. **Create/Edit Webhook:**
   - If you already have a webhook, click **Edit**
   - If not, click **"Add Notification"** or **"Create Webhook"**

4. **Set Webhook URL:**
   - **Webhook URL:** `https://pbookspro-api-staging.onrender.com/api/payments/webhook/paddle`
   - ⚠️ **Important:** Use your exact staging API URL

5. **Select Events:**
   - ✅ `transaction.completed`
   - ✅ `transaction.payment_failed`
   - ✅ `transaction.payment_declined`
   - ✅ `transaction.refunded`
   - ✅ `transaction.created`
   - ✅ `transaction.updated`

6. **Save the Webhook:**
   - Click **"Save"** or **"Create"**
   - **Copy the Webhook Secret** if you haven't already
   - Make sure `PADDLE_WEBHOOK_SECRET` in Render matches this secret

---

## Step 3: Verify Environment Variables in Render

1. **Go to Render Dashboard:**
   - Visit: https://dashboard.render.com
   - Navigate to your **staging API service** (`pbookspro-api-staging`)

2. **Check Environment Tab:**
   - Go to **Environment** tab
   - Verify these variables are set:

   ```
   PAYMENT_GATEWAY=paddle
   PAYMENT_SANDBOX=true
   PADDLE_ENVIRONMENT=sandbox
   PADDLE_VENDOR_ID=your_vendor_id
   PADDLE_API_KEY=your_sandbox_api_key
   PADDLE_WEBHOOK_SECRET=your_webhook_secret
   API_BASE_URL=https://pbookspro-api-staging.onrender.com
   ```

3. **If any are missing:**
   - Click **"Add Environment Variable"**
   - Add the missing variable
   - Click **"Save Changes"**
   - Wait for service to restart (~30-60 seconds)

---

## Step 4: Test Payment Flow

### Option A: Test from Staging Client App

1. **Access Staging Client:**
   - Go to: `https://pbookspro-client-staging.onrender.com`
   - Or your staging client URL

2. **Login/Register:**
   - Login with a test tenant account
   - Or register a new tenant

3. **Navigate to License Renewal:**
   - Go to **Settings** → **License Management**
   - Or if license is expired, you'll see the lock screen with renewal option

4. **Initiate Payment:**
   - Click **"Renew License"** or **"Upgrade License"**
   - Select license type (Monthly or Yearly)
   - Select currency (PKR or USD)
   - Click **"Proceed to Payment"**

5. **Complete Payment:**
   - You'll be redirected to Paddle checkout
   - Use Paddle sandbox test card:
     - **Card Number:** `4242 4242 4242 4242`
     - **Expiry:** Any future date (e.g., `12/25`)
     - **CVV:** Any 3 digits (e.g., `123`)
     - **Name:** Any name
     - **Postal Code:** Any valid postal code (e.g., `12345`)
   - Click **"Complete Payment"**

6. **Verify Redirect:**
   - After payment, you should be redirected back to your app
   - URL should be: `https://pbookspro-client-staging.onrender.com/license/payment-success`

### Option B: Test via API Directly

1. **Get Authentication Token:**
   ```bash
   # Login to get JWT token
   curl -X POST https://pbookspro-api-staging.onrender.com/api/auth/login \
     -H "Content-Type: application/json" \
     -d '{
       "email": "your-test-tenant@example.com",
       "password": "your-password"
     }'
   ```
   Copy the `token` from the response.

2. **Create Payment Session:**
   ```bash
   curl -X POST https://pbookspro-api-staging.onrender.com/api/payments/create-session \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer YOUR_JWT_TOKEN" \
     -H "X-Tenant-ID: your-tenant-id" \
     -d '{
       "licenseType": "monthly",
       "currency": "USD"
     }'
   ```

3. **Get Checkout URL:**
   - Response will contain `session.checkoutUrl`
   - Open this URL in browser
   - Complete payment with test card

---

## Step 5: Verify Webhook Reception

### Check Render Logs:

1. **Go to Render Dashboard:**
   - Navigate to your staging API service
   - Click **"Logs"** tab

2. **Look for Webhook Logs:**
   - After completing payment, you should see logs like:
     ```
     Webhook received: transaction.completed
     Payment processed successfully: payment_id=xxx
     License renewed for tenant: tenant_id=xxx
     ```

3. **Check for Errors:**
   - If you see errors, note them down
   - Common issues:
     - Webhook signature verification failed → Check `PADDLE_WEBHOOK_SECRET`
     - Payment not found → Check payment session creation
     - License renewal failed → Check database connection

### Check Paddle Dashboard:

1. **Go to Paddle Dashboard:**
   - **Developer Tools** → **Notifications**
   - Click on your webhook

2. **View Delivery Logs:**
   - You should see recent webhook deliveries
   - Status should be **200 OK** (green)
   - If **Failed** (red), click to see error details

---

## Step 6: Verify Payment in Database

### Option A: Check via API

1. **Get Payment History:**
   ```bash
   curl -X GET https://pbookspro-api-staging.onrender.com/api/payments/history \
     -H "Authorization: Bearer YOUR_JWT_TOKEN" \
     -H "X-Tenant-ID: your-tenant-id"
   ```

2. **Check Payment Status:**
   ```bash
   curl -X GET https://pbookspro-api-staging.onrender.com/api/payments/{paymentId}/status \
     -H "Authorization: Bearer YOUR_JWT_TOKEN" \
     -H "X-Tenant-ID: your-tenant-id"
   ```

### Option B: Check License Status

1. **Get License Status:**
   ```bash
   curl -X GET https://pbookspro-api-staging.onrender.com/api/tenants/license-status \
     -H "Authorization: Bearer YOUR_JWT_TOKEN" \
     -H "X-Tenant-ID: your-tenant-id"
   ```

2. **Verify:**
   - `isActive` should be `true`
   - `expiresAt` should be updated (1 month or 1 year from now)
   - `licenseType` should match what you purchased

---

## Step 7: Troubleshooting

### Issue: Webhook Not Received

**Symptoms:**
- Payment completed in Paddle
- No webhook logs in Render
- Payment status still "pending"

**Solutions:**
1. **Verify Webhook URL:**
   - Check Paddle Dashboard → Notifications
   - Ensure URL is exactly: `https://pbookspro-api-staging.onrender.com/api/payments/webhook/paddle`
   - No trailing slashes

2. **Check Webhook Secret:**
   - Verify `PADDLE_WEBHOOK_SECRET` in Render matches Paddle Dashboard
   - Restart service after updating

3. **Check Paddle Delivery Logs:**
   - Paddle Dashboard → Notifications → Your Webhook → Delivery Logs
   - Check error messages

4. **Test Webhook Endpoint:**
   ```bash
   curl -X POST https://pbookspro-api-staging.onrender.com/api/payments/webhook/paddle \
     -H "Content-Type: application/json" \
     -H "Paddle-Signature: ts=1234567890;h1=test" \
     -d '{"test": "data"}'
   ```
   Should return 401 (unauthorized) - this confirms endpoint is accessible

### Issue: Payment Session Creation Fails

**Symptoms:**
- Error when clicking "Proceed to Payment"
- API returns 500 error

**Solutions:**
1. **Check Environment Variables:**
   - Verify all Paddle variables are set in Render
   - Check for typos in variable names

2. **Check API Logs:**
   - Render Dashboard → Logs
   - Look for error messages about Paddle API

3. **Verify Products/Prices:**
   - Check Paddle Dashboard → Catalog → Products
   - Ensure products exist and have prices

4. **Test Paddle API Connection:**
   ```bash
   curl -X GET "https://sandbox-api.paddle.com/transactions" \
     -H "Authorization: Bearer YOUR_PADDLE_API_KEY" \
     -H "Content-Type: application/json"
   ```
   Should return transaction list (may be empty)

### Issue: License Not Renewed

**Symptoms:**
- Payment completed successfully
- Webhook received
- But license still expired

**Solutions:**
1. **Check Payment Status:**
   - Verify payment status is "completed" in database
   - Check `payments` table

2. **Check License Service Logs:**
   - Look for errors in license renewal process
   - Check if `renewLicenseWithPayment` was called

3. **Verify Payment ID Link:**
   - Check `license_history` table
   - Verify `payment_id` is linked to payment record

---

## Step 8: Test Different Scenarios

### Test 1: Successful Payment
- ✅ Complete payment with test card `4242 4242 4242 4242`
- ✅ Verify webhook received
- ✅ Verify license renewed
- ✅ Verify payment status = "completed"

### Test 2: Failed Payment
- Use declined test card: `4000 0000 0000 0002`
- Verify webhook received with "failed" status
- Verify payment status = "failed"
- Verify license NOT renewed

### Test 3: Payment Cancellation
- Start payment process
- Click "Cancel" or close checkout
- Verify redirect to cancel URL
- Verify payment status = "cancelled"

### Test 4: Different License Types
- Test Monthly license renewal
- Test Yearly license renewal
- Verify correct duration added

### Test 5: Different Currencies
- Test PKR payment
- Test USD payment
- Verify correct amounts

---

## Step 9: Verify End-to-End Flow

Complete checklist:

- [ ] Payment session created successfully
- [ ] Redirected to Paddle checkout
- [ ] Payment completed with test card
- [ ] Redirected back to success page
- [ ] Webhook received in Render logs
- [ ] Webhook shows 200 OK in Paddle Dashboard
- [ ] Payment status = "completed" in database
- [ ] License renewed (expiresAt updated)
- [ ] License status = "active"
- [ ] Payment history shows new payment
- [ ] License history shows renewal entry

---

## Next Steps

Once staging testing is successful:

1. **Document any issues found**
2. **Fix any bugs**
3. **Test again to verify fixes**
4. **Prepare for production deployment**
5. **Update production environment variables**
6. **Configure production webhook in Paddle**
7. **Test in production with small amount first**

---

## Quick Reference

### Staging URLs:
- **API:** `https://pbookspro-api-staging.onrender.com`
- **Client:** `https://pbookspro-client-staging.onrender.com`
- **Webhook:** `https://pbookspro-api-staging.onrender.com/api/payments/webhook/paddle`

### Test Cards:
- **Success:** `4242 4242 4242 4242`
- **Decline:** `4000 0000 0000 0002`
- **Expiry:** Any future date
- **CVV:** Any 3 digits

### Paddle Dashboard:
- **Sandbox:** https://sandbox-vendors.paddle.com
- **Live:** https://vendors.paddle.com

---

## Support

If you encounter issues:
1. Check Render logs first
2. Check Paddle webhook delivery logs
3. Verify all environment variables
4. Test API endpoints directly
5. Review error messages carefully
