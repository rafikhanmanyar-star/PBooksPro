# Quick Setup Instructions

## 1. Backend Server Setup

```bash
cd server
npm install
```

Create `server/.env`:
```env
DATABASE_URL=postgresql://user:password@localhost:5432/pbookspro
JWT_SECRET=your-super-secret-jwt-key-change-this
LICENSE_SECRET_SALT=PBOOKSPRO_SECURE_SALT_2024
NODE_ENV=development
PORT=3000
CORS_ORIGIN=http://localhost:5173,http://localhost:5174
```

Run migration:
```bash
npm run migrate
```

Start server:
```bash
npm run dev
```

## 2. Admin Portal Setup

```bash
cd admin
npm install
```

Start admin portal:
```bash
npm run dev
```

Access at: http://localhost:5174
- Login: `admin` / `admin123`

## 3. Database Setup

1. Install PostgreSQL
2. Create database: `createdb pbookspro`
3. Update `DATABASE_URL` in `server/.env`
4. Run migration: `cd server && npm run migrate`

## 4. MCP Server Setup (Optional - for AI Assistant Integration)

The MCP (Model Context Protocol) server allows AI assistants in Cursor to query your database and access API information.

```bash
cd mcp-server
npm install
npm run build
```

**Configure Cursor:**
1. Open Cursor Settings (Ctrl+, or Cmd+,)
2. Go to **Features** → **MCP Servers**
3. Add the following configuration:

```json
{
  "mcpServers": {
    "pbookspro": {
      "command": "node",
      "args": ["${workspaceFolder}/mcp-server/dist/index.js"]
    }
  }
}
```

4. Restart Cursor

The MCP server will automatically use the `DATABASE_URL` from `server/.env`. See `mcp-server/README.md` for more details.

## 5. Testing

1. Start backend: `cd server && npm run dev`
2. Start admin: `cd admin && npm run dev`
3. Visit admin portal: http://localhost:5174
4. Login with default credentials
5. Generate a test license for a tenant

## Next Steps

- Update client application to use API
- Deploy to Render using `render.yaml`
- Change default admin password
- Set up production environment variables
- Configure MCP server for AI assistant integration (optional)

See `MIGRATION_GUIDE.md` for detailed instructions.

