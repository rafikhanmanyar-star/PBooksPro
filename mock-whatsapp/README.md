# Mock WhatsApp API

A **Meta WhatsApp Cloud API–compatible** mock server for testing PBooksPro WhatsApp functionality without a real Meta account.

## Features

- **Send messages**: Same request/response shape as Meta’s `POST /{phone-number-id}/messages`.
- **Test connection**: Implements `GET /{phone-number-id}` so the main app’s “Test connection” works.
- **Webhooks**: Configurable webhook URL; the mock can POST simulated incoming messages and status updates to your main app.
- **Simulate incoming**: `POST /mock/simulate/incoming` to fake a user message and optionally forward it to your webhook.
- **Simulate status**: `POST /mock/simulate/status` to fake `sent`/`delivered`/`read` and forward to your webhook.
- **Config**: View/update config via `GET`/`POST /mock/config` (port, phone number ID, verify token, webhook URL, etc.).

## Quick start

```bash
cd mock-whatsapp
npm install
npm run dev
```

Server runs at **http://localhost:9999** by default.

**Web UI**: Open **http://localhost:9999** in your browser to:
- Set webhook URL and sender config
- Send a simulated incoming message to the main app
- Simulate status updates (sent/delivered/read)
- View the message log

## Using with the main app

**Full local setup (mock + API + client on your machine):** see **[doc/WHATSAPP_MOCK_LOCAL_SETUP.md](../doc/WHATSAPP_MOCK_LOCAL_SETUP.md)** for step-by-step configuration.

### 1. Point the main app at the mock

Set the server’s base URL to the mock (no trailing slash):

```env
META_GRAPH_URL=http://localhost:9999
```

So the main app will call `http://localhost:9999/v21.0/{phoneNumberId}/messages` instead of `https://graph.facebook.com/v21.0/...`.

### 2. Configure WhatsApp in the main app

In PBooksPro WhatsApp settings use:

- **API key**: Any value (e.g. `mock-token`); the mock accepts any token by default.
- **Phone number ID**: Same as the mock’s, e.g. `MOCK_PHONE_NUMBER_ID` (or set via `/mock/config` or `MOCK_WHATSAPP_PHONE_NUMBER_ID`).
- **Verify token**: Same as the mock’s, e.g. `mock-verify-token` (or set via env `MOCK_WHATSAPP_VERIFY_TOKEN`).
- **Webhook URL**: Your main app’s webhook URL (e.g. `https://your-domain.com/api/whatsapp/webhook`). For local testing use a tunnel (ngrok, etc.) and put that URL here.

### 3. Set the mock’s webhook (so it can push events to the main app)

Either:

- **Env**: `MOCK_WHATSAPP_WEBHOOK_URL=https://your-domain.com/api/whatsapp/webhook`
- **API**: `POST http://localhost:9999/mock/config` with body `{ "webhookUrl": "https://your-domain.com/api/whatsapp/webhook" }`

Then:

- **Simulate incoming message**:  
  `POST http://localhost:9999/mock/simulate/incoming`  
  Body: `{ "from": "15551234567", "text": "Hello" }`  
  The mock will POST a Meta-style webhook payload to your main app’s webhook.

- **Simulate status**:  
  `POST http://localhost:9999/mock/simulate/status`  
  Body: `{ "messageId": "wamid.xxx", "status": "delivered", "recipientId": "15551234567" }`

## API summary

| Purpose | Method | URL |
|--------|--------|-----|
| Meta-compatible: get phone info | GET | `/{version}/{phoneNumberId}` |
| Meta-compatible: send message | POST | `/{version}/{phoneNumberId}/messages` |
| Get mock config | GET | `/mock/config` |
| Update mock config | POST | `/mock/config` |
| Default config | GET | `/mock/config/defaults` |
| Webhook verification (Meta-style) | GET | `/mock/verify?hub.mode=subscribe&hub.verify_token=...&hub.challenge=...` |
| List messages | GET | `/mock/messages` |
| Clear messages | DELETE | `/mock/messages` |
| Simulate incoming message | POST | `/mock/simulate/incoming` |
| Simulate status update | POST | `/mock/simulate/status` |

## Environment variables (optional)

See `.env.example`. All have defaults; you can run without a `.env` file.

## Config (POST /mock/config)

Example body to set webhook and sender:

```json
{
  "webhookUrl": "https://your-app.com/api/whatsapp/webhook",
  "phoneNumberId": "MOCK_PHONE_NUMBER_ID",
  "displayPhoneNumber": "+15550000000",
  "verifyToken": "mock-verify-token"
}
```

This lets you add webhooks, change sender number, and other options without restarting.
