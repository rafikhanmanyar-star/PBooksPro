# How to View Tables in DBeaver

## Method 1: Database Navigator (Easiest)

1. **Look at the left sidebar** in DBeaver
2. **Expand your database connection** (click the arrow/plus icon)
3. **Expand "Databases"** folder
4. **Expand your database name** (e.g., `pbookspro`)
5. **Expand "Schemas"** folder
6. **Expand "public"** schema
7. **Click on "Tables"** folder
8. **You'll see all tables** listed:
   - admin_users
   - tenants
   - users
   - accounts
   - etc.

## Method 2: Right-Click Menu

1. **Right-click** on your database connection in the left sidebar
2. Select **"SQL Editor"** → **"Open SQL Script"**
3. Or right-click on the database name → **"SQL Editor"**

## Method 3: View Tables via SQL

Run this SQL query in SQL Editor:

```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public'
ORDER BY table_name;
```

This will show all tables in a result grid.

## Method 4: Database Navigator Tree

The left sidebar shows a tree structure:

```
📁 Your Connection Name
  └── 📁 Databases
      └── 📁 pbookspro (your database)
          └── 📁 Schemas
              └── 📁 public
                  ├── 📁 Tables ← Click here!
                  ├── 📁 Views
                  ├── 📁 Functions
                  └── 📁 Sequences
```

## View Table Data

Once you see the tables:

1. **Double-click** a table name (e.g., `admin_users`)
2. Or **right-click** → **"View Data"**
3. This opens the table data in a grid

## View Table Structure

1. **Right-click** a table name
2. Select **"View Table"** or **"Properties"**
3. See columns, data types, constraints, etc.

## Quick Check: See admin_users Table

1. In left sidebar: **Database** → **Schemas** → **public** → **Tables**
2. Look for **`admin_users`** in the list
3. **Double-click** it to see the data
4. Or **right-click** → **"View Data"**

## If Tables Folder is Empty

If you don't see any tables:

1. **Right-click** on "Tables" folder
2. Select **"Refresh"** or **"Reload"**
3. Or check if you're looking at the correct database/schema

## Navigate to SQL Editor

To run SQL queries:

1. **Right-click** your database connection
2. Select **"SQL Editor"** → **"New SQL Script"**
3. Or click the **SQL Editor icon** in the toolbar (usually looks like a document with SQL)

---

**Quick Tip:** The left sidebar is your main navigation - expand folders to see tables, views, and other database objects!

