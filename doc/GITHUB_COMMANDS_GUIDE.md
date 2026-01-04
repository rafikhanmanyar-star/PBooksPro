# GitHub Commands Guide

This document provides step-by-step Git commands to push your code changes to GitHub.

## Prerequisites

1. Make sure Git is installed on your system
2. Ensure you have a GitHub account and repository set up
3. Verify your repository remote is configured

## Quick Start - Basic Workflow

### 1. Check Current Status
```bash
git status
```
Shows which files have been modified, added, or deleted.

### 2. Add Files to Staging Area

**Add all changed files:**
```bash
git add .
```

**Add specific files:**
```bash
git add path/to/file1.ts path/to/file2.tsx
```

**Add all files in a directory:**
```bash
git add server/api/routes/
```

### 3. Commit Changes
```bash
git commit -m "Description of your changes"
```

**Examples:**
```bash
git commit -m "Add user limit configuration per organization"
git commit -m "Implement transaction audit logging"
git commit -m "Fix logout functionality and session management"
git commit -m "Update sidebar to show organization name"
```

### 4. Push to GitHub
```bash
git push origin main
```

**If using a different branch:**
```bash
git push origin your-branch-name
```

## Complete Workflow Example

```bash
# 1. Check what files have changed
git status

# 2. Add all changes
git add .

# 3. Commit with descriptive message
git commit -m "Add transaction audit logging and session management"

# 4. Push to GitHub
git push origin main
```

## Advanced Commands

### Create and Switch to New Branch
```bash
# Create and switch to new branch
git checkout -b feature/your-feature-name

# Or using newer syntax
git switch -c feature/your-feature-name
```

### Switch Between Branches
```bash
git checkout branch-name
# Or
git switch branch-name
```

### View Branch List
```bash
git branch
```

### Pull Latest Changes Before Pushing
```bash
# Pull latest changes from remote
git pull origin main

# Then push your changes
git push origin main
```

### View Commit History
```bash
git log
```

### View Differences
```bash
# See what changed in working directory
git diff

# See what changed in staged files
git diff --staged
```

### Undo Changes

**Unstage files (keep changes):**
```bash
git reset HEAD filename
```

**Discard changes in working directory:**
```bash
git checkout -- filename
```

**Undo last commit (keep changes):**
```bash
git reset --soft HEAD~1
```

## Common Scenarios

### Scenario 1: First Time Setup

```bash
# Initialize repository (if not already done)
git init

# Add remote repository
git remote add origin https://github.com/yourusername/your-repo.git

# Verify remote
git remote -v
```

### Scenario 2: Daily Workflow

```bash
# 1. Check status
git status

# 2. Add changes
git add .

# 3. Commit
git commit -m "Your commit message"

# 4. Push
git push origin main
```

### Scenario 3: Working with Multiple Files

```bash
# Add specific files
git add server/api/routes/auth.ts
git add server/api/routes/transactions.ts
git add components/layout/Sidebar.tsx

# Commit
git commit -m "Update authentication and transaction routes"

# Push
git push origin main
```

### Scenario 4: After Major Changes

```bash
# Check what changed
git status

# Review changes
git diff

# Add all changes
git add .

# Commit with detailed message
git commit -m "Major update: Add organization data persistence, session management, and audit logging

- Implemented transaction audit logging with user tracking
- Added session management to prevent duplicate logins
- Updated sidebar to show organization information
- Fixed logout functionality
- Ensured data persistence in database"

# Push
git push origin main
```

### Scenario 5: Resolve Merge Conflicts

```bash
# Pull latest changes
git pull origin main

# If conflicts occur, resolve them in the files
# Then:
git add .
git commit -m "Resolve merge conflicts"
git push origin main
```

## Useful Git Aliases (Optional)

Add these to your `~/.gitconfig` file for shortcuts:

