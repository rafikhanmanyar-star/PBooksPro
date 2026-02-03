# WhatsApp Logging Guide

**Date:** January 25, 2026  
**Purpose:** Comprehensive logging for debugging WhatsApp API integration

## Overview

Comprehensive logging has been added to both **server-side** and **client-side** code to help debug WhatsApp API issues. All logs include unique request IDs, timestamps, and detailed context.

## Log Format

All logs follow this pattern:
```
[Component] [RequestID] Action description
{
  key: value,
  timestamp: ISO8601
}
```

**Request IDs** are unique per operation and help trace a single request through the entire flow.

## Server-Side Logs

### 1. Configuration Loading

**Location:** `server/api/routes/whatsapp.ts` - GET `/api/whatsapp/config`

**Logs:**
- `[WhatsApp Config] GET /config request received` - Request received
- `[WhatsApp Config] No configuration found for tenant` - No config exists
- `[WhatsApp Config] Configuration loaded` - Config retrieved successfully

**Example:**
```json
[WhatsApp Config] GET /config request received {
  tenantId: "tenant_123",
  timestamp: "2026-01-25T14:30:00.000Z"
}
```

### 2. Connection Testing

**Location:** `server/api/routes/whatsapp.ts` - POST `/api/whatsapp/test-connection`

**Logs:**
- `[WhatsApp Test Connection] [test_xxx] Request received` - Test started
- `[WhatsApp Test Connection] [test_xxx] Calling testConnection service` - Service called
- `[WhatsApp Test Connection] [test_xxx] Connection test successful` - ✅ Success
- `[WhatsApp Test Connection] [test_xxx] Connection test failed` - ❌ Failed

**Location:** `server/services/whatsappApiService.ts` - `testConnection()`

**Logs:**
- `[WhatsApp API Service] [test_xxx] testConnection called`
- `[WhatsApp API Service] [test_xxx] Configuration loaded` - Shows API key prefix, phone number ID
- `[WhatsApp API Service] [test_xxx] Making test API call to Meta` - Shows full URL
- `[WhatsApp API Service] [test_xxx] Meta API response received` - Response details
- `[WhatsApp API Service] [test_xxx] Connection test successful` - ✅ Success
- `[WhatsApp API Service] [test_xxx] Connection test failed` - ❌ Failed with full error details

**Example Success:**
```json
[WhatsApp API Service] [test_1234567890_abc] Meta API response received {
  status: 200,
  statusText: "OK",
  hasData: true,
  responseKeys: ["id", "verified_name", "code_verification_status"],
  duration: "245ms"
}
```

**Example Failure:**
```json
[WhatsApp API Service] [test_1234567890_abc] Connection test failed {
  error: "Invalid OAuth access token",
  errorCode: 190,
  errorResponse: {
    status: 401,
    data: { error: { message: "Invalid OAuth access token", type: "OAuthException" } }
  }
}
```

### 3. Message Sending

**Location:** `server/api/routes/whatsapp.ts` - POST `/api/whatsapp/send`

**Logs:**
- `[WhatsApp Send] [req_xxx] Request received` - Request received with phone number (masked)
- `[WhatsApp Send] [req_xxx] Missing required fields` - Validation error
- `[WhatsApp Send] [req_xxx] Calling sendTextMessage service` - Service called
- `[WhatsApp Send] [req_xxx] Message sent successfully` - ✅ Success
- `[WhatsApp Send] [req_xxx] Error sending WhatsApp message` - ❌ Failed

**Location:** `server/services/whatsappApiService.ts` - `sendTextMessage()`

**Logs:**
- `[WhatsApp API Service] [send_xxx] sendTextMessage called` - Function called
- `[WhatsApp API Service] [send_xxx] Configuration loaded` - Config details
- `[WhatsApp API Service] [send_xxx] Phone number formatted` - Formatting result
- `[WhatsApp API Service] [send_xxx] Sending request to Meta API` - Full URL and payload
- `[WhatsApp API Service] [send_xxx] Meta API response received` - Response from Meta
- `[WhatsApp API Service] [send_xxx] Message ID received from Meta` - WAM ID
- `[WhatsApp API Service] [send_xxx] Saving message to database` - DB save
- `[WhatsApp API Service] [send_xxx] Message sent successfully` - ✅ Complete
- `[WhatsApp API Service] [send_xxx] Error sending WhatsApp message` - ❌ Failed

