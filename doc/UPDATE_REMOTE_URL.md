# Update Git Remote URL

Your remote URL currently has placeholders. Update it with your actual GitHub details.

## Quick Fix

Replace `USERNAME` and `REPO_NAME` with your actual values:

```powershell
# Update to GitHub URL
git remote set-url origin https://github.com/rafikhanmanyar-star/PBooksPro.git
```

## Example

If your username is `rafikhanmanyar-star` and repo is `PBooksPro`:

```powershell
git remote set-url origin https://github.com/rafikhanmanyar-star/PBooksPro.git
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

1. Go to GitHub: https://github.com
2. Check your repositories
3. Or create a new repository if you haven't yet
4. Copy the repository URL from GitHub

1. Go to: https://github.com/new
2. Repository name: `PBooksPro` (or your preferred name)
3. **DO NOT** initialize with README, .gitignore, or license
4. Click "Create Repository"
5. Copy the repository URL
6. Update remote: `git remote set-url origin [URL]`

