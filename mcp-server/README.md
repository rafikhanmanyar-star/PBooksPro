# PBooksPro MCP Server

Model Context Protocol server for PBooksPro that provides database and API access to AI assistants in Cursor.

## Features

- **Database Queries**: Execute safe SELECT queries on your PostgreSQL database
- **Tenant Information**: Get tenant details, license status, and statistics
- **Transaction Stats**: Query transaction data and statistics
- **Schema Discovery**: Explore database schema and table structures
- **API Documentation**: Access API endpoint information
- **Account Balances**: Get account balance information
- **Contact Statistics**: Get contact counts by type

## Setup

### 1. Install Dependencies

```bash
cd mcp-server
npm install
```

### 2. Build the Server

```bash
npm run build
```

### 3. Configure Cursor

Add the MCP server to your Cursor settings. You can do this in two ways:

#### Option A: Via Cursor Settings UI

1. Open Cursor Settings (Ctrl+, or Cmd+,)
2. Go to **Features** → **MCP Servers**
3. Click **Add Server**
4. Add the following configuration:

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

#### Option B: Edit Settings File Directly

Edit your Cursor settings file (usually located at):
- Windows: `%APPDATA%\Cursor\User\settings.json`
- macOS: `~/Library/Application Support/Cursor/User/settings.json`
- Linux: `~/.config/Cursor/User/settings.json`

Add the MCP server configuration:

```json
{
  "mcpServers": {
    "pbookspro": {
      "command": "node",
      "args": ["${workspaceFolder}/mcp-server/dist/index.js"],
      "env": {
        "DATABASE_URL": "your_database_url_here"
      }
    }
  }
}
```

**Note**: If you don't set `DATABASE_URL` in the env section, the server will automatically look for it in:
1. `server/.env` file
2. Root `.env` file
3. Environment variables

### 4. Restart Cursor

After configuring, restart Cursor for the changes to take effect.

## Available Tools

### `query_database`
Execute SELECT queries on the database. Only SELECT queries are allowed for safety.

**Parameters:**
- `query` (required): SQL SELECT query
- `limit` (optional): Maximum rows to return (default: 100)

**Example:**
```json
{
  "query": "SELECT * FROM tenants LIMIT 10",
  "limit": 10
}
```

### `get_tenant_info`
Get information about a specific tenant.

**Parameters:**
- `tenantId` (optional): Tenant ID
- `email` (optional): Tenant email address

**Example:**
```json
{
  "tenantId": "tenant_123"
}
```

### `get_license_status`
Get license status for a tenant.

**Parameters:**
- `tenantId` (required): Tenant ID

### `get_transaction_stats`
Get transaction statistics grouped by type.

**Parameters:**
- `tenantId` (required): Tenant ID
- `startDate` (optional): Start date (YYYY-MM-DD)
- `endDate` (optional): End date (YYYY-MM-DD)

### `get_table_schema`
Get the schema of a database table.

**Parameters:**
- `tableName` (required): Name of the table

### `list_tables`
List all tables in the database.

### `get_account_balances`
Get account balances for a tenant.

**Parameters:**
- `tenantId` (required): Tenant ID
- `accountType` (optional): Filter by account type

### `get_contact_count`
Get count of contacts by type for a tenant.

**Parameters:**
- `tenantId` (required): Tenant ID

## Available Resources

### `pbookspro://database/schema`
Complete database schema with all tables and columns.

### `pbookspro://api/endpoints`
List of all available API endpoints.

### `pbookspro://project/structure`
Overview of the project structure.

## Development

```bash
# Run in development mode (with hot reload)
npm run dev

# Build for production
npm run build

# Run production build
npm start
```

## Security

- **Read-Only Queries**: Only SELECT queries are allowed. INSERT, UPDATE, DELETE operations are blocked.
- **Connection Pooling**: Uses PostgreSQL connection pooling for efficient database access.
- **Environment Variables**: Sensitive data like database URLs are loaded from environment variables.
- **Error Handling**: All errors are caught and returned safely without exposing sensitive information.

## Troubleshooting

### Server Not Starting

1. **Check DATABASE_URL**: Ensure `DATABASE_URL` is set in your environment or `.env` file
2. **Check Node Version**: Ensure you're using Node.js 18+ 
3. **Check Build**: Run `npm run build` to ensure the server is compiled

### Connection Errors

1. **Database URL Format**: Ensure your DATABASE_URL follows the format:
   ```
   postgresql://user:password@host:port/database
   ```
2. **SSL Settings**: For production/staging databases, SSL is automatically enabled
3. **Network Access**: Ensure your database is accessible from your machine

### Tool Not Found

- Restart Cursor after making changes to the MCP server
- Check the Cursor console for error messages
- Verify the server is running by checking the Cursor MCP status

## Usage Examples

Once configured, you can ask Cursor AI questions like:

- "How many tenants are in the database?"
- "Show me the license status for tenant X"
- "What's the transaction summary for tenant Y this month?"
- "What columns does the transactions table have?"
- "List all API endpoints available for tenants"
- "What's the total balance across all accounts for tenant Z?"

The AI will use the MCP server tools to query your database and provide real-time, accurate information!
