# WhatsApp API Backend Testing Guide

This guide explains how to test the WhatsApp API backend implementation without the frontend.

## Prerequisites

1. **Database Migration**
   - Run the migration to create WhatsApp tables:
   ```bash
   cd server
   npm run migrate
   ```
   - Or manually run the SQL file:
   ```bash
   psql -d your_database -f migrations/add-whatsapp-integration.sql
   ```

2. **Start the Server**
   ```bash
   cd server
   npm run dev
   ```

3. **Get Authentication Token**
   - You need a valid JWT token to test protected endpoints
   - Login via the API to get a token (see below)

## Quick Test Script

A test script is provided to automate testing:

```bash
cd server
npx tsx scripts/test-whatsapp-api.ts
```

Set environment variables for full testing:
```bash
export TEST_USER_TOKEN="your_jwt_token_here"
export TEST_TENANT_ID="your_tenant_id"
export API_URL="http://localhost:3000"
```

## Manual Testing

### 1. Health Check

Test if the server is running:

```bash
curl http://localhost:3000/health
```

Expected response:
```json
{
  "status": "ok",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "database": "connected"
}
```

### 2. Get Authentication Token

Login to get a JWT token:

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "organizationEmail": "your-tenant-email@example.com",
    "username": "your-username",
    "password": "your-password"
  }'
```

Response will include a `token` field. Save this token for subsequent requests.

### 3. Get WhatsApp Configuration

Check if WhatsApp is configured:

```bash
curl -X GET http://localhost:3000/api/whatsapp/config \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

Expected response (if not configured):
```json
{
  "configured": false,
  "message": "WhatsApp API not configured yet"
}
```

### 4. Save WhatsApp Configuration

Configure WhatsApp API credentials:

```bash
curl -X POST http://localhost:3000/api/whatsapp/config \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -H "Content-Type: application/json" \
  -d '{
    "apiKey": "YOUR_WHATSAPP_ACCESS_TOKEN",
    "phoneNumberId": "YOUR_PHONE_NUMBER_ID",
    "verifyToken": "YOUR_VERIFY_TOKEN",
    "webhookUrl": "https://your-domain.com/api/whatsapp/webhook"
  }'
```

**Note:** Replace with your actual Meta WhatsApp Business API credentials:
- `apiKey`: Access token from Meta App Dashboard
- `phoneNumberId`: Phone Number ID from Meta App Dashboard
- `verifyToken`: A random string you choose (used for webhook verification)
- `webhookUrl`: Public URL where Meta will send webhooks

Expected response:
```json
{
  "configured": true,
  "id": "whatsapp_config_...",
  "tenantId": "tenant_123",
  "phoneNumberId": "YOUR_PHONE_NUMBER_ID",
  "businessAccountId": null,
  "webhookUrl": "https://your-domain.com/api/whatsapp/webhook",
  "isActive": true,
  "createdAt": "2024-01-01T00:00:00.000Z",
  "updatedAt": "2024-01-01T00:00:00.000Z"
}
```

### 5. Test Connection

Test if the WhatsApp API credentials are valid:

```bash
curl -X POST http://localhost:3000/api/whatsapp/test-connection \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

Expected response (if valid):
```json
{
  "success": true,
  "message": "Connection successful"
}
```

### 6. Send a Message

Send a test message (requires valid credentials and phone number):

```bash
curl -X POST http://localhost:3000/api/whatsapp/send \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -H "Content-Type: application/json" \
  -d '{
    "phoneNumber": "1234567890",
    "message": "Test message from API"
  }'
```

**Note:** 
- Phone number should be in international format (without + sign)
- For production, you need approved message templates for initial messages
- Use test phone numbers from Meta's test suite during development

Expected response:
```json
{
  "messageId": "msg_1234567890_abc123",
  "wamId": "wamid.xyz...",
  "status": "sent"
}
```

### 7. Get Messages

Retrieve message history:

```bash
# Get all messages
curl -X GET http://localhost:3000/api/whatsapp/messages \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"

