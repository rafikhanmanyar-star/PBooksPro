PBooks Pro â€” API server package
==============================

1. Install PostgreSQL on the server and create a database (e.g. pbookspro).

2. Copy env.example.txt to server\.env and set:
   - DATABASE_URL
   - JWT_SECRET (long random string)
   - PORT (default 3000)

3. Run run-migrations.bat once (from this folder) to apply SQL migrations in database\migrations.

4. Run start-server.bat to start the API. The client PCs use PBooks Pro Client and point to http://SERVER_IP:PORT on the login screen.

5. Firewall: allow inbound TCP on PORT (e.g. 3000) from your office LAN.

6. Node.js 20+ must be installed on the server (same as development).
