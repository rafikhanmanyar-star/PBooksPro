# Version Update Guide: 1.0.4 → 1.0.5

## Step-by-Step Instructions

### 1. ✅ Application Configuration (DONE)
- ✅ Updated `package.json` version to `1.0.5`

### 2. Build the Application

Build the new version:
```bash
npm run electron:build:win
```

This will create:
- `C:/MyProjectsProBuild/release/My Projects Pro Setup 1.0.5.exe`
- `C:/MyProjectsProBuild/release/My Projects Pro Setup 1.0.5.exe.blockmap`
- `C:/MyProjectsProBuild/release/latest.yml`

### 3. Get SHA512 Hash

After building, you need to get the SHA512 hash of the `.exe` file. You can:

**Option A: Use PowerShell (Recommended)**
```powershell
Get-FileHash -Path "C:\MyProjectsProBuild\release\My Projects Pro Setup 1.0.5.exe" -Algorithm SHA512 | Select-Object -ExpandProperty Hash
```

**Option B: Use Online Tool**
- Upload the file to: https://emn178.github.io/online-tools/sha512_checksum.html
- Copy the SHA512 hash

**Option C: Check the generated latest.yml**
- The build process may generate a `latest.yml` in the release folder
- Copy the SHA512 from there

### 4. Get File Size

Get the file size in bytes:
```powershell
(Get-Item "C:\MyProjectsProBuild\release\My Projects Pro Setup 1.0.5.exe").Length
```

### 5. Update latest.yml

Update `update-server/releases/latest.yml` with:

```yaml
version: 1.0.5
files:
  - url: https://github.com/rafikhanmanyar-star/MyProjectsPro/releases/download/v1.0.5/My.Projects.Pro.Setup.1.0.5.exe
    sha512: YOUR_SHA512_HASH_HERE
    size: YOUR_FILE_SIZE_IN_BYTES
path: My Projects Pro Setup 1.0.5.exe
sha512: YOUR_SHA512_HASH_HERE
releaseDate: '2025-01-XXTXX:XX:XX.XXXZ'  # Update with current date/time
```

**Important Notes:**
- Replace `YOUR_SHA512_HASH_HERE` with the actual SHA512 hash
- Replace `YOUR_FILE_SIZE_IN_BYTES` with the actual file size
- Update `releaseDate` with current date/time in ISO format
- The URL uses dots in the filename: `My.Projects.Pro.Setup.1.0.5.exe`

### 6. Create GitHub Release

1. Go to: https://github.com/rafikhanmanyar-star/MyProjectsPro/releases
2. Click "Create a new release"
3. **Tag version**: `v1.0.5` (must match exactly)
4. **Release title**: `v1.0.5` or `Version 1.0.5`
5. **Description**: Add release notes (optional)
6. **Attach files**:
   - Upload: `My Projects Pro Setup 1.0.5.exe`
   - Upload: `My Projects Pro Setup 1.0.5.exe.blockmap`
7. Click "Publish release"

**Important:** The files on GitHub must be named exactly:
- `My Projects Pro Setup 1.0.5.exe` (with spaces)
- `My Projects Pro Setup 1.0.5.exe.blockmap` (with spaces)

GitHub will automatically convert spaces to dots in the download URL, so the URL will be:
- `https://github.com/rafikhanmanyar-star/MyProjectsPro/releases/download/v1.0.5/My.Projects.Pro.Setup.1.0.5.exe`

### 7. Update Render Server

1. **Commit and push the updated `latest.yml`**:
   ```bash
   cd update-server
   git add releases/latest.yml
   git commit -m "Update to version 1.0.5"
   git push
   ```

2. **Render will automatically redeploy** (takes 1-2 minutes)

3. **Verify the update**:
   - Visit: `https://myprojectspro.onrender.com/latest.yml`
   - Should show version 1.0.5
   - Visit: `https://myprojectspro.onrender.com/`
   - Should show the new release in the list

### 8. Test the Update

1. Install version 1.0.4 on a test machine
2. Open the application
3. Go to: **Help → Update Application** (or Settings → Update Application)
4. Click "Check for Updates"
5. Should detect version 1.0.5 and offer to download

## Quick Checklist

- [x] Updated `package.json` version to 1.0.5
- [ ] Built application: `npm run electron:build:win`
- [ ] Got SHA512 hash of the .exe file
- [ ] Got file size in bytes
- [ ] Updated `update-server/releases/latest.yml` with correct values
- [ ] Created GitHub release v1.0.5 with both files
- [ ] Committed and pushed `latest.yml` to GitHub
- [ ] Verified Render server shows version 1.0.5
- [ ] Tested update check in the application

## Troubleshooting

**If update doesn't show:**
1. Verify `latest.yml` is correct on Render: `https://myprojectspro.onrender.com/latest.yml`
2. Check GitHub release exists: `https://github.com/rafikhanmanyar-star/MyProjectsPro/releases/tag/v1.0.5`
3. Verify file URLs in `latest.yml` match GitHub release URLs
4. Check Render logs for any errors
5. Clear app cache and try again

**If SHA512 mismatch:**
- Recalculate the hash
- Ensure you're using the exact file that was uploaded to GitHub
- Check for any file corruption during upload

