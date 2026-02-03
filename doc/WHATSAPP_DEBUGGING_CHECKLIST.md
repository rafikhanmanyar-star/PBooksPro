# WhatsApp Message Debugging Checklist

**Issue:** Client shows success but no server logs, no Meta update, message not received

## Step-by-Step Debugging Process

### 1. Check Client Console Logs

**Look for:**
```
[WhatsApp Chat Service] [send_xxx] ===== INITIATING MESSAGE SEND =====
[WhatsApp Chat Service] [send_xxx] Making API call to server...
[WhatsApp Chat Service] [send_xxx] ✅✅✅ SERVER RESPONSE RECEIVED ✅✅✅
```

**If you see:**
- ✅ All three logs → Request reached server
- ❌ Only first log → Network error, request never sent
- ❌ Error log → Check error details

### 2. Check Server Logs (Render Dashboard)

**Look for in order:**

#### A. Router Middleware Log
```
[WhatsApp Router] [whatsapp_xxx] ===== REQUEST RECEIVED =====
```
**If missing:** Request not reaching WhatsApp router (check route registration)

#### B. Route Handler Log
```
[WhatsApp Send] [req_xxx] ===== ROUTE HANDLER CALLED =====
```
**If missing:** Request blocked by middleware (tenant/auth issue)

#### C. Service Call Log
```
[WhatsApp API Service] [send_xxx] ===== sendTextMessage CALLED =====
```
**If missing:** Route handler not calling service (check route code)

#### D. Configuration Log
```
[WhatsApp API Service] [send_xxx] ✅ Configuration loaded successfully
```
**If missing or shows error:** WhatsApp not configured for tenant

#### E. Meta API Call Log
```
[WhatsApp API Service] [send_xxx] ===== CALLING META API =====
```
**If missing:** Service not reaching Meta API call

#### F. Meta API Response Log
```
[WhatsApp API Service] [send_xxx] ===== META API RESPONSE DETAILS =====
```
**If missing:** Meta API call failed or timed out

#### G. Success Log
```
[WhatsApp Send] [req_xxx] ✅✅✅ MESSAGE SENT SUCCESSFULLY ✅✅✅
```
**If missing:** Error occurred after Meta API call

### 3. Common Issues & Solutions

#### Issue: No Router Log
**Symptom:** No `[WhatsApp Router]` log
**Cause:** Request not reaching WhatsApp routes
**Check:**
- Route registration in `server/api/index.ts`
- URL path matches `/api/whatsapp/send`
- HTTP method is POST

#### Issue: No Route Handler Log
**Symptom:** Router log exists but no route handler log
**Cause:** Tenant middleware blocking request
**Check:**
- `req.tenantId` is set
- Authentication token is valid
- Tenant exists in database

**Look for:**
```
[WhatsApp Send] [req_xxx] ❌ MISSING TENANT ID - Request blocked
```

#### Issue: No Service Call Log
**Symptom:** Route handler log exists but no service log
**Cause:** Route handler error before service call
**Check:**
- Request body validation
- Missing phoneNumber or message fields

**Look for:**
```
[WhatsApp Send] [req_xxx] ❌ Missing required fields
```

#### Issue: No Configuration Log
**Symptom:** Service called but no config loaded
**Cause:** WhatsApp not configured for tenant
**Check:**
- Configuration exists in database
- `whatsapp_configs` table has entry for tenant
- Configuration is active

**Look for:**
```
[WhatsApp API Service] [send_xxx] ❌ NO CONFIGURATION FOUND FOR TENANT
```

#### Issue: No Meta API Call Log
**Symptom:** Config loaded but no Meta API call
**Cause:** Error before API call (phone formatting, etc.)
**Check:**
- Phone number format
- API key validity
- Service initialization

#### Issue: Meta API Call Fails
**Symptom:** Meta API call log exists but no response
**Cause:** Network error, invalid credentials, rate limit
**Check:**
- API key is valid and not expired
- Phone number ID is correct
- Meta API is accessible
- Rate limits not exceeded

**Look for error logs:**
```
[WhatsApp API Service] [send_xxx] ❌❌❌ ERROR SENDING MESSAGE ❌❌❌
```

#### Issue: Invalid Meta Response
**Symptom:** Meta API responds but no message ID
**Cause:** Meta API returned error or unexpected format
**Check:**
- Response structure
- Error messages in response
- Meta API status

**Look for:**
```
[WhatsApp API Service] [send_xxx] ❌ INVALID RESPONSE FROM META API
```

### 4. Verify Request Flow

**Complete successful flow should show:**