# Get messages for a specific contact
curl -X GET "http://localhost:3000/api/whatsapp/messages?contactId=contact_123" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"

# Get messages for a phone number
curl -X GET "http://localhost:3000/api/whatsapp/messages?phoneNumber=1234567890" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"

# With pagination
curl -X GET "http://localhost:3000/api/whatsapp/messages?limit=20&offset=0" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

### 8. Get Unread Count

Get count of unread messages:

```bash
curl -X GET http://localhost:3000/api/whatsapp/unread-count \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

Expected response:
```json
{
  "count": 5
}
```

### 9. Mark Message as Read

Mark a message as read:

```bash
curl -X POST http://localhost:3000/api/whatsapp/messages/MESSAGE_ID/read \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

### 10. Webhook Verification (Public Endpoint)

Meta calls this endpoint to verify the webhook URL:

```bash
curl -X GET "http://localhost:3000/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=YOUR_VERIFY_TOKEN&hub.challenge=test_challenge"
```

Expected: Returns the challenge string if verify_token matches.

### 11. Webhook Event (Public Endpoint)

Meta sends webhook events to this endpoint. You can simulate with:

```bash
curl -X POST http://localhost:3000/api/whatsapp/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "object": "whatsapp_business_account",
    "entry": [{
      "id": "WHATSAPP_BUSINESS_ACCOUNT_ID",
      "changes": [{
        "value": {
          "messaging_product": "whatsapp",
          "metadata": {
            "phone_number_id": "YOUR_PHONE_NUMBER_ID"
          },
          "messages": [{
            "from": "1234567890",
            "id": "wamid.test123",
            "timestamp": "1234567890",
            "text": {
              "body": "Test incoming message"
            },
            "type": "text"
          }]
        },
        "field": "messages"
      }]
    }]
  }'
```

Expected response:
```json
{
  "received": true
}
```

### 12. Delete Configuration

Remove WhatsApp configuration:

```bash
curl -X DELETE http://localhost:3000/api/whatsapp/config \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

Expected response:
```json
{
  "success": true,
  "message": "WhatsApp configuration deleted"
}
```

## Using Postman or Insomnia

1. **Import Collection**: Create a new collection with these endpoints
2. **Set Environment Variables**:
   - `base_url`: `http://localhost:3000`
   - `token`: Your JWT token
   - `tenant_id`: Your tenant ID
3. **Set Authorization**: Use Bearer token for all protected endpoints
4. **Test Sequentially**: Follow the order above

## Database Verification

Check if tables were created:

```sql
-- Check if tables exist
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name IN ('whatsapp_configs', 'whatsapp_messages');

-- Check configuration
SELECT id, tenant_id, phone_number_id, is_active, created_at 
FROM whatsapp_configs;

-- Check messages
SELECT id, tenant_id, phone_number, direction, status, message_text, timestamp 
FROM whatsapp_messages 
ORDER BY timestamp DESC 
LIMIT 10;
```

## Common Issues

1. **401 Unauthorized**: Token is missing or invalid - login again
2. **404 Not Found**: Endpoint doesn't exist - check server is running
3. **500 Internal Server Error**: Check server logs for details
4. **Database Connection Error**: Ensure PostgreSQL is running and DATABASE_URL is set
5. **Migration Not Run**: Run `npm run migrate` in server directory
6. **Encryption Key Not Set**: Set `WHATSAPP_ENCRYPTION_KEY` environment variable (64 hex characters)

## Environment Variables

Required environment variables:

```env
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/dbname

# JWT
JWT_SECRET=your_jwt_secret

# WhatsApp Encryption (generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
WHATSAPP_ENCRYPTION_KEY=your_64_character_hex_key

# Optional
META_API_VERSION=v21.0
PORT=3000
```

## Next Steps

Once backend testing is complete:
1. Set up webhook URL in Meta App Dashboard
2. Test with real WhatsApp Business API credentials
3. Test webhook delivery from Meta
4. Implement frontend components
5. Integration testing with frontend
