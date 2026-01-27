# Create .env File for Server

## Quick Steps

1. **Navigate to server folder:**
   ```powershell
   cd server
   ```

2. **Create .env file:**
   - Copy `server/.env.example` to `server/.env`
   - OR create a new file named `.env` in the `server` folder

3. **Edit .env file with your PostgreSQL credentials:**

   ```env
   DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/pbookspro
   JWT_SECRET=your-super-secret-jwt-key-change-this
   LICENSE_SECRET_SALT=PBOOKSPRO_SECURE_SALT_2024
   NODE_ENV=development
   PORT=3000
   CORS_ORIGIN=http://localhost:5173,http://localhost:5174
   
   # Payment Gateway Configuration (Optional - for license payments)
   PAYMENT_GATEWAY=paddle
   PAYMENT_SANDBOX=true
   PADDLE_VENDOR_ID=your_vendor_id
   PADDLE_API_KEY=your_sandbox_api_key
   PADDLE_PUBLIC_KEY=your_sandbox_public_key
   PADDLE_WEBHOOK_SECRET=your_webhook_secret
   PADDLE_ENVIRONMENT=sandbox
   ```

4. **Replace `YOUR_PASSWORD`** with the password you set during PostgreSQL installation

## Using PowerShell to Create the File

```powershell
# Navigate to server folder
cd server

# Create .env file (replace YOUR_PASSWORD with your actual password)
@"
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/pbookspro
JWT_SECRET=your-super-secret-jwt-key-change-this
LICENSE_SECRET_SALT=PBOOKSPRO_SECURE_SALT_2024
NODE_ENV=development
PORT=3000
CORS_ORIGIN=http://localhost:5173,http://localhost:5174

# Payment Gateway Configuration (Optional - for license payments)
PAYMENT_GATEWAY=paddle
PAYMENT_SANDBOX=true
PADDLE_VENDOR_ID=your_vendor_id
PADDLE_API_KEY=your_sandbox_api_key
PADDLE_PUBLIC_KEY=your_sandbox_public_key
PADDLE_WEBHOOK_SECRET=your_webhook_secret
PADDLE_ENVIRONMENT=sandbox
"@ | Out-File -FilePath .env -Encoding utf8
```

**Then edit the file and replace `YOUR_PASSWORD` with your actual PostgreSQL password.**

## Using Notepad

1. Open Notepad
2. Copy and paste this content:
   ```
   DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/pbookspro
   JWT_SECRET=your-super-secret-jwt-key-change-this
   LICENSE_SECRET_SALT=PBOOKSPRO_SECURE_SALT_2024
   NODE_ENV=development
   PORT=3000
   CORS_ORIGIN=http://localhost:5173,http://localhost:5174
   
   # Payment Gateway Configuration (Optional - for license payments)
   PAYMENT_GATEWAY=paddle
   PAYMENT_SANDBOX=true
   PADDLE_VENDOR_ID=your_vendor_id
   PADDLE_API_KEY=your_sandbox_api_key
   PADDLE_PUBLIC_KEY=your_sandbox_public_key
   PADDLE_WEBHOOK_SECRET=your_webhook_secret
   PADDLE_ENVIRONMENT=sandbox
   ```
3. Replace `YOUR_PASSWORD` with your PostgreSQL password
4. Save as `.env` in the `server` folder
   - **Important**: When saving, select "All Files" as file type
   - File name should be exactly `.env` (not `.env.txt`)

## Verify .env File

After creating the file, verify it exists:

```powershell
# Check if file exists
Test-Path server\.env

# View contents (password will be visible)
Get-Content server\.env
```

## Example .env File

If your PostgreSQL password is `mypassword123`, your `.env` file should look like:

```env
DATABASE_URL=postgresql://postgres:mypassword123@localhost:5432/pbookspro
JWT_SECRET=your-super-secret-jwt-key-change-this
LICENSE_SECRET_SALT=PBOOKSPRO_SECURE_SALT_2024
NODE_ENV=development
PORT=3000
CORS_ORIGIN=http://localhost:5173,http://localhost:5174

# Payment Gateway Configuration (Optional - for license payments)
PAYMENT_GATEWAY=paddle
PAYMENT_SANDBOX=true
PADDLE_VENDOR_ID=your_vendor_id
PADDLE_API_KEY=your_sandbox_api_key
PADDLE_PUBLIC_KEY=your_sandbox_public_key
PADDLE_WEBHOOK_SECRET=your_webhook_secret
PADDLE_ENVIRONMENT=sandbox
```

## Next Steps

After creating `.env` file:

1. ✅ `.env` file created with correct DATABASE_URL
2. **Make sure database exists**: `createdb -U postgres pbookspro` (if not already created)
3. **Run migration**: `npm run migrate`
4. **Start server**: `npm run dev`

## Troubleshooting

### "DATABASE_URL environment variable is not set"
- Make sure `.env` file is in the `server` folder (not in root)
- Make sure file is named exactly `.env` (not `.env.txt` or `.env.example`)
- Restart the server after creating the file

### "password authentication failed"
- Check that your password in `.env` matches your PostgreSQL password
- Try connecting manually: `psql -U postgres -d pbookspro`

### "database does not exist"
- Create the database: `createdb -U postgres pbookspro`
- Or using psql: `psql -U postgres` then `CREATE DATABASE pbookspro;`