**Example Success:**
```json
[WhatsApp API Service] [send_1234567890_abc] Meta API response received {
  status: 200,
  hasMessages: true,
  messageCount: 1,
  duration: "312ms"
}

[WhatsApp API Service] [send_1234567890_abc] Message ID received from Meta {
  messageId: "wamid.xxx...",
  fullResponse: "{...}"
}
```

**Example Failure:**
```json
[WhatsApp API Service] [send_1234567890_abc] Error sending WhatsApp message {
  error: "Invalid phone number",
  errorCode: 100,
  errorResponse: {
    status: 400,
    data: { error: { message: "Invalid phone number format", type: "OAuthException" } }
  }
}
```

### 4. Webhook Processing

**Location:** `server/services/whatsappApiService.ts` - `processWebhook()`

**Logs:**
- `[WhatsApp API Service] [webhook_xxx] Processing webhook` - Webhook received
- `[WhatsApp API Service] [webhook_xxx] Processing entry` - Entry details
- `[WhatsApp API Service] [webhook_xxx] Processing change` - Change details
- `[WhatsApp API Service] [webhook_xxx] Processing N incoming message(s)` - Messages count
- `[WhatsApp API Service] [webhook_xxx] Processing N status update(s)` - Statuses count
- `[WhatsApp API Service] [webhook_xxx] Webhook processing completed` - ✅ Complete
- `[WhatsApp API Service] [webhook_xxx] Error processing webhook` - ❌ Failed

## Client-Side Logs

### 1. Configuration Loading

**Location:** `components/settings/WhatsAppConfigForm.tsx` - `loadConfig()`

**Logs:**
- `[WhatsApp Client] [load_xxx] Loading configuration` - Started
- `[WhatsApp Client] [load_xxx] Configuration loaded from server` - Success with details
- `[WhatsApp Client] [load_xxx] No configuration found (new tenant)` - No config
- `[WhatsApp Client] [load_xxx] API key exists in database` - Key found
- `[WhatsApp Client] [load_xxx] Auto-testing connection status` - Auto-test triggered
- `[WhatsApp Client] [load_xxx] Error loading configuration` - ❌ Failed

**Example:**
```json
[WhatsApp Client] [load_1234567890_abc] Configuration loaded from server {
  configured: true,
  hasApiKey: true,
  phoneNumberId: "1234567890",
  hasWebhookUrl: true,
  isActive: true,
  duration: "156ms"
}
```

### 2. Connection Testing

**Location:** `components/settings/WhatsAppConfigForm.tsx` - `testConnectionStatus()`, `handleTestConnection()`

**Logs:**
- `[WhatsApp Client] [test_xxx] Testing connection status` - Started
- `[WhatsApp Client] [test_xxx] Testing connection with stored API key` - Using stored key
- `[WhatsApp Client] [test_xxx] Testing connection with new credentials` - Using new key
- `[WhatsApp Client] [test_xxx] Saving configuration before test` - Saving config
- `[WhatsApp Client] [test_xxx] Connection test successful` - ✅ Success
- `[WhatsApp Client] [test_xxx] Connection test failed` - ❌ Failed

**Example:**
```json
[WhatsApp Client] [test_1234567890_abc] Connection test successful {
  success: true,
  message: "Connection successful",
  duration: "423ms"
}
```

### 3. Test Message Sending

**Location:** `components/settings/WhatsAppConfigForm.tsx` - `handleSendTestMessage()`

**Logs:**
- `[WhatsApp Client] [send_xxx] Sending test message` - Started with details
- `[WhatsApp Client] [send_xxx] Test message sent successfully` - ✅ Success
- `[WhatsApp Client] [send_xxx] Error sending test message` - ❌ Failed

**Example:**
```json
[WhatsApp Client] [send_1234567890_abc] Sending test message {
  phoneNumber: "91987***",
  phoneNumberLength: 12,
  messageLength: 45,
  messagePreview: "Hello! This is a test message from PBooksPro."
}

[WhatsApp Client] [send_1234567890_abc] Test message sent successfully {
  messageId: "msg_1234567890_abc",
  wamId: "wamid.xxx...",
  status: "sent",
  duration: "567ms"
}
```

### 4. General Message Sending

**Location:** `services/whatsappChatService.ts` - `sendMessage()`

**Logs:**
- `[WhatsApp Chat Service] [send_xxx] Sending message` - Started
- `[WhatsApp Chat Service] [send_xxx] Message sent successfully` - ✅ Success
- `[WhatsApp Chat Service] [send_xxx] Error sending message` - ❌ Failed

## How to Use Logs for Debugging

### Issue: Messages Not Reaching Meta

**Check these logs in order:**

