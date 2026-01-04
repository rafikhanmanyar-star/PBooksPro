# PostgreSQL Setup Guide - Step by Step

This guide will walk you through installing PostgreSQL and creating the database for PBooksPro.

## Step 1: Install PostgreSQL

### Option A: Windows

1. **Download PostgreSQL**
   - Visit: https://www.postgresql.org/download/windows/
   - Click "Download the installer"
   - Or use direct link: https://www.enterprisedb.com/downloads/postgres-postgresql-downloads
   - Download the latest version (PostgreSQL 15 or 16)

2. **Run the Installer**
   - Double-click the downloaded `.exe` file
   - Click "Next" on the welcome screen
   - Choose installation directory (default is fine: `C:\Program Files\PostgreSQL\16`)
   - Click "Next"

3. **Select Components**
   - Make sure these are checked:
     - ✅ PostgreSQL Server
     - ✅ pgAdmin 4 (GUI tool - recommended)
     - ✅ Stack Builder (optional)
   - Click "Next"

4. **Data Directory**
   - Keep default: `C:\Program Files\PostgreSQL\16\data`
   - Click "Next"

5. **Set Password**
   - **IMPORTANT**: Enter a password for the `postgres` superuser
   - Remember this password - you'll need it!
   - Example: `postgres123` (use a strong password in production)
   - Click "Next"

6. **Port**
   - Keep default port: `5432`
   - Click "Next"

7. **Advanced Options**
   - Keep default locale: `[Default locale]`
   - Click "Next"

8. **Pre Installation Summary**
   - Review and click "Next"

9. **Ready to Install**
   - Click "Next" to start installation
   - Wait for installation to complete (5-10 minutes)

10. **Completing Installation**
    - Uncheck "Launch Stack Builder" (optional)
    - Click "Finish"

11. **Verify Installation**
    - Open Command Prompt (cmd) or PowerShell
    - Type: `psql --version`
    - You should see: `psql (PostgreSQL) 16.x` (or similar version)

### Option B: macOS

1. **Using Homebrew (Recommended)**
   ```bash
   # Install Homebrew if you don't have it
   /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
   
   # Install PostgreSQL
   brew install postgresql@16
   
   # Start PostgreSQL service
   brew services start postgresql@16
   ```

2. **Using Official Installer**
   - Visit: https://www.postgresql.org/download/macosx/
   - Download the installer
   - Run the installer and follow the prompts
   - Set a password for the `postgres` user

### Option C: Linux (Ubuntu/Debian)

```bash
# Update package list
sudo apt update

# Install PostgreSQL
sudo apt install postgresql postgresql-contrib

# Start PostgreSQL service
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

---

## Step 2: Verify PostgreSQL is Running

### Windows

1. **Check Service Status**
   - Press `Win + R`
   - Type: `services.msc`
   - Press Enter
   - Look for "postgresql-x64-16" (or similar)
   - Status should be "Running"

2. **Or use Command Prompt**
   ```cmd
   # Check if PostgreSQL is running
   sc query postgresql-x64-16
   ```

### macOS/Linux

```bash
# Check PostgreSQL status
brew services list  # macOS with Homebrew
# OR
sudo systemctl status postgresql  # Linux
```

---

## Step 3: Access PostgreSQL

### Windows

1. **Using Command Prompt**
   - Open Command Prompt (cmd) or PowerShell
   - Navigate to PostgreSQL bin directory:
     ```cmd
     cd "C:\Program Files\PostgreSQL\16\bin"
     ```
   - Connect to PostgreSQL:
     ```cmd
     psql -U postgres
     ```
   - Enter the password you set during installation

2. **Using pgAdmin (GUI)**
   - Open pgAdmin 4 from Start Menu
   - It will ask for the master password (set this once)
   - In the left panel, expand "Servers"
   - Click on "PostgreSQL 16"
   - Enter password when prompted

### macOS/Linux

```bash
# Connect to PostgreSQL
psql -U postgres

# If it says "role postgres does not exist", create it:
createuser -s postgres
```

---

## Step 4: Create the Database

### Method 1: Using Command Line (Recommended)

1. **Connect to PostgreSQL**
   ```bash
   # Windows (from Command Prompt)
   "C:\Program Files\PostgreSQL\16\bin\psql.exe" -U postgres
   
   # macOS/Linux
   psql -U postgres
   ```

2. **Enter Password**
   - When prompted, enter the password you set during installation

3. **Create Database**
   ```sql
   CREATE DATABASE pbookspro;
   ```

4. **Verify Database Created**
   ```sql
   \l
   ```
   - You should see `pbookspro` in the list

5. **Exit psql**
   ```sql
   \q
   ```

### Method 2: Using pgAdmin (Windows/macOS)

1. **Open pgAdmin 4**
   - Launch pgAdmin from Start Menu (Windows) or Applications (macOS)

2. **Navigate to Databases**
   - In the left panel, expand "Servers"
   - Expand "PostgreSQL 16"
   - Right-click on "Databases"
   - Select "Create" → "Database..."

3. **Set Database Properties**
   - **Database name**: `pbookspro`
   - **Owner**: `postgres` (default)
   - Click "Save"

4. **Verify**
   - You should see `pbookspro` under "Databases" in the left panel

### Method 3: Using createdb Command (Easiest)

**Windows:**
```cmd
# Add PostgreSQL to PATH first (one-time setup)
# Go to: System Properties → Environment Variables
# Add to PATH: C:\Program Files\PostgreSQL\16\bin

