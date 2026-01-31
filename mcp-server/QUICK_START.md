# MCP Server Quick Start

## ✅ Installation Complete!

The MCP server has been installed and built successfully.

## Next Steps

### 1. Configure Cursor (2 minutes)

Open Cursor Settings (Ctrl+,) and add this to your settings.json:

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

**Or use absolute path:**
```json
{
  "mcpServers": {
    "pbookspro": {
      "command": "node",
      "args": ["f:/AntiGravity projects/PBooksPro/mcp-server/dist/index.js"]
    }
  }
}
```

### 2. Restart Cursor

Close and reopen Cursor completely.

### 3. Test It!

Ask Cursor AI:
- "How many tenants are in the database?"
- "Show me the schema of the transactions table"
- "What API endpoints are available?"

## What You Can Ask

### Database Queries
- "Query the database: SELECT * FROM tenants LIMIT 5"
- "How many transactions are there?"
- "What tables exist in the database?"

### Tenant Information
- "Get tenant info for email@example.com"
- "What's the license status for tenant X?"
- "Show me all active tenants"

### Statistics
- "Get transaction stats for tenant X"
- "What are the account balances for tenant Y?"
- "How many contacts does tenant Z have?"

### Schema & API
- "What's the schema of the accounts table?"
- "List all API endpoints"
- "Show me the project structure"

## Troubleshooting

**Server not working?**
1. Check `server/.env` has `DATABASE_URL`
2. Verify path in Cursor settings
3. Restart Cursor completely

**Need help?**
See `doc/MCP_SERVER_SETUP.md` for detailed guide.
