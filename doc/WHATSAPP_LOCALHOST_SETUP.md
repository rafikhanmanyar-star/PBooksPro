# WhatsApp Webhook Setup for Localhost Development

This guide explains how to set up WhatsApp webhooks when your API server is running on localhost. Since Meta requires a publicly accessible HTTPS URL, we'll use **ngrok** to create a secure tunnel to your local server.

---

## Prerequisites

1. **Your API server running on localhost** (typically `http://localhost:3000`)
2. **ngrok installed** (see installation steps below)
3. **WhatsApp Business API credentials** from Meta

---

## Step 1: Install ngrok

### Option A: Download ngrok

1. Go to https://ngrok.com/download
2. Download ngrok for your operating system (Windows/macOS/Linux)
3. Extract the executable to a folder in your PATH

### Option B: Install via Package Manager

**Windows (PowerShell):**
```powershell
# Using Chocolatey
choco install ngrok

# Or using Scoop
scoop install ngrok
```

**macOS:**
```bash
brew install ngrok/ngrok/ngrok
```

**Linux:**
```bash
# Download and install
curl -s https://ngrok-agent.s3.amazonaws.com/ngrok.asc | sudo tee /etc/apt/trusted.gpg.d/ngrok.asc >/dev/null
echo "deb https://ngrok-agent.s3.amazonaws.com buster main" | sudo tee /etc/apt/sources.list.d/ngrok.list
sudo apt update && sudo apt install ngrok
```

---

## Step 2: Sign Up for ngrok (Free)

1. **Go to ngrok signup page:**
   - Open your browser and visit: https://dashboard.ngrok.com/signup
   - Or go to: https://ngrok.com/ and click "Sign up"

2. **Create your free account:**
   - Enter your email address
   - Create a password
   - Click "Sign up"
   - Verify your email if required

3. **Get your authtoken:**
   - After logging in, you'll be redirected to the dashboard
   - Go to: https://dashboard.ngrok.com/get-started/your-authtoken
   - You'll see a long string that looks like: `2abc123def456ghi789jkl012mno345pq_6rSTUV7wxyz8ABCD9EFGH0`
   - **Copy this entire token** - you'll need it in the next step

---

## Step 3: Configure ngrok (IMPORTANT - Do this first!)

**⚠️ You MUST configure ngrok with your authtoken before using it. This is why the terminal closes immediately.**

### For Windows (PowerShell or Command Prompt):

1. **Open PowerShell or Command Prompt:**
   - Press `Win + X` and select "Windows PowerShell" or "Command Prompt"
   - Or search for "PowerShell" in the Start menu

2. **Navigate to where ngrok is installed** (if you downloaded it):
   ```powershell
   # If ngrok is in a specific folder, navigate there first
   cd C:\path\to\ngrok
   ```
   
   **OR** if you installed via package manager, you can run it from anywhere.

3. **Configure ngrok with your authtoken:**
   ```powershell
   ngrok config add-authtoken YOUR_AUTHTOKEN_HERE
   ```
   
   Replace `YOUR_AUTHTOKEN_HERE` with the actual token you copied from Step 2.
   
   **Example:**
   ```powershell
   ngrok config add-authtoken 2abc123def456ghi789jkl012mno345pq_6rSTUV7wxyz8ABCD9EFGH0
   ```

4. **Verify the configuration:**
   - You should see: `Authtoken saved to configuration file: C:\Users\YourName\AppData\Local\ngrok\ngrok.yml`
   - If you see an error, make sure you copied the entire token correctly

5. **Test ngrok is working:**
   ```powershell
   ngrok version
   ```
   
   You should see the ngrok version number (e.g., `ngrok version 3.x.x`)

### For macOS/Linux:

1. **Open Terminal**

2. **Configure ngrok:**
   ```bash
   ngrok config add-authtoken YOUR_AUTHTOKEN_HERE
   ```

3. **Verify:**
   ```bash
   ngrok version
   ```

### Troubleshooting Step 3:

**If you get "command not found":**
- Make sure ngrok is installed and in your PATH
- Try using the full path to ngrok executable
- On Windows, you may need to restart your terminal after installation

