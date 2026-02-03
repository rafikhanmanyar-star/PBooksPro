# How to Find Your Services in Render Dashboard

## 🎯 Finding Your API Service

### Method 1: From Dashboard Home

1. **Go to Render Dashboard**
   - Visit: https://dashboard.render.com
   - Sign in if needed

2. **Look for "Services" Section**
   - On the dashboard home page, you'll see different sections
   - Look for **"Services"** or **"Web Services"** section
   - Your API service should be listed there

3. **Click on Your Service**
   - Look for a service named: `pbookspro-api` (or whatever you named it)
   - Click on the service name to open it

### Method 2: Using Navigation Menu

1. **Click "Services" in Left Sidebar**
   - On the left side of the dashboard, you'll see a menu
   - Click on **"Services"** or **"Web Services"**
   - This shows all your web services

2. **Find Your API Service**
   - Look through the list for your API service
   - It might be named:
     - `pbookspro-api`
     - `PBooksPro-api`
     - Or whatever name you used

3. **Click to Open**
   - Click on the service name to view details

### Method 3: If Using Blueprint

If you deployed using Blueprint:

1. **Go to "Blueprints"**
   - Click **"Blueprints"** in the left sidebar
   - Find your blueprint (usually named after your repo)

2. **View Services**
   - Click on your blueprint
   - You'll see all services created by the blueprint
   - Click on the API service from there

### Method 4: Search/Filter

1. **Use Search Bar**
   - At the top of the dashboard, there's usually a search bar
   - Type: `api` or `pbookspro` to filter services

2. **Filter by Type**
   - Some dashboards have filters
   - Filter by "Web Service" type

---

## 📍 What You're Looking For

Your API service will typically show:
- **Name**: Something like `pbookspro-api`
- **Type**: Web Service
- **Status**: Running, Building, or Failed
- **URL**: Something like `https://pbookspro-api.onrender.com`

---

## 🔍 If You Can't Find It

### Check 1: Has It Been Deployed?

If you haven't deployed yet:
- You won't see any services
- You need to deploy first using Blueprint or manually create services

### Check 2: Wrong Account/Team?

- Make sure you're logged into the correct Render account
- Check if you're in the right team/workspace

### Check 3: Service Name

- The service might have a different name
- Check all services in the list
- Look for any service with "api" in the name

### Check 4: Service Type

- API might be listed under "Web Services" not "Services"
- Check both sections

---

## 🎯 Once You Find It

After clicking on your API service, you'll see:

1. **Overview Tab** (default)
   - Service status
   - URL
   - Recent deployments

2. **Environment Tab** ← **THIS IS WHAT YOU NEED**
   - Click on **"Environment"** tab
   - Here you'll find all environment variables
   - This is where you update `CORS_ORIGIN`

3. **Logs Tab**
   - View server logs
   - Debug issues

4. **Settings Tab**
   - Service configuration
   - Build commands
   - Start commands

---

## 📝 Step-by-Step: Update CORS_ORIGIN

Once you find your API service:

1. **Click on the service** (e.g., `pbookspro-api`)

2. **Click "Environment" tab** (at the top of the service page)

3. **Find `CORS_ORIGIN` variable**
   - Scroll through the environment variables
   - Look for `CORS_ORIGIN`

4. **Click "Edit" or the variable name**
   - Some dashboards have an "Edit" button
   - Others let you click directly on the variable

5. **Update the value**
   - Current value might be:
     ```
     https://pbookspro-client.onrender.com,https://pbookspro-admin.onrender.com
     ```
   - Add localhost URLs:
     ```
     https://pbookspro-client.onrender.com,https://pbookspro-admin.onrender.com,http://localhost:5173,http://localhost:5174
     ```

6. **Save Changes**
   - Click "Save" or "Update"
   - Render will automatically restart the service
   - Wait ~30 seconds for restart

---

## 🖼️ Visual Guide (Text Description)

```
Render Dashboard
├── Left Sidebar
│   ├── Dashboard (home)
│   ├── Services ← Click here
│   ├── Databases
│   ├── Blueprints
│   └── Settings
│
└── Main Area
    └── Services List
        ├── pbookspro-api ← Click this
        ├── pbookspro-client
        ├── pbookspro-admin
        └── pbookspro-database
```

After clicking on `pbookspro-api`:

```
Service Details Page
├── Overview Tab
├── Environment Tab ← Click here for CORS_ORIGIN
├── Logs Tab
└── Settings Tab
```

---

## 🔄 Alternative: Update via render.yaml

If you can't find the service or prefer to update via code:

1. **Edit `render.yaml`** in your project:
   ```yaml
   envVars:
     - key: CORS_ORIGIN
       value: https://pbookspro-client.onrender.com,https://pbookspro-admin.onrender.com,http://localhost:5173,http://localhost:5174
   ```

2. **Commit and push to GitHub**
   ```powershell
   git add render.yaml
   git commit -m "Update CORS to include localhost"
   git push
   ```

3. **Render will auto-deploy** the changes

---

## ❓ Still Can't Find It?

If you still can't find your API service:

1. **Check if deployment completed**
   - Go to Blueprints section
   - See if deployment is still in progress

2. **Check for errors**
   - Look in Blueprints or Services for any failed deployments
   - Check build logs

3. **Verify repository connection**
   - Make sure Render is connected to your GitHub repo
   - Check if services were actually created

4. **Contact Support**
   - Render has support chat
   - Or check Render documentation

---

## 🎯 Quick Checklist

- [ ] Logged into Render Dashboard
- [ ] Checked "Services" section
- [ ] Checked "Blueprints" section
- [ ] Looked for service with "api" in name
- [ ] Clicked on the service
- [ ] Found "Environment" tab
- [ ] Located `CORS_ORIGIN` variable

---

## 💡 Pro Tip

If you're using Blueprint deployment:
- All services are managed together
- Changes to `render.yaml` will update all services
- You can also update individual services in the dashboard

---

Need more help? Check Render's official documentation or support.

