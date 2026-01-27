# Quick Fix: Plans Disappearing Issue

## 🔴 Are Your Plans Disappearing?

If you create a plan and it disappears from your screen (but reappears when you log in again), follow these steps:

---

## ✅ The Fix (30 seconds)

### Step 1: Open Browser Console
- **Windows/Linux:** Press `F12` or `Ctrl + Shift + J`
- **Mac:** Press `Cmd + Option + J`

### Step 2: Run This Command
Copy and paste this ENTIRE code block into the console:

```javascript
(async function() {
    console.log('🔧 Clearing database...');
    localStorage.removeItem('finance_db');
    if (navigator.storage && navigator.storage.getDirectory) {
        try {
            const root = await navigator.storage.getDirectory();
            await root.removeEntry('finance_db.sqlite').catch(() => {});
            console.log('✅ OPFS cleared');
        } catch (e) {}
    }
    console.log('🔄 Reloading...');
    setTimeout(() => location.reload(), 1000);
})();
```

**Important:** Make sure you copy the ENTIRE block above, including the parentheses!

### Step 3: Press Enter
The page will reload automatically.

### Step 4: Log In Again
Use your normal username and password.

### Step 5: Done! ✅
Your plans will now save and persist correctly!

---

## 🎯 What This Does

- ✅ Clears your local database cache
- ✅ Forces the app to create a fresh database
- ✅ Restores all your data from the cloud
- ✅ Fixes the missing table issue

**Your data is 100% safe** - everything is stored in the cloud and will be restored.

---

## 🔮 Future Prevention

After applying this fix, if the problem ever happens again:

1. You'll see a **red banner** at the top of the screen
2. Click the **"Fix Now"** button
3. Log in again
4. Done!

No need to open the console anymore - the app will handle it automatically!

---

## 📱 Screenshot Guide

### Opening Console (F12)

```
┌─────────────────────────────────────┐
│ Your App                            │
├─────────────────────────────────────┤
│                                     │
│ [Your normal app interface]         │
│                                     │
│                                     │
├─────────────────────────────────────┤
│ Console ▼                           │  ← This appears when you press F12
├─────────────────────────────────────┤
│ >                                   │  ← Type or paste command here
│                                     │
└─────────────────────────────────────┘
```

### Running the Command

```
Console ▼
> localStorage.removeItem('finance_db'); location.reload();  ← Paste this
```

Press **Enter** and the page will reload!

---

## ❓ FAQ

### Q: Will I lose my data?
**A:** No! All your data is safely stored in the cloud. This fix just clears your local cache and re-downloads everything.

### Q: Do I need to do this again?
**A:** No, just once. After this fix, everything will work normally.

### Q: What if I see an error?
**A:** Make sure you copied the command exactly as shown, including the semicolon (;). If it still doesn't work, contact support.

### Q: Can I do this during work hours?
**A:** Yes! It only takes 30 seconds and you won't lose any work. Just save any current work before running the command.

### Q: Will this affect other users?
**A:** No, this only affects your browser. Each user needs to run the fix on their own computer.

---

## 🆘 Need Help?

If you're not comfortable with the console, just:

1. **Wait for the red error banner** to appear next time you use the app
2. **Click "Fix Now"** button
3. **Log in again**
4. Done!

Or contact your administrator for assistance.

---

## ✅ Verification

After applying the fix, test that it worked:

1. **Create a new plan**
2. **Refresh the page** (F5)
3. **Check if plan is still there** ✅

If the plan stays visible after refresh, the fix worked!

---

**This fix resolves the "no such table: plan_amenities" error** that was causing plans to disappear.

**Your data is safe and will be fully restored after running the fix.**

Need help? Contact your system administrator or IT support.
