# Testing WhatsApp with the Mock Server

Use the **Mock WhatsApp** server to test WhatsApp send/receive and webhooks without a real Meta account.

## What it does

- Exposes a **Meta WhatsApp Cloud API–compatible** API (same paths and request/response shapes).
- Lets the main app **send messages** and run **test connection** against it.
- Can **forward simulated incoming messages and status updates** to your app’s webhook.

## Quick setup

1. **Start the mock server**
   ```bash
   cd mock-whatsapp
   npm install
   npm run dev
   ```
   Default: http://localhost:9999

2. **Point the main app at the mock**
   In your server environment (e.g. `.env`):
   ```env
   META_GRAPH_URL=http://localhost:9999
   ```
   The app will then call `http://localhost:9999/v21.0/...` instead of `https://graph.facebook.com/...`.

3. **Configure WhatsApp in the main app**
   - **API key**: Any value (e.g. `mock-token`).
   - **Phone number ID**: `MOCK_PHONE_NUMBER_ID` (or whatever you set in the mock).
   - **Verify token**: `mock-verify-token` (must match mock).
   - **Webhook URL**: Your app’s webhook URL (e.g. ngrok URL + `/api/whatsapp/webhook` for local testing).

4. **Set the mock’s webhook** (so it can push events to your app)
   - `POST http://localhost:9999/mock/config` with body:  
     `{ "webhookUrl": "https://your-ngrok-url.ngrok.io/api/whatsapp/webhook" }`  
   - Or set `MOCK_WHATSAPP_WEBHOOK_URL` in the mock’s env.

## Simulating events

- **Incoming message**  
  `POST http://localhost:9999/mock/simulate/incoming`  
  Body: `{ "from": "15551234567", "text": "Hello" }`  
  The mock will POST a Meta-style webhook payload to your webhook URL.

- **Status update (sent/delivered/read)**  
  `POST http://localhost:9999/mock/simulate/status`  
  Body: `{ "messageId": "wamid.xxx", "status": "delivered", "recipientId": "15551234567" }`

## More details

See **mock-whatsapp/README.md** for full API, env vars, and config options.
