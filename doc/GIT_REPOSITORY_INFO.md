# Git Repository Information

## Current Repository Configuration

- **Repository Path**: `f:\AntiGravity projects\PBooksPro`
- **Remote URL**: `https://github.com/rafikhanmanyar-star/PBooksPro.git`
- **Current Branch**: `staging`
- **Repository Type**: Staging Branch Repository

## Branch Structure

### Staging Branch (`staging`)
- **Purpose**: Development and testing environment
- **Deployment**: Auto-deploys to staging environment on Render
- **Services**:
  - `pbookspro-api-staging` - Staging API server
  - `pbookspro-client-staging` - Staging client application
  - `pbookspro-admin-staging` - Staging admin portal
  - `pbookspro-website-staging` - Staging website

### Main Branch (`main`)
- **Purpose**: Production environment
- **Deployment**: Auto-deploys to production environment on Render
- **Services**:
  - `pbookspro-api` - Production API server
  - `pbookspro-client` - Production client application
  - `pbookspro-admin` - Production admin portal
  - `pbookspro-website` - Production website

## Quick Git Commands

### Check Status
```powershell
git status
```

### View Remote Configuration
```powershell
git remote -v
```

### View Current Branch
```powershell
git branch --show-current
```

### Stage All Changes
```powershell
git add .
```

### Commit Changes
```powershell
git commit -m "Your commit message"
```

### Push to Staging Branch
```powershell
git push -u origin staging
```

### Switch to Main Branch (if needed)
```powershell
git checkout main
# or create and switch
git checkout -b main
```

## Workflow

1. **Make changes** in the staging branch
2. **Test locally** before committing
3. **Commit changes**: `git commit -m "Description"`
4. **Push to staging**: `git push origin staging`
5. **Render automatically deploys** to staging environment
6. **Test in staging** environment
7. **Merge to main** when ready for production

## Repository Links

- **GitHub Repository**: https://github.com/rafikhanmanyar-star/PBooksPro
- **Staging Branch**: https://github.com/rafikhanmanyar-star/PBooksPro/tree/staging
- **Main Branch**: https://github.com/rafikhanmanyar-star/PBooksPro/tree/main

## Render Deployment

The `render.yaml` file is configured to:
- Deploy **staging services** from the `staging` branch
- Deploy **production services** from the `main` branch

When you push to `staging`, Render automatically:
1. Detects the push
2. Builds the staging services
3. Deploys to staging URLs

## Authentication

If you encounter authentication issues:

### Option 1: GitHub Desktop
- Install GitHub Desktop
- It handles authentication automatically

### Option 2: Personal Access Token
```powershell
git remote set-url origin https://YOUR_TOKEN@github.com/rafikhanmanyar-star/PBooksPro.git
```

### Option 3: SSH (if configured)
```powershell
git remote set-url origin git@github.com:rafikhanmanyar-star/PBooksPro.git
```

## First Time Setup

If this is a fresh repository:

```powershell
# Initialize git (already done)
git init

# Add remote (already done)
git remote add origin https://github.com/rafikhanmanyar-star/PBooksPro.git

# Set branch to staging (already done)
git branch -M staging

# Stage all files
git add .

# Make initial commit
git commit -m "Initial commit - Staging branch setup"

# Push to GitHub
git push -u origin staging
```

## Notes

- This repository is configured for the **staging branch**
- Production deployments use the **main branch**
- Always test in staging before merging to main
- The MCP server has been added and configured
- All dependencies are installed and ready