1. **Client Request:**
   ```
   [WhatsApp Client] [send_xxx] Sending test message
   ```
   - Verify phone number format
   - Verify message length

2. **Server Route:**
   ```
   [WhatsApp Send] [req_xxx] Request received
   ```
   - Verify request reached server
   - Check for validation errors

3. **Service Layer:**
   ```
   [WhatsApp API Service] [send_xxx] Configuration loaded
   ```
   - Verify API key exists
   - Check phone number ID

4. **Meta API Call:**
   ```
   [WhatsApp API Service] [send_xxx] Sending request to Meta API
   ```
   - Check full URL
   - Verify payload structure

5. **Meta Response:**
   ```
   [WhatsApp API Service] [send_xxx] Meta API response received
   ```
   - Check status code
   - Review error message if failed

### Issue: Connection Test Fails

**Check these logs:**

1. **Configuration:**
   ```
   [WhatsApp API Service] [test_xxx] Configuration loaded
   ```
   - Verify API key prefix (first 10 chars)
   - Check phone number ID

2. **Meta API Call:**
   ```
   [WhatsApp API Service] [test_xxx] Making test API call to Meta
   ```
   - Verify URL is correct
   - Check if API key is being sent

3. **Meta Response:**
   ```
   [WhatsApp API Service] [test_xxx] Meta API response received
   ```
   - Check status code (should be 200)
   - Review error details if failed

### Issue: Webhook Not Working

**Check these logs:**

1. **Webhook Received:**
   ```
   [WhatsApp API Service] [webhook_xxx] Processing webhook
   ```
   - Verify webhook is being received
   - Check entry count

2. **Message Processing:**
   ```
   [WhatsApp API Service] [webhook_xxx] Processing N incoming message(s)
   ```
   - Verify messages are being processed
   - Check for errors in processing

## Log Levels

- **INFO:** Normal operations (✅ success)
- **WARN:** Non-critical issues (⚠️ warnings)
- **ERROR:** Failures (❌ errors)

## Privacy & Security

**Sensitive data is masked in logs:**
- Phone numbers: `91987***` (first 5 digits only)
- API keys: `EAAxxx...` (first 10 chars only)
- Messages: First 50 chars + "..."
- Full responses: First 500-1000 chars only

## Viewing Logs

### Server Logs (Render/Production)
1. Go to Render Dashboard
2. Select your service
3. Click "Logs" tab
4. Filter by `[WhatsApp` to see only WhatsApp logs

### Client Logs (Browser)
1. Open Browser DevTools (F12)
2. Go to "Console" tab
3. Filter by `[WhatsApp` to see only WhatsApp logs
4. Use "Preserve log" to keep logs after navigation

### Searching Logs

**By Request ID:**
```
[WhatsApp *] [send_1234567890_abc]
```
This shows all logs for that specific send operation.

**By Component:**
```
[WhatsApp Client] *
[WhatsApp API Service] *
[WhatsApp Send] *
```

**By Action:**
```
* Connection test *
* Sending message *
* Error *
```

## Common Error Patterns

### 1. Invalid OAuth Token
```
error: "Invalid OAuth access token"
errorCode: 190
status: 401
```
**Solution:** Regenerate API key in Meta Dashboard

### 2. Invalid Phone Number
```
error: "Invalid phone number format"
errorCode: 100
status: 400
```
**Solution:** Ensure phone number is in international format (no +, no spaces)

### 3. Rate Limit Exceeded
```
error: "Rate limit exceeded"
errorCode: 4
status: 429
```
**Solution:** Wait and retry, or upgrade Meta plan

### 4. Phone Number Not Verified
```
error: "Phone number not verified"
errorCode: 190
status: 400
```
**Solution:** Verify phone number in Meta Dashboard

## Best Practices

1. **Always check logs in order** - Follow the request flow
2. **Use Request IDs** - Trace a single operation end-to-end
3. **Check both client and server** - Issues can be on either side
4. **Look for ERROR logs first** - They show what went wrong
5. **Compare timestamps** - Identify delays or timeouts
6. **Check duration** - Slow operations indicate network issues

## Troubleshooting Checklist

When messages don't reach Meta:

- [ ] Check client logs for request initiation
- [ ] Check server route logs for request receipt
- [ ] Check service logs for configuration
- [ ] Check Meta API call logs for actual request
- [ ] Check Meta API response logs for errors
- [ ] Verify API key is valid (not expired)
- [ ] Verify phone number format is correct
- [ ] Verify phone number is verified in Meta
- [ ] Check Meta Dashboard for message status
- [ ] Review error messages for specific issues

---

**Last Updated:** January 25, 2026