**If you get "authtoken invalid":**
- Make sure you copied the ENTIRE token (it's very long)
- Don't include any spaces before or after
- Try copying it again from the dashboard

**If the command seems to hang:**
- Check your internet connection
- Make sure you're logged into ngrok dashboard
- Try again - sometimes it takes a moment

---

## Step 4: Start Your Local API Server

Make sure your API server is running on localhost (typically port 3000):

```bash
# In your server directory
npm start
# or
node server/index.js
```

Verify it's accessible:
- Open: `http://localhost:3000/health`
- Should return a health check response

---

## Step 5: Start ngrok Tunnel

**⚠️ Make sure you completed Step 3 (authtoken configuration) first!**

1. **Open a new terminal/command prompt:**
   - On Windows: Press `Win + X` → Select "Windows PowerShell" or "Command Prompt"
   - Keep this terminal window open - you'll see ngrok output here

2. **Start ngrok** pointing to your local server:
   ```powershell
   # For Windows PowerShell/Command Prompt
   ngrok http 3000
   ```
   
   Replace `3000` with your actual server port if different.
   
   **If ngrok is not in PATH, use full path:**
   ```powershell
   C:\path\to\ngrok.exe http 3000
   ```

3. **What you should see:**
   ```
   ngrok                                                                        
                                                                                
   Session Status                online                                        
   Account                       your-email@example.com (Plan: Free)           
   Version                       3.x.x                                          
   Region                        United States (us)                             
   Latency                       -                                              
   Web Interface                 http://127.0.0.1:4040                          
   Forwarding                    https://abc123def456.ngrok-free.app -> http://localhost:3000
                                                                                
   Connections                   ttl     opn     rt1     rt5     p50     p90    
                                 0       0       0.00    0.00    0.00    0.00   
   ```

4. **Copy the HTTPS URL** from the "Forwarding" line:
   - Look for: `https://abc123def456.ngrok-free.app -> http://localhost:3000`
   - Your webhook URL will be: `https://abc123def456.ngrok-free.app/api/whatsapp/webhook`

5. **Keep this terminal window open:**
   - ⚠️ **DO NOT close this terminal** - ngrok must keep running
   - If you close it, the tunnel stops and webhooks won't work
   - You can minimize it, but keep it running

   ⚠️ **Important Notes:**
   - The free ngrok URL changes every time you restart ngrok
   - For a stable URL, consider upgrading to ngrok paid plan
   - Keep this terminal window open while testing
   - You can also access ngrok web interface at: http://127.0.0.1:4040 (see all requests here)

### If ngrok terminal closes immediately:

**This means ngrok is not configured. Go back to Step 3 and configure the authtoken!**

Common issues:
- ❌ Authtoken not configured → Run `ngrok config add-authtoken YOUR_TOKEN`
- ❌ ngrok not in PATH → Use full path to ngrok.exe
- ❌ Invalid authtoken → Copy the token again from dashboard
- ❌ No internet connection → Check your internet

---

## Step 6: Configure WhatsApp in Your App

1. **Open your PBooksPro application**
2. Go to **Settings** → **WhatsApp Integration**
3. Fill in the form:
   - **Access Token**: Your Meta WhatsApp API access token
   - **Phone Number ID**: Your Meta phone number ID
   - **Webhook Verify Token**: Click "Generate New Token" or use existing
   - **Webhook URL**: Enter your ngrok URL + path
     ```
     https://abc123def456.ngrok-free.app/api/whatsapp/webhook
     ```
4. Click **"Test Connection"** to verify credentials
5. Click **"Save Configuration"**

---

## Step 7: Configure Webhook in Meta Dashboard

1. **Go to Meta App Dashboard**: https://developers.facebook.com/apps
2. Select your WhatsApp app
3. Navigate to **WhatsApp** → **Configuration**
4. Find the **Webhooks** section
5. Click **"Edit"** or **"Configure"**
6. Enter:
   - **Callback URL**: `https://abc123def456.ngrok-free.app/api/whatsapp/webhook`
     (Use your actual ngrok URL from Step 5)
   - **Verify Token**: The exact same token from your app (Step 6)
7. Click **"Verify and Save"**
8. **Subscribe to webhook fields:**
   - ✅ `messages` (for incoming/outgoing messages)
   - ✅ `message_status` (for delivery and read receipts)
9. Click **"Save"**

---

## Step 8: Test the Webhook

1. **Keep ngrok running** (the terminal window from Step 5)
2. **Keep your API server running** (the terminal from Step 4)
3. **Send a test WhatsApp message** to your configured phone number
4. **Check your API server logs** - you should see webhook requests:
   ```
   [WhatsApp Webhook] POST received
   [WhatsApp API Service] Processing incoming message
   ```
5. **Check ngrok dashboard**: https://dashboard.ngrok.com/status/tunnels
   - You should see webhook requests in the request inspector

---

## Troubleshooting

### Issue: ngrok URL changes every restart

**Solution:**
- Free ngrok URLs are temporary
- For development, restart ngrok and update the webhook URL in Meta Dashboard
- For production, use a paid ngrok plan with a static domain
- Or deploy to a staging server (Render, Heroku, etc.)

### Issue: Webhook verification fails

**Check:**
1. ✅ ngrok is running and forwarding to port 3000
2. ✅ Your API server is running on localhost:3000
3. ✅ Webhook URL in Meta matches ngrok URL exactly
4. ✅ Verify token in Meta matches the token in your app
5. ✅ Webhook endpoint is accessible: `https://your-ngrok-url.ngrok-free.app/api/whatsapp/webhook`

**Test webhook endpoint manually:**
```bash
curl "https://your-ngrok-url.ngrok-free.app/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=YOUR_TOKEN&hub.challenge=test123"
```

Should return: `test123`

### Issue: "ngrok: command not found"

**Solution:**
- Make sure ngrok is in your PATH
- Or use full path: `/path/to/ngrok http 3000`
- Or install via package manager (see Step 1)

### Issue: Webhook receives events but messages not processed

**Check:**
1. ✅ Server logs show webhook POST requests
2. ✅ Tenant ID is correctly identified from phone number ID
3. ✅ Database connection is working
4. ✅ WhatsApp config is active in database

**View ngrok request inspector:**
- Go to: http://localhost:4040 (ngrok web interface)
- See all requests and responses in real-time

### Issue: ngrok free plan limitations

**Limitations:**
- URL changes on restart
- Limited requests per minute
- Connection timeout after inactivity

**Solutions:**
- Use ngrok paid plan for static domain
- Deploy to staging server for testing
- Use localtunnel (alternative): `npx localtunnel --port 3000`

---

## Alternative: Using localtunnel

If you prefer not to sign up for ngrok:

1. **Install localtunnel:**
   ```bash
   npm install -g localtunnel
   ```

2. **Start tunnel:**
   ```bash
   lt --port 3000
   ```

3. **Use the provided URL** as your webhook URL

**Note:** localtunnel URLs also change on restart, similar to free ngrok.

---

## Production Deployment

For production, **do not use ngrok**. Instead:

1. **Deploy your API server** to a hosting service:
   - Render: https://render.com
   - Heroku: https://heroku.com
   - Railway: https://railway.app
   - AWS/GCP/Azure

2. **Use the production URL** for webhook:
   ```
   https://your-production-api.com/api/whatsapp/webhook
   ```

3. **Update webhook URL in Meta Dashboard** to point to production

---

## Quick Reference

**Local Development Setup:**
```bash
# Terminal 1: Start API server
npm start

# Terminal 2: Start ngrok
ngrok http 3000

# Copy HTTPS URL from ngrok output
# Use: https://your-ngrok-url.ngrok-free.app/api/whatsapp/webhook
```

**Webhook URL Format:**
```
https://your-ngrok-url.ngrok-free.app/api/whatsapp/webhook
```

**Meta Dashboard Settings:**
- Callback URL: Same as webhook URL above
- Verify Token: Must match token in your app
- Subscribe to: `messages`, `message_status`

---

## Next Steps

After setting up localhost webhooks:

1. ✅ Test sending messages from your app
2. ✅ Test receiving messages (send to your WhatsApp number)
3. ✅ Verify messages appear in your app's chat interface
4. ✅ Check unread count updates in real-time
5. ✅ Test message status updates (delivered, read)

For production deployment, see: [WHATSAPP_DEPLOYMENT_GUIDE.md](./WHATSAPP_DEPLOYMENT_GUIDE.md)
