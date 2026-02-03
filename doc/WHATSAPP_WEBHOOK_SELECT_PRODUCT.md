# WhatsApp Webhook: Select the Correct Product

## Issue

The webhook page shows **"Select product"** set to **"User"**.  
For WhatsApp message webhooks you must use **"WhatsApp Business Account"**, not "User".

- **User** → fields like `about`, `birthday`, `books`, `email` (Facebook User profile).
- **WhatsApp Business Account** → fields like `messages`, `message_status` (WhatsApp).

If the product is "User", the **messages** field is not available and Meta will not send WhatsApp message events to your callback URL.

---

## Fix

### Step 1: Change the product

1. On the **Webhooks** page, find the **"Select product"** dropdown at the top.
2. Change it from **"User"** to **"WhatsApp Business Account"** (or "Whatsapp Business Account").
3. The list of fields will change to WhatsApp fields (e.g. `messages`, `message_status`, etc.).

### Step 2: Configure webhook (same as before)

- **Callback URL:** `https://jaycob-unslackening-binately.ngrok-free.dev/api/whatsapp/webhook`
- **Verify token:** Keep your existing token.
- Click **"Verify and save"** if you changed anything or to re-verify.

### Step 3: Subscribe to WhatsApp fields

After switching to **WhatsApp Business Account**, in the webhook fields table:

1. Find **`messages`** and turn the **Subscribe** toggle **ON**.
2. Find **`message_status`** and turn **Subscribe** **ON** (for delivery/read receipts).
3. Click **Save** if there is a save button for the subscriptions.

### Step 4: Confirm

- Product: **WhatsApp Business Account**
- Callback URL: your ngrok URL + `/api/whatsapp/webhook`
- **messages**: Subscribed  
- **message_status**: Subscribed  

Then send a message from your mobile and check ngrok + server logs for a POST to your webhook.
