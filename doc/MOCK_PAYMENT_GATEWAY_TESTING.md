# Mock Payment Gateway Testing Guide

This guide explains how to test the payment gateway integration using the built-in mock gateway.

## Quick Start

### 1. Configure Mock Gateway

Add to your `server/.env` file:

```env
# Use mock gateway for testing
PAYMENT_GATEWAY=mock

# Optional: Configure mock behavior
MOCK_PAYMENT_DELAY=3000        # Milliseconds before auto-completing (default: 3000)
MOCK_PAYMENT_SUCCESS_RATE=1.0  # Success rate 0.0-1.0 (default: 1.0 = 100% success)
```

### 2. Run Database Migration

Make sure payment tables exist:

```bash
cd server
psql $DATABASE_URL -f migrations/add-payment-tables.sql
```

### 3. Start the Server

```bash
cd server
npm run dev
```

You should see:
```
💰 Using MOCK payment gateway for testing
   Auto-complete delay: 3000ms
   Success rate: 100%
```

### 4. Test Payment Flow

1. **Navigate to license expiration screen** (or trigger expired license)
2. **Click "Renew License Online"**
3. **Select license type** (monthly/yearly) and currency
4. **Click "Proceed to Payment"**
5. **Payment auto-processes** after 3 seconds (configurable)
6. **License automatically renews** on success

## Testing Scenarios

### Test Successful Payment

1. Set `MOCK_PAYMENT_SUCCESS_RATE=1.0` (100% success)
2. Create payment session
3. Payment completes automatically
4. Verify license is renewed
5. Check payment history shows "completed" status

### Test Failed Payment

1. Set `MOCK_PAYMENT_SUCCESS_RATE=0.0` (0% success - all fail)
2. Create payment session
3. Payment fails automatically
4. Verify license is NOT renewed
5. Check payment history shows "failed" status

### Test Payment Processing Delay

1. Set `MOCK_PAYMENT_DELAY=10000` (10 seconds)
2. Create payment session
3. Wait 10 seconds for auto-completion
4. Verify payment processes after delay

### Test Webhook Manually

Use the test endpoint to manually trigger webhooks:

```bash
# Trigger successful payment webhook
curl -X POST http://localhost:3000/api/payments/test/test-webhook/mock_1234567890_abc123 \
  -H "Content-Type: application/json" \
  -d '{"status": "completed"}'

# Trigger failed payment webhook
curl -X POST http://localhost:3000/api/payments/test/test-webhook/mock_1234567890_abc123 \
  -H "Content-Type: application/json" \
  -d '{"status": "failed"}'
```

## Test Endpoints

When using mock gateway, these endpoints are available:

### View Mock Payments

```bash
GET /api/payments/test/test-status
```

Returns all mock payment records with their status.

### Clear Mock Payments

```bash
POST /api/payments/test/test-clear
```

Clears all mock payment records (useful for testing).

### Trigger Webhook

```bash
POST /api/payments/test/test-webhook/:paymentIntentId
Body: { "status": "completed" | "failed" }
```

Manually triggers a webhook event for testing.

## Verification Checklist

After testing, verify:

- [ ] Payment session is created successfully
- [ ] Payment status updates automatically
- [ ] Webhook is processed correctly
- [ ] License is renewed on successful payment
- [ ] License is NOT renewed on failed payment
- [ ] Payment history shows correct status
- [ ] Payment record is saved in database
- [ ] License history links to payment

## Database Verification

Check payment records:

```sql
-- View all payments
SELECT * FROM payments ORDER BY created_at DESC;

-- View webhook logs
SELECT * FROM payment_webhooks ORDER BY created_at DESC;

-- View license renewals linked to payments
SELECT lh.*, p.amount, p.currency, p.status as payment_status
FROM license_history lh
LEFT JOIN payments p ON lh.payment_id = p.id
WHERE lh.action = 'license_renewed'
ORDER BY lh.created_at DESC;
```

## Troubleshooting

### Payment Not Auto-Completing

- Check server logs for errors
- Verify `MOCK_PAYMENT_DELAY` is set correctly
- Check if payment record exists in database

### License Not Renewing

- Check webhook logs in database
- Verify payment status is "completed"
- Check server logs for renewal errors

### Webhook Not Processing

- Verify webhook endpoint is accessible
- Check payment_webhooks table for entries
- Review server logs for webhook errors

## Switching to Real Gateway

When ready to test with real gateway:

1. Update `.env`:
   ```env
   PAYMENT_GATEWAY=payfast  # or paymob
   # Add real gateway credentials
   ```

2. Remove mock-specific configuration

3. Configure webhook URLs in gateway dashboard

4. Test with sandbox credentials first

## Mock Gateway Features

- ✅ Simulates real payment gateway behavior
- ✅ Configurable success/failure rates
- ✅ Configurable processing delays
- ✅ Automatic webhook generation
- ✅ Full payment lifecycle simulation
- ✅ No external dependencies required
- ✅ Perfect for development and CI/CD testing

