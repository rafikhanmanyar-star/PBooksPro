# Paddle Default Checkout URL Setup

## Error Message
```
A Default Payment Link has not yet been defined within the Paddle Dashboard for this account, 
find this under checkout settings.
```

## Solution: Configure Default Checkout URL in Paddle

### Step 1: Access Paddle Dashboard

1. **Go to Paddle Dashboard:**
   - Visit: https://vendors.paddle.com/
   - Make sure you're in **Sandbox** mode (toggle in top-right)

### Step 2: Navigate to Checkout Settings

1. **Go to Settings:**
   - Click **Settings** in the left sidebar
   - Or go to: **Settings** → **Checkout**

2. **Find Checkout Settings:**
   - Look for **"Checkout"** or **"Payment Links"** section
   - You might find it under:
     - **Settings** → **Checkout** → **Payment Links**
     - **Settings** → **Checkout Settings**
     - **Settings** → **Default Checkout URL**

### Step 3: Set Default Checkout URL

1. **Find "Default Payment Link" or "Default Checkout URL":**
   - This is where you set the default redirect URL after payment

2. **Set the URL:**
   - **For Staging:** `https://pbookspro-client-staging.onrender.com/license/payment-success`
   - **For Production:** `https://your-production-client-url.com/license/payment-success`
   - **For Local Testing:** `http://localhost:5173/license/payment-success`

3. **Save Changes:**
   - Click **"Save"** or **"Update"**
   - Paddle will validate the URL

### Step 4: Alternative - Set in Transaction Request

If you can't find the setting or it's not available, we can also set the checkout URL in each transaction request (which we're already doing). However, Paddle still requires a default to be set in the dashboard.

### Step 5: Verify Configuration

1. **Check the Setting:**
   - Go back to Checkout Settings
   - Verify the default URL is saved

2. **Test Payment:**
   - Try creating a payment session again
   - The error should be resolved

## Alternative: Check Paddle API Version

The error message references Paddle v1 API (`/v1/errors/`), but we're using v2 API. This might indicate:

1. **API Version Mismatch:**
   - We're using: `https://sandbox-api.paddle.com/transactions` (v2)
   - But the error references v1

2. **Check API Endpoint:**
   - Verify we're using the correct API version
   - Paddle v2 might have different requirements

## If Setting is Not Available

If you can't find the "Default Payment Link" setting:

1. **Check Paddle Documentation:**
   - Visit: https://developer.paddle.com/
   - Search for "default checkout URL" or "checkout settings"

2. **Contact Paddle Support:**
   - They can help you locate the setting
   - Or confirm if it's required for your account type

3. **Alternative Approach:**
   - We might need to use a different API endpoint
   - Or create payment links differently

## Quick Checklist

- [ ] Logged into Paddle Dashboard (Sandbox mode)
- [ ] Navigated to Settings → Checkout
- [ ] Found "Default Payment Link" or "Default Checkout URL" setting
- [ ] Set URL to your staging/production client URL
- [ ] Saved changes
- [ ] Tested payment creation again

## Expected Result

After setting the default checkout URL:
- Payment session creation should succeed
- You'll be redirected to Paddle checkout
- After payment, you'll be redirected to your success URL

---

## Need Help?

If you can't find the setting:
1. Take a screenshot of your Paddle Dashboard Settings page
2. Check Paddle's help documentation
3. Contact Paddle support with the error code: `transaction_default_checkout_url_not_set`
