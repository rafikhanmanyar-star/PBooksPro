# Paddle Payment Debugging Steps

## Current Issue: "Invalid request" Error

After redeploying with improved error logging, follow these steps:

### Step 1: Check Render Logs for Full Error Details

1. Go to Render Dashboard → Your Staging API Service → **Logs** tab
2. Look for the error log entry that starts with: `Paddle payment session creation error - FULL DETAILS:`
3. Copy the entire error object, especially:
   - `fullErrorData` - The complete error response from Paddle
   - `errorType` - Type of error
   - `errorCode` - Specific error code
   - `errorDetail` - Detailed error message
   - `requestBody` - What we sent to Paddle

### Step 2: Common Issues and Solutions

#### Issue A: Missing Customer Information
**Error Code:** `invalid_field` or `required_field_missing`
**Solution:** 
- Paddle might require customer information
- We're now sending `customer_email` if available
- If still failing, we may need to create a customer first

#### Issue B: Invalid Price/Product Configuration
**Error Code:** `not_found` or `invalid_price_id`
**Solution:**
- Verify products and prices exist in Paddle Dashboard
- Check that prices are active
- Note: We're using `unit_price` (ad-hoc pricing) which should work without pre-configured prices

#### Issue C: Wrong API Endpoint
**Error Code:** `not_found` or `404`
**Solution:**
- Verify API URL: `https://sandbox-api.paddle.com/transactions`
- Check that `PADDLE_ENVIRONMENT=sandbox` is set

#### Issue D: Currency Format Issue
**Error Code:** `invalid_field` with currency-related message
**Solution:**
- Currency should be uppercase: `USD`, `PKR`
- Amount should be in smallest unit (cents): `1000` for $10.00

### Step 3: Test Paddle API Directly

You can test the Paddle API directly to see what it expects:

```bash
# Test API connection
curl -X GET "https://sandbox-api.paddle.com/transactions" \
  -H "Authorization: Bearer YOUR_PADDLE_API_KEY" \
  -H "Content-Type: application/json"

# Test creating a simple transaction (replace with your actual values)
curl -X POST "https://sandbox-api.paddle.com/transactions" \
  -H "Authorization: Bearer YOUR_PADDLE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "items": [
      {
        "description": "Test License",
        "quantity": 1,
        "unit_price": {
          "amount": "1000",
          "currency_code": "USD"
        }
      }
    ],
    "customer_email": "test@example.com"
  }'
```

### Step 4: Check Paddle Dashboard

1. **Verify Products/Prices:**
   - Go to Paddle Dashboard → Catalog → Products
   - Ensure products exist
   - Check prices are configured

2. **Check API Key:**
   - Go to Developer Tools → Authentication
   - Verify API key is active
   - Check it's the sandbox key (not live)

3. **Review Transaction History:**
   - Check if any transactions were created
   - Look for error messages

### Step 5: Alternative Approach - Use Price IDs

If `unit_price` doesn't work, we can use pre-configured prices:

1. **Get Price IDs from Paddle:**
   - Go to Paddle Dashboard → Catalog → Products
   - Click on each product
   - Copy the Price ID (starts with `pri_`)

2. **Update Code to Use Price IDs:**
   - We can modify the code to use `price_id` instead of `unit_price`
   - This requires mapping license types to price IDs

### Step 6: Share Error Details

After checking logs, share:
1. The `fullErrorData` from logs
2. The `errorCode` and `errorDetail`
3. The `requestBody` that was sent
4. Any other relevant error information

This will help identify the exact issue and provide a targeted fix.

---

## Quick Checklist

- [ ] Checked Render logs for full error details
- [ ] Verified API key is correct and active
- [ ] Verified products/prices exist in Paddle
- [ ] Tested Paddle API directly
- [ ] Checked currency format (uppercase)
- [ ] Verified amount is in cents
- [ ] Checked customer email is being sent
- [ ] Reviewed Paddle transaction history

---

## Next Steps After Getting Error Details

Once we have the full error details from logs, we can:
1. Identify the specific field causing the issue
2. Fix the request format
3. Add any missing required fields
4. Test again
