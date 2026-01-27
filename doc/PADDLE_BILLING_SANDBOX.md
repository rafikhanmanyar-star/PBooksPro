# Paddle Billing Sandbox Setup (Project-specific)

This guide configures Paddle Billing sandbox for this app without touching production.

## 1) Dashboard: Create sandbox project & keys
- Switch Paddle to Sandbox mode.
- Create/find a project; note the Project ID (use for `PADDLE_VENDOR_ID`).
- Generate an API key (Server) and copy the **sandbox** key.
- Generate/download the Webhook secret (sandbox). Keep the public key handy if Paddle exposes one (not required by current code).

## 2) Environment variables (sandbox)
Add these to your server environment (do not commit real values):
```
PAYMENT_GATEWAY=paddle
PAYMENT_SANDBOX=true
PADDLE_ENVIRONMENT=sandbox

# Paddle sandbox credentials
PADDLE_VENDOR_ID=proj_xxxx              # Project or vendor ID
PADDLE_API_KEY=live_or_sandbox_key      # Use sandbox key for testing
PADDLE_PUBLIC_KEY=pub_xxxx              # If provided; otherwise keep blank

# Webhook verification
PADDLE_WEBHOOK_SECRET=whsec_xxxx        # Sandbox webhook secret (HMAC)
# Public key is not required by current verification:
#PADDLE_WEBHOOK_PUBLIC_KEY=-----BEGIN PUBLIC KEY-----...-----END PUBLIC KEY-----
```
- Local: set in `server/.env` (keep `.env` git-ignored).
- Staging: set in your hosting env vars (use sandbox values).
- Production: leave unchanged (live keys, `PADDLE_ENVIRONMENT=live`, `PAYMENT_SANDBOX=false`).

## 3) Endpoint selection
The code already switches hosts based on env:
- `PADDLE_ENVIRONMENT=sandbox` → `https://sandbox-api.paddle.com`
- `PADDLE_ENVIRONMENT=live` → `https://api.paddle.com`
`PAYMENT_SANDBOX=true` also defaults to sandbox when `PADDLE_ENVIRONMENT` is not set to `live`.

## 4) Webhook setup (sandbox)
- Webhook URL (staging/local tunnel): `https://<your-host>/api/payments/webhook/paddle`
- Events: include `transaction.completed`, `transaction.payment_failed`, `transaction.payment_declined`, `transaction.refunded`, `transaction.updated`.
- Paste the sandbox webhook secret into `PADDLE_WEBHOOK_SECRET`.
- Keep the public key for reference if Paddle provides one; current code uses the webhook secret (HMAC) for verification.

## 5) Test flow
1. Set env vars (sandbox values) and restart the API server.
2. Create a payment session: `POST /api/payments/create-session` with `licenseType` (`monthly`/`yearly`) and optional `currency` (`PKR`/`USD`). Use the returned `checkoutUrl`.
3. Complete checkout with Paddle sandbox test cards.
4. Ensure webhook hits `/api/payments/webhook/paddle`; confirm status updates in `payments` table via `GET /api/payments/:paymentId/status`.
5. Confirm redirect success page works at `/license/payment-success` and cancel at `/license/payment-cancel`.

## 6) Notes
- Do not change production env vars. Sandbox uses separate keys.
- Webhook signature verification uses `PADDLE_WEBHOOK_SECRET` (HMAC). Public key is not required today.
- Keep `PAYMENT_GATEWAY=paddle`; otherwise the mock gateway may be used in non-production.
