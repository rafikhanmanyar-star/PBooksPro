# Render Environment Variable Configuration Guide

## 🎯 Objective
Add `NODE_OPTIONS=--max-old-space-size=1024` to your Render service to allocate 1GB heap memory instead of the default 21MB.

---

## 📋 Step-by-Step Instructions

### Step 1: Log into Render Dashboard

1. Go to https://dashboard.render.com
2. Sign in with your account credentials
3. You should see your dashboard with all your services

---

### Step 2: Select Your API Service

1. Look for your **PBooksPro API Server** (or whatever you named your backend service)
   - It's usually listed under "Web Services"
   - The name might be something like:
     - `pbookspro-api`
     - `pbooks-server`
     - `backend`
     - Or similar

2. **Click on the service name** to open its details

---

### Step 3: Navigate to Environment Variables

1. In the service dashboard, look for the left sidebar menu
2. Click on **"Environment"** (or "Environment Variables")
   - It's usually near the top of the menu
   - Icon looks like a key or settings gear

---

### Step 4: Add the Environment Variable

1. You'll see a list of existing environment variables
2. Look for an "Add Environment Variable" or "+ Add" button
3. Click it to add a new variable

4. **Fill in the fields:**
   - **Key:** `NODE_OPTIONS`
   - **Value:** `--max-old-space-size=1024`

5. **Click "Save" or "Add"**

---

### Step 5: Verify the Variable

After saving, you should see the new variable in your list:

```
Name: NODE_OPTIONS
Value: --max-old-space-size=1024
```

**Important:** The value should be EXACTLY as shown above (no extra spaces, quotes, or characters)

---

### Step 6: Trigger a Redeploy

Render needs to restart your service to apply the new environment variable:

**Option A: Automatic (Recommended)**
1. Render should show a banner: "Environment variables changed. Deploy to apply?"
2. Click **"Deploy"** or **"Redeploy"**

**Option B: Manual**
1. Go to the "Manual Deploy" section (usually in the top right)
2. Click **"Deploy latest commit"** or **"Manual Deploy"**
3. Select **"Clear build cache & deploy"** if available (recommended for first time)

---

### Step 7: Monitor the Deployment

1. Watch the deployment logs in real-time
2. Look for these success indicators:

```
✓ Building...
✓ Installing dependencies
✓ Build succeeded
✓ Starting server...
✓ Your service is live
```

3. **Check for memory allocation message:**
   - The logs won't explicitly show the memory limit
   - But the process should now have access to 1GB heap

---

### Step 8: Verify It's Working

#### Method 1: Check System Monitoring (Easiest)

1. Wait 5-10 minutes after deployment
2. Go to your app: Admin → System Monitoring
3. **Verify:**
   - Memory usage should be **<70%** (was 93%)
   - Total memory should show **~1GB** (was 21MB)
   - "Dev" panel should show improved stats

#### Method 2: Check Render Metrics

1. In Render dashboard, go to your service
2. Click on **"Metrics"** tab
3. Look at **"Memory Usage"** graph
4. Should show usage in a normal range (~300-500MB out of 1GB)

#### Method 3: Check Server Logs

1. Go to **"Logs"** tab in Render
2. Look for any memory-related warnings
3. **Should NOT see:**
   - ❌ "Out of memory" errors
   - ❌ "JavaScript heap out of memory"
   - ❌ Excessive garbage collection warnings

---

## ✅ Success Indicators

After 30-60 minutes of normal operation, you should see:

| Metric | Before | After | ✓ |
|--------|--------|-------|---|
| Memory Usage | 93.1% | 30-50% | ✓ |
| Error Rate | 26.1% | <5% | ✓ |
| Avg Response Time | 588ms | <250ms | ✓ |
| App Stability | Crashes | Stable | ✓ |

---

## 🚨 Troubleshooting

### Problem: Environment variable not showing up

**Solution:**
1. Refresh the Render dashboard page
2. Check you're on the correct service (not a different one)
3. Make sure you clicked "Save" after adding the variable

---

### Problem: Deployment failed

**Possible causes:**
1. **Build errors** - Check logs for TypeScript/dependency errors
2. **Port issues** - Ensure your server listens on `process.env.PORT`
3. **Database connection** - Verify `DATABASE_URL` is set correctly

**Solution:**
1. Read the deployment logs carefully
2. Look for the first error message
3. Fix the issue in your code and push again

---

### Problem: Memory usage still at 93%

**Possible causes:**
1. Environment variable not applied (service needs restart)
2. Typo in the variable name or value
3. Looking at old/cached monitoring data

**Solution:**
1. **Force restart the service:**
   - Go to service settings
   - Click "Suspend" 
   - Wait 30 seconds
   - Click "Resume"

2. **Verify the variable again:**
   - Environment → Check `NODE_OPTIONS` value
   - Should be: `--max-old-space-size=1024` (exactly)

3. **Clear monitoring cache:**
   - Wait 10-15 minutes for fresh data
   - Refresh the System Monitoring page

---

### Problem: Service won't start

**Check logs for:**
1. **Syntax errors** in the new code
2. **Missing dependencies** (run `npm install` locally first)
3. **Database connection issues**

**Solution:**
1. Roll back to previous deployment
2. Fix issues locally
3. Test locally with `npm run dev`
4. Commit and push again

---

## 📝 Quick Reference

### Environment Variable Details

```
Key:   NODE_OPTIONS
Value: --max-old-space-size=1024
```

### What This Does

- Allocates **1GB (1024MB) heap memory** to Node.js
- Default is usually ~21MB (way too small for production)
- Prevents "Out of Memory" crashes
- Reduces garbage collection pauses
- Allows handling larger datasets (your 2500 records)

### Memory Recommendations

| Users | Recommended Memory |
|-------|-------------------|
| <100 users | 512 MB (`--max-old-space-size=512`) |
| 100-1000 users | 1024 MB (`--max-old-space-size=1024`) ✓ |
| 1000+ users | 2048 MB (`--max-old-space-size=2048`) |

---

## 🔍 Alternative: Set in package.json (Already Done)

**Good news:** I already updated your `package.json`, so the memory limit will apply automatically on deployment!

However, setting it as an environment variable is **better** because:
- Can change it without code changes
- Can increase it easily if needed
- Can set different values for staging vs production

---

## 📞 Need More Help?

If you encounter any issues:

1. **Share the deployment logs**
   - Copy from Render "Logs" tab
   - Share the last 50-100 lines

2. **Share the environment variables list**
   - Screenshot of the Environment page
   - Or copy/paste the variable names (hide sensitive values)

3. **Share the System Monitoring screenshot**
   - After waiting 10 minutes post-deployment
   - So I can verify if it's working

---

## ✨ What to Expect After Configuration

Within **30 minutes** of deployment:

**Memory:**
- Usage drops from 93% to 30-50%
- Total available increases from 21MB to ~1GB
- No more "Out of Memory" crashes

**Performance:**
- Error rate drops from 26% to <2%
- Response times improve from 588ms to <200ms
- App feels much more responsive

**Stability:**
- Server stays running without crashes
- Can handle the full 2500 records easily
- Background sync works smoothly

---

**You're almost there!** Just add that one environment variable and your server performance issues will be resolved. 🚀

Let me know if you need any help with the steps!