1. ✅ `[WhatsApp Chat Service]` - Client initiates
2. ✅ `[WhatsApp Router]` - Request reaches router
3. ✅ `[WhatsApp Send]` - Route handler called
4. ✅ `[WhatsApp API Service]` - Service method called
5. ✅ Configuration loaded
6. ✅ Meta API called
7. ✅ Meta API response received
8. ✅ Message ID extracted
9. ✅ Database save
10. ✅ Success response sent

**If any step is missing, that's where the issue is.**

### 5. Check Meta Dashboard

**After sending message:**
1. Go to Meta Business Suite
2. Navigate to WhatsApp → API Setup
3. Check "Message Logs" or "API Logs"
4. Look for your message

**If message appears in Meta:**
- ✅ Server is working correctly
- ✅ Issue is with recipient or phone number

**If message doesn't appear in Meta:**
- ❌ Server not reaching Meta API
- ❌ Check Meta API logs in server
- ❌ Verify API credentials

### 6. Verify Phone Number

**Check:**
- Phone number is in international format (no +, no spaces)
- Phone number is verified in Meta Dashboard
- Phone number has opted in (for production)
- Phone number is in test list (for sandbox)

### 7. Check API Credentials

**Verify:**
- Access Token is valid (not expired)
- Phone Number ID is correct
- Business Account ID matches (if required)
- API permissions are granted

**Test credentials:**
```bash
curl -X GET "https://graph.facebook.com/v18.0/{PHONE_NUMBER_ID}" \
  -H "Authorization: Bearer {ACCESS_TOKEN}"
```

Should return phone number details.

### 8. Network & Firewall

**Check:**
- Server can reach `graph.facebook.com`
- No firewall blocking outbound HTTPS
- DNS resolution works
- SSL certificates valid

### 9. Database Check

**Verify message was saved:**
```sql
SELECT * FROM whatsapp_messages 
WHERE tenant_id = 'your_tenant_id' 
ORDER BY created_at DESC 
LIMIT 10;
```

**If message exists in DB:**
- ✅ Server processed request
- ✅ Check status field (sent/failed)

**If message doesn't exist:**
- ❌ Request didn't reach database save
- ❌ Check logs before database save

### 10. Response Validation

**Client should validate:**
- Response has `messageId` or `wamId`
- Response doesn't have `error` field
- Status is 'sent'

**If client gets success but no messageId:**
- Server returned invalid response
- Check server logs for actual response

## Quick Diagnostic Commands

### Check Server Logs (Render)
```bash
# Filter for WhatsApp logs
grep "\[WhatsApp" logs.txt

# Filter for specific request
grep "req_1234567890" logs.txt

# Filter for errors
grep "❌" logs.txt
```

### Check Client Logs (Browser Console)
```javascript
// Filter WhatsApp logs
console.log = (function(originalLog) {
  return function(...args) {
    if (args[0] && args[0].includes('[WhatsApp')) {
      originalLog.apply(console, args);
    }
  };
})(console.log);
```

## Expected Log Sequence

**Successful send:**
```
[WhatsApp Chat Service] [send_xxx] ===== INITIATING MESSAGE SEND =====
[WhatsApp Router] [whatsapp_xxx] ===== REQUEST RECEIVED =====
[WhatsApp Send] [req_xxx] ===== ROUTE HANDLER CALLED =====
[WhatsApp Send] [req_xxx] ✅ Fields validated, calling sendTextMessage service
[WhatsApp API Service] [send_xxx] ===== sendTextMessage CALLED =====
[WhatsApp API Service] [send_xxx] ✅ Configuration loaded successfully
[WhatsApp API Service] [send_xxx] ===== CALLING META API =====
[WhatsApp API Service] [send_xxx] ✅ HTTP Response received from Meta
[WhatsApp API Service] [send_xxx] ===== META API RESPONSE DETAILS =====
[WhatsApp API Service] [send_xxx] ✅ MESSAGE ID EXTRACTED FROM META RESPONSE
[WhatsApp Send] [req_xxx] ✅✅✅ MESSAGE SENT SUCCESSFULLY ✅✅✅
[WhatsApp Chat Service] [send_xxx] ✅✅✅ SERVER RESPONSE RECEIVED ✅✅✅
```

## Next Steps

1. **Run the diagnostic** - Check each log point
2. **Identify missing step** - That's where the issue is
3. **Check error logs** - Look for ❌ markers
4. **Verify credentials** - Test with Meta API directly
5. **Check Meta Dashboard** - See if message appears there

---

**Last Updated:** January 25, 2026
