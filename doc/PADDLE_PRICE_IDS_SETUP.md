# Paddle Price IDs Setup Guide

## Overview

To use pre-configured prices from Paddle (recommended), you need to:
1. Get the **Price IDs** (not Product IDs) from Paddle Dashboard
2. Add them as environment variables
3. The code will automatically use them when creating transactions

## Step 1: Get Price IDs from Paddle

**Important:** You need **Price IDs** (start with `pri_`), not Product IDs (start with `pro_`).

1. **Go to Paddle Dashboard:**
   - Visit: https://vendors.paddle.com/
   - Make sure you're in **Sandbox** mode

2. **Navigate to Products:**
   - Go to **Catalog** → **Products**

3. **Get Price IDs:**
   - Click on your **Monthly License** product
   - Look for the **Prices** section
   - You'll see price entries with IDs like `pri_01keyh5ehd4bgnge7bckf4fxge`
   - **Copy the Price ID** (starts with `pri_`)
   
   - Click on your **Yearly License** product
   - Copy its **Price ID** as well

4. **Note the IDs:**
   - Monthly License Price ID: `pri_xxxxx` (starts with `pri_`)
   - Yearly License Price ID: `pri_xxxxx` (starts with `pri_`)

## Step 2: Add Environment Variables

### For Staging (Render Dashboard):

1. **Go to Render Dashboard:**
   - Navigate to your staging API service (`pbookspro-api-staging`)
   - Go to **Environment** tab

2. **Add Price ID Variables:**
   - Click **"Add Environment Variable"**
   - Add these two variables:

   ```
   PADDLE_PRICE_ID_MONTHLY = pri_xxxxx  (your monthly price ID)
   PADDLE_PRICE_ID_YEARLY = pri_xxxxx   (your yearly price ID)
   ```

3. **Save Changes:**
   - Click **"Save Changes"**
   - Render will restart the service automatically

### For Local Development:

Add to `server/.env`:

```env
PADDLE_PRICE_ID_MONTHLY=pri_xxxxx
PADDLE_PRICE_ID_YEARLY=pri_xxxxx
```

## Step 3: Verify Setup

After adding the environment variables:

1. **Redeploy/Restart** your API server
2. **Test payment creation** - it should now use the price IDs
3. **Check logs** - should show price IDs being used

## How It Works

- When a user selects **Monthly** license, the code uses `PADDLE_PRICE_ID_MONTHLY`
- When a user selects **Yearly** license, the code uses `PADDLE_PRICE_ID_YEARLY`
- If price IDs are not set, the code falls back to using `unit_price` (ad-hoc pricing)

## Benefits of Using Price IDs

✅ **More Reliable:** Uses Paddle's price management system
✅ **Easier Updates:** Change prices in Paddle Dashboard without code changes
✅ **Better Tracking:** Paddle can track which prices are being used
✅ **Subscription Support:** Better for recurring subscriptions (if needed later)

## Troubleshooting

### Error: "Price ID not found"
- Verify the price ID is correct (starts with `pri_`)
- Check that the price exists in Paddle Dashboard
- Ensure you're using sandbox price IDs for sandbox environment

### Still Using unit_price
- Check environment variables are set correctly
- Verify variable names: `PADDLE_PRICE_ID_MONTHLY` and `PADDLE_PRICE_ID_YEARLY`
- Restart the service after adding variables

### Price ID Format
- Must start with `pri_` (not `pro_`)
- Example: `pri_01keyh5ehd4bgnge7bckf4fxge`
- Product IDs start with `pro_` - these are different!

## Example

If your Price IDs are:
- Monthly: `pri_01keyh5ehd4bgnge7bckf4fxge`
- Yearly: `pri_01keyh48vgfqqa3x8p7kghzy3r`

Add to Render:
```
PADDLE_PRICE_ID_MONTHLY=pri_01keyh5ehd4bgnge7bckf4fxge
PADDLE_PRICE_ID_YEARLY=pri_01keyh48vgfqqa3x8p7kghzy3r
```

## Next Steps

1. Get your Price IDs from Paddle Dashboard
2. Add them to Render environment variables
3. Redeploy the API service
4. Test payment creation
5. Verify it's using the price IDs (check logs)
