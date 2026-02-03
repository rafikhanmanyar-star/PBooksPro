# Quick Fix: ngrok Terminal Closes Immediately

## Problem
When you run `ngrok http 3000`, the terminal window opens and immediately closes.

## Root Cause
**ngrok is not authenticated yet.** You must configure your authtoken before using ngrok.

---

## Solution: Step-by-Step Fix

### Step 1: Sign Up for ngrok (if you haven't)

1. Go to: https://dashboard.ngrok.com/signup
2. Create a free account with your email
3. Verify your email if required

### Step 2: Get Your Authtoken

1. After logging in, go to: https://dashboard.ngrok.com/get-started/your-authtoken
2. You'll see a long token like: `2abc123def456ghi789jkl012mno345pq_6rSTUV7wxyz8ABCD9EFGH0`
3. **Copy the entire token** (it's very long - make sure you get it all)

### Step 3: Configure ngrok (Windows)

1. **Open PowerShell:**
   - Press `Win + X`
   - Select "Windows PowerShell" or "Terminal"
   - Or search "PowerShell" in Start menu

2. **Run the config command:**
   ```powershell
   ngrok config add-authtoken YOUR_TOKEN_HERE
   ```
   
   Replace `YOUR_TOKEN_HERE` with the token you copied in Step 2.
   
   **Example:**
   ```powershell
   ngrok config add-authtoken 2abc123def456ghi789jkl012mno345pq_6rSTUV7wxyz8ABCD9EFGH0
   ```

3. **Press Enter**

4. **You should see:**
   ```
   Authtoken saved to configuration file: C:\Users\YourName\AppData\Local\ngrok\ngrok.yml
   ```

5. **If you see an error:**
   - Make sure you copied the ENTIRE token (no spaces, no missing characters)
   - Check your internet connection
   - Try copying the token again from the dashboard

### Step 4: Verify ngrok is Configured

Run this command:
```powershell
ngrok version
```

You should see:
```
ngrok version 3.x.x
```

If you see an error, ngrok might not be installed correctly. See installation steps below.

### Step 5: Now Start ngrok

1. **Make sure your API server is running** on port 3000 (or your port)

2. **In PowerShell, run:**
   ```powershell
   ngrok http 3000
   ```

3. **The terminal should stay open** and show:
   ```
   ngrok                                                                        
                                                                                
   Session Status                online                                        
   Account                       your-email@example.com (Plan: Free)           
   Version                       3.x.x                                          
   Region                        United States (us)                             
   Latency                       -                                              
   Web Interface                 http://127.0.0.1:4040                          
   Forwarding                    https://abc123def456.ngrok-free.app -> http://localhost:3000
   ```

4. **Copy the HTTPS URL** (the one that starts with `https://`)
   - Example: `https://abc123def456.ngrok-free.app`
   - Your webhook URL will be: `https://abc123def456.ngrok-free.app/api/whatsapp/webhook`

5. **Keep this terminal open** - don't close it!

---

## If ngrok is Not Installed

### Option A: Download ngrok

1. Go to: https://ngrok.com/download
2. Download "Windows" version
3. Extract `ngrok.exe` to a folder (e.g., `C:\ngrok\`)
4. Add to PATH or use full path:
   ```powershell
   C:\ngrok\ngrok.exe http 3000
   ```

### Option B: Install via Package Manager

**Using Chocolatey:**
```powershell
choco install ngrok
```

**Using Scoop:**
```powershell
scoop install ngrok
```

**Using npm:**
```powershell
npm install -g ngrok
```

---

## Common Errors and Fixes

### Error: "ngrok: command not found"

**Fix:**
- ngrok is not in your PATH
- Use full path: `C:\path\to\ngrok.exe http 3000`
- Or add ngrok folder to Windows PATH

### Error: "authtoken is invalid"

**Fix:**
- Make sure you copied the ENTIRE token (it's very long)
- No spaces before or after
- Copy it again from: https://dashboard.ngrok.com/get-started/your-authtoken

### Error: "failed to start tunnel"

**Fix:**
- Make sure your API server is running on port 3000
- Check if port 3000 is already in use
- Try a different port: `ngrok http 3001`

### Terminal still closes immediately

**Check:**
1. ✅ Did you run `ngrok config add-authtoken`? (Step 3)
2. ✅ Did you see "Authtoken saved" message?
3. ✅ Try running `ngrok version` - does it work?
4. ✅ Check if ngrok is installed: `where ngrok` (Windows)

### ngrok doesn't show version / window doesn't stay open

**Cause:** You may be double-clicking `ngrok.exe` or a shortcut. When ngrok exits (e.g. error or not configured), that window closes.

**Fix 1 – Run from an open terminal (recommended):**
1. Press **Win**, type **cmd** or **PowerShell**, press Enter. (Do not run ngrok yet.)
2. In that window, type: `ngrok version` and press Enter.
3. If you see a version number, type: `ngrok http 3000` and press Enter.
4. The window stays open because you opened it; you’ll see any error.

**Fix 2 – Use the project script:**
1. In File Explorer go to: `f:\AntiGravity projects\PBooksPro\scripts\`
2. Double-click **start-ngrok.bat**
3. A window opens, runs ngrok, and then shows "Window kept open - see output above" and waits. You can read any error.

**Fix 3 – ngrok not in PATH:**
- If the script says "ngrok is not in your PATH", find where `ngrok.exe` is (e.g. Downloads).
- Either add that folder to Windows PATH, or in the script replace `ngrok` with the full path, e.g. `C:\Users\Rafi\Downloads\ngrok.exe http 3000`.

---

## Quick Checklist

- [ ] Signed up for ngrok account
- [ ] Got authtoken from dashboard
- [ ] Ran `ngrok config add-authtoken YOUR_TOKEN`
- [ ] Saw "Authtoken saved" message
- [ ] Verified with `ngrok version`
- [ ] API server is running on port 3000
- [ ] Ran `ngrok http 3000`
- [ ] Terminal stays open and shows forwarding URL

---

## Still Having Issues?

1. **Check ngrok status:**
   ```powershell
   ngrok config check
   ```

2. **View ngrok config file:**
   ```powershell
   type $env:LOCALAPPDATA\ngrok\ngrok.yml
   ```

3. **Try uninstalling and reinstalling ngrok**

4. **Check ngrok logs:**
   - Look in: `C:\Users\YourName\AppData\Local\ngrok\`

5. **Contact ngrok support:**
   - https://ngrok.com/support

---

## Next Steps

Once ngrok is running:
1. Copy the HTTPS URL from ngrok output
2. Use it as your webhook URL: `https://your-ngrok-url.ngrok-free.app/api/whatsapp/webhook`
3. Configure in Meta Dashboard
4. Configure in your PBooksPro app

See: [WHATSAPP_LOCALHOST_SETUP.md](./WHATSAPP_LOCALHOST_SETUP.md) for complete setup guide.
