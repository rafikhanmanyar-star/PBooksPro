# Payment Gateway Integration Setup Guide

This guide explains how to set up and configure the payment gateway integration for license renewal in PBooksPro.

## Overview

The payment gateway integration supports:
- **PayFast** (State Bank of Pakistan licensed, recommended)
- **Paymob** (Alternative gateway)

Both gateways support:
- Local and international credit/debit cards
- Secure payment processing
- Webhook notifications for automatic license renewal

## Configuration

### Environment Variables

Add the following to your `.env` file in the `server` directory:

```env
# Payment Gateway Configuration
PAYMENT_GATEWAY=payfast  # Options: payfast, paymob
PAYMENT_SANDBOX=false    # Set to true for testing

# PayFast Configuration (if using PayFast)
PAYFAST_MERCHANT_ID=your_merchant_id
PAYFAST_MERCHANT_KEY=your_merchant_key
PAYFAST_PASSPHRASE=your_passphrase  # Optional

# Paymob Configuration (if using Paymob)
PAYMOB_API_KEY=your_api_key
PAYMOB_INTEGRATION_ID=your_integration_id

# Webhook Configuration
API_BASE_URL=https://your-api-domain.com  # Used for webhook URLs
WEBHOOK_SECRET=your_webhook_secret  # Optional, for additional security
```

### PayFast Setup

1. **Create a PayFast Account**
   - Go to [PayFast](https://www.payfast.co.za/)
   - Sign up for a merchant account
   - Complete verification process

2. **Get Your Credentials**
   - Log in to PayFast merchant dashboard
   - Navigate to Account Settings → API Access
   - Copy your Merchant ID and Merchant Key
   - Set up a passphrase (optional but recommended)

3. **Configure Webhooks**
   - In PayFast dashboard, go to Integrations → Instant Transaction Notifications (ITN)
   - Set ITN URL to: `https://your-api-domain.com/api/payments/webhook/payfast`
   - Enable ITN notifications

4. **Test Mode**
   - Use PayFast sandbox for testing
   - Set `PAYMENT_SANDBOX=true` in your `.env`
   - Use test credentials from PayFast dashboard

### Paymob Setup

1. **Create a Paymob Account**
   - Go to [Paymob](https://paymob.com/)
   - Sign up and complete verification

2. **Get Your Credentials**
   - Log in to Paymob dashboard
   - Navigate to API Settings
   - Copy your API Key and Integration ID

3. **Configure Webhooks**
   - In Paymob dashboard, set webhook URL
   - URL: `https://your-api-domain.com/api/payments/webhook/paymob`

## Database Migration

Run the payment tables migration:

```bash
cd server
npm run migrate
```

Or manually run:
```bash
psql $DATABASE_URL -f migrations/add-payment-tables.sql
```

## Testing

### Test Payment Flow

1. **Start the server**
   ```bash
   cd server
   npm run dev
   ```

2. **Create a test payment session**
   - Use the frontend or API to create a payment session
   - For PayFast: You'll be redirected to PayFast's payment page
   - Use test card numbers from PayFast/Paymob documentation

3. **Verify webhook processing**
   - Check server logs for webhook events
   - Verify payment status in database
   - Confirm license was renewed automatically

### Test Cards

**PayFast Sandbox:**
- Card: `4111111111111111`
- CVV: Any 3 digits
- Expiry: Any future date

**Paymob Sandbox:**
- Check Paymob documentation for test cards

## API Endpoints

### Create Payment Session
```
POST /api/payments/create-session
Headers: Authorization: Bearer <token>, X-Tenant-ID: <tenant_id>
Body: {
  "licenseType": "monthly" | "yearly",
  "currency": "PKR" | "USD" (optional, default: PKR)
}
Response: {
  "success": true,
  "session": {
    "paymentId": "...",
    "paymentIntentId": "...",
    "checkoutUrl": "...",
    "amount": 85000,
    "currency": "PKR"
  }
}
```

### Get Payment History
```
GET /api/payments/history
Headers: Authorization: Bearer <token>, X-Tenant-ID: <tenant_id>
Response: {
  "success": true,
  "payments": [...]
}
```

### Get Payment Status
```
GET /api/payments/:paymentId/status
Headers: Authorization: Bearer <token>, X-Tenant-ID: <tenant_id>
```

### Webhook Endpoint
```
POST /api/payments/webhook/:gateway
(Public endpoint, called by payment gateway)
```

## Pricing Configuration

Pricing is configured in `server/config/pricing.ts`. Current pricing:

- **Monthly License**: PKR 7,083 / USD 24
- **Yearly License**: PKR 85,000 / USD 293

To modify pricing, edit the `PRICING_TIERS` object in the pricing config file.

## Frontend Integration

The payment flow is integrated into:
- `components/license/PaymentModal.tsx` - Payment selection and processing
- `components/license/LicenseLockScreen.tsx` - Shows payment option when license expired
- `components/license/PaymentHistory.tsx` - View payment history

## Security Considerations

1. **Webhook Verification**
   - All webhooks are verified using gateway signatures
   - Invalid signatures are logged and rejected

2. **Idempotency**
   - Payments are tracked by unique payment intent IDs
   - Duplicate webhook events are prevented

3. **No Card Storage**
   - Card details are never stored
   - All payment processing handled by gateway

4. **HTTPS Required**
   - Webhook endpoints must use HTTPS in production
   - Gateway callbacks require secure connections

## Troubleshooting

### Webhooks Not Received

1. Check webhook URL is correctly configured in gateway dashboard
2. Verify API_BASE_URL is set correctly
3. Check server logs for incoming webhook requests
4. Ensure webhook endpoint is publicly accessible

### Payments Not Processing

1. Verify payment gateway credentials are correct
2. Check payment status in database
3. Review webhook logs for errors
4. Verify license renewal is triggered after payment

### Currency Conversion

- PayFast supports PKR and USD natively
- Paymob may require currency conversion
- Check gateway documentation for supported currencies

## Support

For issues or questions:
- Check gateway documentation
- Review server logs
- Contact gateway support for API-specific issues

