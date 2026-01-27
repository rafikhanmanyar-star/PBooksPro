# Paddle Payment Integration Troubleshooting

## Common Errors and Solutions

### Error: "Failed to create Paddle payment session: invalid request"

This error typically occurs when the request to Paddle API doesn't match their expected format.

#### Possible Causes:

1. **Missing or Invalid Price Configuration**
   - **Solution:** Ensure you have created products and prices in Paddle Dashboard
   - Go to: Paddle Dashboard → Catalog → Products
   - Create products for "Monthly License" and "Yearly License"
   - Add prices for each product

2. **Currency Code Format**
   - **Issue:** Currency must be uppercase (USD, PKR) not lowercase
   - **Solution:** The code already handles this, but verify in Paddle dashboard

3. **API Request Format**
   - **Issue:** Paddle requires either `price_id` OR `unit_price`, not both
   - **Solution:** The code has been updated to handle this correctly

4. **Missing Required Fields**
   - **Issue:** Paddle API might require additional fields
   - **Solution:** Check Paddle API documentation for latest requirements

#### Debugging Steps:

1. **Check Render Logs:**
   - Go to Render Dashboard → Your API Service → Logs
   - Look for detailed error messages
   - The updated code now logs more details

2. **Verify Environment Variables:**
   ```bash
   # Check if all required variables are set
   PAYMENT_GATEWAY=paddle
   PADDLE_VENDOR_ID=...
   PADDLE_API_KEY=...
   PADDLE_WEBHOOK_SECRET=...
   ```

3. **Test Paddle API Directly:**
   ```bash
   # Test API connection
   curl -X GET "https://sandbox-api.paddle.com/transactions" \
     -H "Authorization: Bearer YOUR_PADDLE_API_KEY" \
     -H "Content-Type: application/json"
   ```

4. **Check Products/Prices in Paddle:**
   - Go to Paddle Dashboard → Catalog → Products
   - Verify products exist
   - Verify prices are configured
   - Note the Price IDs (you might need them later)

#### Using Pre-configured Prices (Recommended):

If you want to use pre-configured prices from Paddle:

1. **Get Price IDs:**
   - Go to Paddle Dashboard → Catalog → Products
   - Click on each product
   - Copy the Price ID (starts with `pri_`)

2. **Update Payment Service:**
   - You can modify `paymentService.ts` to pass `priceId` in metadata
   - Example:
     ```typescript
     metadata: {
       priceId: 'pri_xxxxx', // Monthly or Yearly price ID
       // ... other metadata
     }
     ```

3. **Benefits:**
   - More reliable (uses Paddle's price management)
   - Better for recurring subscriptions
   - Easier to update prices in Paddle dashboard

#### Current Implementation:

The current implementation uses `unit_price` (ad-hoc pricing) which should work without pre-configured prices. If you're still getting errors:

1. **Check the exact error in logs:**
   - Look for the detailed error message
   - It will show what Paddle is rejecting

2. **Verify API Key:**
   - Make sure you're using the correct sandbox API key
   - Verify it's not expired or revoked

3. **Check API URL:**
   - Sandbox: `https://sandbox-api.paddle.com`
   - Live: `https://api.paddle.com`
   - Verify `PADDLE_ENVIRONMENT=sandbox` is set

---

### Error: "Paddle authentication failed"

**Cause:** Invalid or missing API key

**Solution:**
1. Verify `PADDLE_API_KEY` in Render environment variables
2. Ensure you're using sandbox key for sandbox environment
3. Regenerate API key in Paddle Dashboard if needed

---

### Error: Webhook not received

**Causes:**
1. Webhook URL not configured correctly
2. Webhook secret mismatch
3. Webhook endpoint not accessible

**Solution:**
1. Verify webhook URL in Paddle Dashboard
2. Check `PADDLE_WEBHOOK_SECRET` matches Paddle Dashboard
3. Test webhook endpoint accessibility
4. Check Render logs for incoming requests

---

### Error: Payment completed but license not renewed

**Causes:**
1. Webhook not processed
2. Payment status not updated
3. License renewal failed

**Solution:**
1. Check webhook delivery logs in Paddle Dashboard
2. Verify payment status in database
3. Check license renewal logs
4. Verify `renewLicenseWithPayment` was called

---

## Testing Checklist

- [ ] Environment variables set correctly
- [ ] Products and prices created in Paddle
- [ ] Webhook configured in Paddle Dashboard
- [ ] API key is valid and has correct permissions
- [ ] Webhook secret matches in both places
- [ ] API endpoint is accessible
- [ ] Test payment with sandbox card
- [ ] Webhook received and processed
- [ ] Payment status updated
- [ ] License renewed successfully

---

## Getting More Help

1. **Check Render Logs:**
   - Detailed error messages are now logged
   - Look for the full error object

2. **Check Paddle Dashboard:**
   - Webhook delivery logs
   - Transaction history
   - API key status

3. **Paddle Support:**
   - https://paddle.com/support/
   - Provide error details and request/response logs

4. **Paddle Documentation:**
   - https://developer.paddle.com/
   - API Reference: https://developer.paddle.com/api-reference/overview