# Then in Command Prompt:
createdb -U postgres pbookspro
```

**macOS/Linux:**
```bash
createdb -U postgres pbookspro
```

**If it asks for password:**
- Enter the password you set during installation

---

## Step 5: Test Database Connection

### Using Command Line

```bash
# Connect to the new database
psql -U postgres -d pbookspro

# You should see:
# pbookspro=#
```

### Using pgAdmin

1. Expand "Databases" in left panel
2. Expand "pbookspro"
3. Right-click on "pbookspro" → "Query Tool"
4. Type: `SELECT version();`
5. Click Execute (F5)
6. You should see PostgreSQL version information

---

## Step 6: Get Database Connection String

You'll need this for the `server/.env` file:

### Format:
```
postgresql://[username]:[password]@[host]:[port]/[database]
```

### Examples:

**Local Development (Windows/macOS/Linux):**
```env
DATABASE_URL=postgresql://postgres:your_password@localhost:5432/pbookspro
```

**Replace `your_password` with the password you set during installation**

### How to Find Your Connection Details:

- **Username**: `postgres` (default superuser)
- **Password**: The one you set during installation
- **Host**: `localhost` (for local development)
- **Port**: `5432` (default PostgreSQL port)
- **Database**: `pbookspro` (the one you just created)

---

## Step 7: Update server/.env File

1. **Navigate to server folder**
   ```bash
   cd server
   ```

2. **Create .env file** (if it doesn't exist)
   - Copy from `.env.example` if available
   - Or create new file named `.env`

3. **Add Database URL**
   ```env
   DATABASE_URL=postgresql://postgres:your_password@localhost:5432/pbookspro
   JWT_SECRET=your-super-secret-jwt-key-change-this
   LICENSE_SECRET_SALT=PBOOKSPRO_SECURE_SALT_2024
   NODE_ENV=development
   PORT=3000
   CORS_ORIGIN=http://localhost:5173,http://localhost:5174
   ```

4. **Replace `your_password`** with your actual PostgreSQL password

---

## Troubleshooting

### Problem: "psql: command not found"

**Windows:**
- Add PostgreSQL to PATH:
  1. Search "Environment Variables" in Windows
  2. Edit "Path" under System Variables
  3. Add: `C:\Program Files\PostgreSQL\16\bin`
  4. Restart Command Prompt

**macOS/Linux:**
```bash
# Check if PostgreSQL is in PATH
which psql

# If not, add to PATH in ~/.bashrc or ~/.zshrc
export PATH="/usr/local/bin:$PATH"
```

### Problem: "password authentication failed"

- Make sure you're using the correct password
- Try resetting password:
  ```sql
  ALTER USER postgres PASSWORD 'new_password';
  ```

### Problem: "database already exists"

- That's okay! The database is already created
- You can skip to Step 6

### Problem: "could not connect to server"

**Windows:**
- Check if PostgreSQL service is running:
  1. Press `Win + R`
  2. Type `services.msc`
  3. Find "postgresql-x64-16"
  4. Right-click → Start (if stopped)

**macOS:**
```bash
brew services start postgresql@16
```

**Linux:**
```bash
sudo systemctl start postgresql
```

### Problem: "permission denied"

- Make sure you're using the `postgres` superuser
- Or create a new user with permissions:
  ```sql
  CREATE USER pbookspro_user WITH PASSWORD 'your_password';
  GRANT ALL PRIVILEGES ON DATABASE pbookspro TO pbookspro_user;
  ```

---

## Quick Reference Commands

```bash
# Connect to PostgreSQL
psql -U postgres

# Create database
createdb -U postgres pbookspro

# Connect to specific database
psql -U postgres -d pbookspro

# List all databases
psql -U postgres -c "\l"

# Drop database (if you need to start over)
dropdb -U postgres pbookspro

# List all tables in database
psql -U postgres -d pbookspro -c "\dt"
```

---

## Next Steps

After creating the database:

1. ✅ Database created: `pbookspro`
2. ✅ Connection string ready
3. ✅ `.env` file configured
4. **Run migration**: `cd server && npm run migrate`
5. **Start server**: `cd server && npm run dev`

See `MIGRATION_GUIDE.md` for the next steps!

