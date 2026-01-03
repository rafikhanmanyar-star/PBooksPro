# GitHub Repository Files Guide

This guide specifies what files should be committed to GitHub for deployment to Render.

## ✅ Files to COMMIT (Push to GitHub)

### Server Directory (`server/`)

**Source Code:**
- ✅ `api/` - All TypeScript API route files
- ✅ `middleware/` - All middleware files
- ✅ `migrations/` - Database migration scripts and SQL schema
- ✅ `scripts/` - All utility scripts
- ✅ `services/` - All service files

**Configuration Files:**
- ✅ `package.json` - Dependencies and scripts
- ✅ `package-lock.json` - Lock file for reproducible builds
- ✅ `tsconfig.json` - TypeScript configuration
- ✅ `README.md` - Server documentation

**Templates/Examples:**
- ✅ `.env.example` - Example environment variables (without secrets)

### Root Directory

**Configuration:**
- ✅ `render.yaml` - Render deployment configuration
- ✅ `package.json` - Root package.json
- ✅ `package-lock.json` - Root lock file
- ✅ `tsconfig.json` - Root TypeScript config
- ✅ `vite.config.ts` - Vite configuration

**Documentation:**
- ✅ `DEPLOYMENT_GUIDE.md`
- ✅ `PRE_DEPLOYMENT_CHECKLIST.md`
- ✅ `API_MIGRATION_PLAN.md`
- ✅ All other `.md` documentation files

**Source Code:**
- ✅ `components/` - All React components
- ✅ `context/` - All context providers
- ✅ `services/` - All frontend services
- ✅ `hooks/` - All custom hooks
- ✅ `types.ts` - TypeScript type definitions
- ✅ `constants.tsx` - Constants file
- ✅ `App.tsx`, `index.tsx` - Main app files

**Admin Portal:**
- ✅ `admin/` - Entire admin portal directory (except node_modules)

**Build Configuration:**
- ✅ `electron/` - Electron main process files
- ✅ `build/` - Build resources (icons, etc.)

## ❌ Files to EXCLUDE (Never Commit)

### Environment & Secrets
- ❌ `.env` - Contains database passwords and secrets
- ❌ `.env.local` - Local environment overrides
- ❌ `server/.env` - Server environment variables
- ❌ Any file containing actual passwords or API keys

### Dependencies
- ❌ `node_modules/` - Installed dependencies (reinstalled on Render)
- ❌ `server/node_modules/` - Server dependencies
- ❌ `admin/node_modules/` - Admin dependencies

### Build Outputs
- ❌ `dist/` - Built frontend files (built on Render)
- ❌ `server/api/*.js` - Compiled JavaScript (built on Render)
- ❌ `*.js.map` - Source maps

### Logs & Temporary Files
- ❌ `*.log` - Log files
- ❌ `*.tmp` - Temporary files
- ❌ `.DS_Store` - macOS system files
- ❌ `Thumbs.db` - Windows system files

### IDE/Editor Files
- ❌ `.vscode/` - VS Code settings (except extensions.json)
- ❌ `.idea/` - IntelliJ/WebStorm settings
- ❌ `*.swp`, `*.swo` - Vim swap files

### Database Files
- ❌ `*.db` - SQLite database files
- ❌ `*.sqlite` - SQLite database files
- ❌ `*.sqlite3` - SQLite database files

## 📋 Quick Checklist Before Pushing

Before pushing to GitHub, verify:

- [ ] No `.env` files are committed (check with `git status`)
- [ ] No `node_modules/` directories are committed
- [ ] No database files (`.db`, `.sqlite`) are committed
- [ ] All source code files (`.ts`, `.tsx`) are included
- [ ] Configuration files (`package.json`, `tsconfig.json`) are included
- [ ] Migration files are included
- [ ] `render.yaml` is included
- [ ] Documentation files are included

## 🔍 Verify What Will Be Committed

```bash
# Check what files are staged
git status

# See what would be committed (excluding .gitignore)
git status --ignored

# Check if .env files are accidentally included
git ls-files | grep -E "\.env$|\.env\."

# Check if node_modules are included
git ls-files | grep node_modules
```

## 🛡️ Security Checklist

Before pushing, ensure:

- [ ] No passwords in code
- [ ] No API keys in code
- [ ] No database connection strings with passwords
- [ ] All secrets are in environment variables
- [ ] `.env.example` exists but `.env` does not
- [ ] `.gitignore` properly excludes sensitive files

## 📝 Recommended .gitignore Additions

Make sure your `.gitignore` includes:

```gitignore
# Environment variables
.env
.env.local
.env.*.local
server/.env
admin/.env

# Dependencies
node_modules/
server/node_modules/
admin/node_modules/

# Build outputs
dist/
server/api/*.js
*.js.map

# Database files
*.db
*.sqlite
*.sqlite3

# Logs
*.log
logs/

# OS files
.DS_Store
Thumbs.db
```

## 🚀 After Pushing to GitHub

1. Connect repository to Render
2. Set environment variables in Render dashboard
3. Render will automatically:
   - Install dependencies (`npm install`)
   - Build the project (`npm run build`)
   - Run migrations (via startup script)
   - Start the server (`npm start`)

## 📚 Files Structure for Render

Render expects this structure:
```
/
├── render.yaml              # ✅ Commit - Deployment config
├── server/                  # ✅ Commit - API server
│   ├── api/                 # ✅ Commit - API routes
│   ├── migrations/          # ✅ Commit - DB migrations
│   ├── scripts/             # ✅ Commit - Utility scripts
│   ├── package.json         # ✅ Commit - Dependencies
│   └── tsconfig.json        # ✅ Commit - TS config
├── admin/                   # ✅ Commit - Admin portal
│   ├── src/                 # ✅ Commit - Source code
│   └── package.json         # ✅ Commit - Dependencies
└── package.json             # ✅ Commit - Root config
```

## ⚠️ Important Notes

1. **Never commit `.env` files** - These contain secrets
2. **Always use `.env.example`** - Template without secrets
3. **Render will set environment variables** - Via dashboard or render.yaml
4. **Build happens on Render** - Don't commit `dist/` or compiled `.js` files
5. **Dependencies are installed on Render** - Don't commit `node_modules/`

## 🔧 If You Accidentally Committed Secrets

If you accidentally committed a `.env` file or secrets:

1. **Remove from Git history:**
   ```bash
   git rm --cached server/.env
   git commit -m "Remove .env file"
   ```

2. **If already pushed, rotate secrets:**
   - Change all passwords
   - Regenerate API keys
   - Update environment variables in Render

3. **Add to .gitignore:**
   ```bash
   echo "server/.env" >> .gitignore
   git add .gitignore
   git commit -m "Add .env to gitignore"
   ```

