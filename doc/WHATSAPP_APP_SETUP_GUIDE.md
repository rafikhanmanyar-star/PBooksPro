# How to Fill WhatsApp Settings in the App

You have your permanent access token from Meta. Follow these steps to configure it in the app.

---

## Step 1: Open WhatsApp Integration

1. **Log in** to your PBooksPro application
2. Go to **Settings** (gear icon in header or sidebar)
3. Find **"WhatsApp Integration"** card
4. Click it to open the configuration form

---

## Step 2: Fill in the Form Fields

### Required Fields (must fill):

| Field | What to Enter | Where to Get It |
|-------|---------------|-----------------|
| **Access Token (API Key)** | Your permanent token from Meta | Paste the full token you just generated. Copy it completely—it's long! |
| **Phone Number ID** | A long numeric ID | Meta Dashboard → **WhatsApp** → **API Setup**. Under "From" phone number, you'll see the Phone number ID (e.g. `123456789012345`) |
| **Webhook Verify Token** | A random string | Click **"Generate New Token"** in the form, or use the one already shown. **Copy and save it**—you'll need it for Meta webhook setup |

### Optional Fields:

| Field | What to Enter | When to Use |
|-------|---------------|-------------|
| **API Secret** | Leave blank | Only if your Meta app requires it (usually not) |
| **Business Account ID** | Leave blank | Only if you have multiple business accounts |
| **Webhook URL** | Your API URL + path | **Recommended.** Format: `https://your-api-server.com/api/whatsapp/webhook` <br> Example: `https://pbookspro-api-staging.onrender.com/api/whatsapp/webhook` |

---

## Step 3: Get Phone Number ID from Meta

1. Go to **Meta App Dashboard**: https://developers.facebook.com/apps  
2. Select your app  
3. Click **WhatsApp** in the left sidebar  
4. Click **API Setup**  
5. Under **"From"** you'll see your WhatsApp phone number  
6. The **Phone number ID** is the long number (e.g. `123456789012345`) — copy it  
7. Paste it into the **Phone Number ID** field in the app

---

## Step 4: Set Webhook URL

Use your **public API server URL** + `/api/whatsapp/webhook`:

- **Staging**: `https://pbookspro-api-staging.onrender.com/api/whatsapp/webhook`  
- **Production**: `https://your-production-api.com/api/whatsapp/webhook`  

Replace with your actual API URL if different.

---

## Step 5: Verify Token (Important!)

1. The form shows a **Webhook Verify Token** (or click **"Generate New Token"**)  
2. **Copy this token** and save it somewhere safe  
3. You will use the **exact same token** in Meta Dashboard when setting up the webhook  
4. Do **not** change it after saving—or update both the app and Meta Dashboard

---

## Step 6: Test Connection

1. Fill **Access Token** and **Phone Number ID** (and Verify Token if required)  
2. Click **"Test Connection"**  
3. You should see: **"Connection successful!"**  
4. If it fails, check:
   - Token copied completely (no spaces, no truncation)  
   - Correct Phone Number ID  
   - Server is running and reachable  

---

## Step 7: Save Configuration

1. After a successful test, click **"Save Configuration"** (or **"Update Configuration"**)  
2. You should see: **"WhatsApp configuration saved successfully!"**  
3. The form may close; configuration is now stored  

---

## Step 8: Configure Webhook in Meta (for receiving messages)

1. Go to **Meta App Dashboard** → **WhatsApp** → **Configuration**  
2. Find the **Webhooks** section  
3. Click **Edit** or **Configure**  
4. **Callback URL**: Enter your Webhook URL (e.g. `https://pbookspro-api-staging.onrender.com/api/whatsapp/webhook`)  
5. **Verify token**: Paste the **exact same** token from the app (from Step 5)  
6. Click **"Verify and Save"**  
7. Subscribe to: **messages** and **message_status**  

---

## Quick Checklist

- [ ] Opened Settings → WhatsApp Integration  
- [ ] Pasted **Access Token** (permanent token from Meta)  
- [ ] Entered **Phone Number ID** from Meta API Setup  
- [ ] Used or generated **Webhook Verify Token** and copied it  
- [ ] Entered **Webhook URL** (API URL + `/api/whatsapp/webhook`)  
- [ ] Clicked **Test Connection** → saw "Connection successful!"  
- [ ] Clicked **Save Configuration**  
- [ ] Set same Verify Token and Webhook URL in Meta Dashboard  

---

## Troubleshooting

| Issue | What to do |
|-------|------------|
| "Connection test failed" | Check token and Phone Number ID. Ensure token has `whatsapp_business_messaging` and `whatsapp_business_management`. |
| "Missing required fields" | Fill Access Token, Phone Number ID, and Webhook Verify Token. |
| 404 when saving | Ensure API server is running and you're logged in. See `doc/WHATSAPP_404_FIX.md`. |
| Webhook verification fails | Verify token in app and Meta Dashboard match **exactly**. See `doc/WHATSAPP_VERIFY_TOKEN_DEBUG.md`. |

---

## Summary

1. **Access Token** = Your permanent Meta token  
2. **Phone Number ID** = From WhatsApp → API Setup in Meta  
3. **Verify Token** = Generate in app, copy, use same in Meta webhook  
4. **Webhook URL** = `https://your-api.com/api/whatsapp/webhook`  
5. **Test** → **Save** → Configure webhook in Meta with the same Verify Token and Webhook URL  

---

**Last Updated**: January 2025
