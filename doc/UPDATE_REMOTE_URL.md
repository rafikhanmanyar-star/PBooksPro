# Update Git Remote URL

Your remote URL currently has placeholders. Update it with your actual Codeberg details.

## Quick Fix

Replace `USERNAME` and `REPO_NAME` with your actual values:

```powershell
# Replace USERNAME with your Codeberg username
# Replace REPO_NAME with your repository name
git remote set-url origin https://codeberg.org/YOUR_USERNAME/YOUR_REPO_NAME.git
```

## Example

If your username is `john` and repo is `MyProjectBooks`:

```powershell
git remote set-url origin https://codeberg.org/john/MyProjectBooks.git
```

## Then Push

After updating the remote URL:

```powershell
git push -u origin main
```

## Verify Remote

Check your remote URL:

```powershell
git remote -v
```

Should show your actual username and repo name.

## If You Don't Know Your Repo Name

1. Go to Codeberg: https://codeberg.org
2. Check your repositories
3. Or create a new repository if you haven't yet
4. Copy the repository URL from Codeberg

## Create Repository on Codeberg (If Needed)

1. Go to: https://codeberg.org/repos/new
2. Repository name: `MyProjectBooks` (or your preferred name)
3. **DO NOT** initialize with README, .gitignore, or license
4. Click "Create Repository"
5. Copy the repository URL
6. Update remote: `git remote set-url origin [URL]`

