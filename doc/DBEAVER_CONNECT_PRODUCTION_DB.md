# DBeaver: Connect to pbookspro-db-production (Render PostgreSQL)

Use this guide when DBeaver cannot connect to the production database using the external DB URL from Render.

---

## Prerequisites

- **DBeaver** installed (Community or Pro).
- **External Database URL** for `pbookspro-db-production` from the Render dashboard (see Step 1).

---

## Step 1: Get the correct External Database URL from Render

1. Go to [Render Dashboard](https://dashboard.render.com/) and sign in.
2. Click **Databases** in the left sidebar (or find your DB under the project).
3. Click the **production** database — the one named **pbookspro-db-production** (or similar, e.g. `pbookspro-db`).
4. On the database page, find the **Connect** section.
5. Select **External Connection** (not Internal).
6. Copy the **External Database URL**. It looks like:
   ```text
   postgresql://USER:PASSWORD@HOST/DATABASE_NAME
   ```
   or with port:
   ```text
   postgresql://USER:PASSWORD@HOST:5432/DATABASE_NAME
   ```
7. **Do not** use the Internal Database URL — that only works from other Render services, not from your PC.

If you don’t see an External URL or the DB was recently created, wait a few minutes and refresh; Render may still be provisioning.

---

## Step 2: Parse the URL for DBeaver

From the External URL you can read:

| Part           | Example from URL                                      | DBeaver field  |
|----------------|--------------------------------------------------------|----------------|
| **User**       | Between `://` and first `:`                            | Main → Username |
| **Password**   | Between first `:` and `@` (may contain `:`)            | Main → Password |
| **Host**       | Between `@` and `:` or `/`                             | Main → Host     |
| **Port**       | After host `:` and before `/` (default **5432**)      | Main → Port     |
| **Database**   | After the last `/` (no query string)                   | Main → Database |

Example:

- URL: `postgresql://pbookspro_user:myPass123@dpg-xxxx.oregon-postgres.render.com/pbookspro_iv80`
- **Host:** `dpg-xxxx.oregon-postgres.render.com`
- **Port:** `5432`
- **Database:** `pbookspro_iv80`
- **Username:** `pbookspro_user`
- **Password:** `myPass123`

If the password contains `@`, `:`, or `/`, it might be URL-encoded (e.g. `%40` for `@`). Use the **decoded** password in DBeaver (the one Render shows when you reveal it).

---

## Step 3: Create a new connection in DBeaver

1. Open **DBeaver**.
2. **Database → New Database Connection** (or click the plug icon).
3. Choose **PostgreSQL** → **Next**.

---

## Step 4: Fill the Main tab

1. **Host:** paste the host from Step 2 (e.g. `dpg-d680l5248b3s73ab3c9g-a.oregon-postgres.render.com`).
2. **Port:** `5432` (unless your URL has a different port).
3. **Database:** paste the database name (e.g. `pbookspro_iv80`).
4. **Username:** paste the user (e.g. `pbookspro_user`).
5. **Password:** paste the password. Check **Save password** if you want DBeaver to remember it.
6. **Connection name (optional):** e.g. `pbookspro-db-production`.

---

## Step 5: Enable SSL (required for Render)

Render’s PostgreSQL requires SSL for external connections.

1. In the connection settings, open the **SSL** tab.
2. Enable **Use SSL**.
3. Set **SSL mode** to one of:
   - **require** (recommended), or  
   - **verify-full** if you want full certificate verification (you may need to add Render’s CA).
4. Leave client certificate/key empty unless Render provides them.
5. Click **Test Connection**.

If **Test Connection** fails, try **SSL mode = require** first.

---

## Step 6: Test and save

1. Click **Test Connection**.  
   - First time, DBeaver may download the PostgreSQL driver; allow it.
2. If you see **Connected**, click **OK** to save the connection.
3. If it fails, go to **Troubleshooting** below.

---

## Troubleshooting

### “Connection refused” or “Could not connect”

- Confirm you are using the **External** Database URL, not Internal.
- Confirm **Host** has no `https://` or `postgresql://` — only the hostname.
- Confirm **Port** is `5432`.
- Check firewall/antivirus: allow outbound TCP to port 5432 and to `*.render.com` (or the specific host).
- From PowerShell, test reachability:
  ```powershell
  Test-NetConnection -ComputerName dpg-xxxx.oregon-postgres.render.com -Port 5432
  ```
  (Replace with your actual host.)

### “SSL required” or “no pg_hba.conf entry”

- In DBeaver, go to the connection → **Edit** → **SSL** tab.
- Enable **Use SSL** and set **SSL mode** to **require**, then test again.

### “Authentication failed” or “password authentication failed”

- Re-copy the **password** from Render (reveal and copy again).
- If the password has special characters (`@`, `:`, `#`, `/`, `%`), ensure you’re using the **decoded** value (what you’d type in a terminal). If Render shows a URL-encoded value, decode it before pasting into DBeaver.
- Confirm **Username** and **Database** match the External URL exactly (case-sensitive).

### “Database does not exist”

- The **Database** field in DBeaver must match the database name in the URL (segment after the last `/`). Render often generates names like `pbookspro_iv80` — get it from the URL or from the Render DB **Info** tab.

### “Connection timed out”

- Render free-tier DBs may spin down; the first connection can be slow. Wait 1–2 minutes and try again.
- Ensure your network allows outbound connections to Render (no corporate firewall blocking).

### Using the URL from `server/.env`

If you use `PRODUCTION_DATABASE_URL` from `server/.env`:

1. Copy the value (starts with `postgresql://`).
2. Parse it as in Step 2 and enter **Host**, **Port**, **Database**, **Username**, and **Password** in DBeaver.
3. Do **not** paste the full URL into a single DBeaver field; DBeaver expects separate fields.
4. If the DB was recreated or renamed on Render (e.g. to **pbookspro-db-production**), the host/database name in the URL may have changed — always take the **current** External Database URL from the Render dashboard for that database.

---

## Quick checklist

- [ ] Using **External** Database URL from Render (not Internal).
- [ ] Host = hostname only (no `postgresql://` or `https://`).
- [ ] Port = **5432**.
- [ ] Database name = segment after last `/` in URL.
- [ ] Username and password from the same URL (password decoded if URL-encoded).
- [ ] **SSL** tab: **Use SSL** = on, **SSL mode** = **require**.
- [ ] Firewall/antivirus allows outbound TCP 5432 to Render host.

After that, **Test Connection** in DBeaver should succeed. If it still fails, note the exact error message and check the Troubleshooting section for that message.