```bash
git config --global alias.st status
git config --global alias.co checkout
git config --global alias.br branch
git config --global alias.ci commit
git config --global alias.unstage 'reset HEAD --'
git config --global alias.last 'log -1 HEAD'
```

Then you can use:
```bash
git st          # instead of git status
git co branch   # instead of git checkout branch
git ci -m "msg" # instead of git commit -m "msg"
```

## Best Practices

### 1. Commit Messages
- Be descriptive and clear
- Use present tense ("Add feature" not "Added feature")
- Keep first line under 50 characters
- Add details in body if needed

**Good examples:**
```
git commit -m "Add user limit configuration per organization"
git commit -m "Fix logout redirect to login page"
git commit -m "Implement transaction audit logging with user tracking"
```

**Bad examples:**
```
git commit -m "fix"
git commit -m "changes"
git commit -m "updated stuff"
```

### 2. Commit Frequency
- Commit often (after completing a feature or fix)
- Don't commit broken code
- Test before committing

### 3. Branch Strategy
- Use branches for features: `feature/feature-name`
- Use branches for fixes: `fix/bug-name`
- Keep main/master branch stable

### 4. Before Pushing
- Review your changes: `git diff`
- Test your code
- Pull latest changes: `git pull origin main`
- Resolve any conflicts

## Troubleshooting

### Error: "Your branch is ahead of 'origin/main'"
```bash
# Simply push your changes
git push origin main
```

### Error: "Updates were rejected"
```bash
# Pull latest changes first
git pull origin main

# Resolve any conflicts, then push
git push origin main
```

### Error: "Authentication failed"
```bash
# Set up authentication (choose one method):

# Method 1: Personal Access Token
# Generate token at: https://github.com/settings/tokens
# Use token as password when pushing

# Method 2: SSH Key
# Generate SSH key: ssh-keygen -t ed25519 -C "your_email@example.com"
# Add to GitHub: https://github.com/settings/keys
# Change remote URL: git remote set-url origin git@github.com:username/repo.git
```

### Undo Last Commit (Before Pushing)
```bash
# Undo commit but keep changes
git reset --soft HEAD~1

# Undo commit and discard changes (careful!)
git reset --hard HEAD~1
```

### View Remote Repository
```bash
git remote -v
```

### Change Remote URL
```bash
git remote set-url origin https://github.com/username/new-repo.git
```

## Quick Reference Card

```bash
# Status and Info
git status                    # Check what changed
git log                       # View commit history
git diff                      # See changes

# Staging
git add .                     # Add all changes
git add file.txt              # Add specific file
git reset HEAD file.txt       # Unstage file

# Committing
git commit -m "Message"       # Commit changes
git commit --amend            # Modify last commit

# Pushing
git push origin main          # Push to main branch
git push origin branch-name   # Push to specific branch

# Pulling
git pull origin main          # Pull latest changes

# Branching
git branch                    # List branches
git checkout -b new-branch    # Create and switch branch
git checkout branch-name      # Switch branch
```

## Example: Complete Workflow After Code Changes

```bash
# Step 1: Check what you changed
git status

# Step 2: Review the changes (optional)
git diff

# Step 3: Add all changes
git add .

# Step 4: Commit with a good message
git commit -m "Add transaction audit logging and session management

- Created transaction_audit_log table
- Added session management to prevent duplicate logins
- Updated transaction routes to log all operations
- Enhanced sidebar with organization information
- Fixed logout functionality"

# Step 5: Pull latest changes (to avoid conflicts)
git pull origin main

# Step 6: Push to GitHub
git push origin main
```

## Notes

- Always pull before pushing if working in a team
- Write clear commit messages
- Test your code before committing
- Don't commit sensitive information (passwords, API keys)
- Use `.gitignore` to exclude files that shouldn't be tracked

## Need Help?

- Git documentation: https://git-scm.com/doc
- GitHub Help: https://help.github.com
- Git cheat sheet: https://education.github.com/git-cheat-sheet-education.pdf

