# Setup GitHub Remote

Your repository was configured for Codeberg, but you want to use GitHub instead.

## Step 1: Remove Old Remote

```powershell
git remote remove origin
```

## Step 2: Add GitHub Remote

You need your GitHub repository URL. It should be one of:

- `https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git`
- `git@github.com:YOUR_USERNAME/YOUR_REPO_NAME.git`

### Option A: If Repository Already Exists on GitHub

```powershell
# Replace with your actual GitHub username and repo name
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
```

### Option B: Create Repository on GitHub First

1. Go to: https://github.com/new
2. Repository name: `MyProjectBooks` (or your preferred name)
3. **DO NOT** initialize with README, .gitignore, or license
4. Click "Create repository"
5. Copy the repository URL (HTTPS or SSH)
6. Add remote:

```powershell
# Using HTTPS (recommended)
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git

# OR using SSH (if you have SSH keys set up)
git remote add origin git@github.com:YOUR_USERNAME/YOUR_REPO_NAME.git
```

## Step 3: Verify Remote

```powershell
git remote -v
```

Should show your GitHub URL.

## Step 4: Push to GitHub

```powershell
git push -u origin main
```

## Complete Command Sequence

```powershell
# 1. Remove old remote (if exists)
git remote remove origin

# 2. Add GitHub remote (replace with your details)
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git

# 3. Verify
git remote -v

# 4. Push
git push -u origin main
```

## Example

If your GitHub username is `rafi` and repo is `MyProjectBooks`:

```powershell
git remote remove origin
git remote add origin https://github.com/rafi/MyProjectBooks.git
git remote -v
git push -u origin main
```

## Authentication

When you push, GitHub will ask for authentication:
- **Personal Access Token** (recommended) - Use this instead of password
- Or use GitHub Desktop which handles auth automatically

To create a Personal Access Token:
1. GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)
2. Generate new token
3. Select scopes: `repo` (full control of private repositories)
4. Copy token and use it as password when pushing

