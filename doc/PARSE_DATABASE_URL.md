# How to Parse External Database URL

The External Database URL from Render looks like this:

```
postgresql://username:password@host:port/database
```

## Example URL

```
postgresql://pbookspro_user:abc123xyz@dpg-xxxxx-a.oregon-postgres.render.com:5432/pbookspro
```

## How to Extract Each Part

### Format Breakdown

```
postgresql://[username]:[password]@[host]:[port]/[database]
```

### Step-by-Step Extraction

From the example above:
- **Protocol:** `postgresql://` (ignore this)
- **Username:** `pbookspro_user` (between `://` and `:`)
- **Password:** `abc123xyz` (between first `:` and `@`)
- **Host:** `dpg-xxxxx-a.oregon-postgres.render.com` (between `@` and `:`)
- **Port:** `5432` (between second `:` and `/`)
- **Database:** `pbookspro` (after the last `/`)

## Visual Guide

```
postgresql://pbookspro_user:abc123xyz@dpg-xxxxx-a.oregon-postgres.render.com:5432/pbookspro
         │     │              │         │                                    │    │
         │     │              │         │                                    │    └─ Database
         │     │              │         │                                    └─ Port
         │     │              │         └─ Host
         │     │              └─ Password
         │     └─ Username
         └─ Protocol
```

## For pgAdmin Connection

When connecting in pgAdmin, use:

1. **Host name/address:** `dpg-xxxxx-a.oregon-postgres.render.com`
2. **Port:** `5432`
3. **Maintenance database:** `pbookspro`
4. **Username:** `pbookspro_user`
5. **Password:** `abc123xyz`

## For DBeaver Connection

When connecting in DBeaver:

1. **Host:** `dpg-xxxxx-a.oregon-postgres.render.com`
2. **Port:** `5432`
3. **Database:** `pbookspro`
4. **Username:** `pbookspro_user`
5. **Password:** `abc123xyz`

## Quick Method: Copy Entire URL

**Easiest way:** Most tools (pgAdmin, DBeaver) allow you to paste the entire URL directly!

### pgAdmin
- When creating a new server, there's often a "Connection String" field
- Paste the entire URL there

### DBeaver
- When creating a new connection, look for "URL" or "Connection String" option
- Paste the entire URL: `postgresql://username:password@host:port/database`

## Example: Real Render URL Format

Your Render External Database URL might look like:

```
postgresql://pbookspro_user:AbC123XyZ@dpg-abc123def456-a.oregon-postgres.render.com:5432/pbookspro
```

Breaking it down:
- **Username:** `pbookspro_user`
- **Password:** `AbC123XyZ`
- **Host:** `dpg-abc123def456-a.oregon-postgres.render.com`
- **Port:** `5432`
- **Database:** `pbookspro`

## Important Notes

1. **Password may contain special characters** - Make sure to copy it exactly
2. **Host name** - Usually ends with `.render.com`
3. **Port** - Usually `5432` for PostgreSQL
4. **Database name** - Usually matches your database name in Render

## If URL is Different Format

Some URLs might be:
- `postgres://` instead of `postgresql://` (same thing)
- No port specified (defaults to 5432)
- URL encoded characters (like `%40` for `@`)

## Quick Copy-Paste Method

**Best approach:** Most modern database tools can parse the full URL automatically:

1. Copy the entire External Database URL from Render
2. In pgAdmin/DBeaver, look for "Connection String" or "URL" field
3. Paste the entire URL
4. The tool will parse it automatically!

---

**Tip:** If your tool doesn't support URL parsing, use the breakdown method above to extract each component manually.

