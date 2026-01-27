#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { Pool } from 'pg';
import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables - try multiple paths
const envPaths = [
  resolve(__dirname, '../../server/.env'),
  resolve(__dirname, '../../.env'),
  resolve(process.cwd(), 'server/.env'),
  resolve(process.cwd(), '.env'),
];

let envLoaded = false;
for (const envPath of envPaths) {
  const result = dotenv.config({ path: envPath });
  if (!result.error) {
    envLoaded = true;
    break;
  }
}

if (!envLoaded && !process.env.DATABASE_URL) {
  console.error('⚠️  Warning: Could not load .env file. Using DATABASE_URL from environment.');
}

// Database connection
const connectionString = process.env.DATABASE_URL || '';
if (!connectionString) {
  console.error('❌ DATABASE_URL environment variable is not set');
  console.error('   Please set DATABASE_URL in your environment or .env file');
  process.exit(1);
}

const pool = new Pool({
  connectionString,
  ssl: process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging' 
    ? { rejectUnauthorized: false } 
    : false,
  max: 5,
});

// Handle pool errors gracefully
pool.on('error', (err) => {
  console.error('❌ Unexpected database pool error:', err);
});

// Create MCP server
const server = new Server(
  {
    name: 'pbookspro-mcp-server',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
      resources: {},
    },
  }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'query_database',
        description: 'Execute a SQL query on the PBooksPro PostgreSQL database. Use this to query tenants, transactions, licenses, accounts, contacts, and other data. Only SELECT queries are allowed for safety.',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'SQL query to execute (SELECT only for safety)',
            },
            limit: {
              type: 'number',
              description: 'Maximum number of rows to return (default: 100)',
              default: 100,
            },
          },
          required: ['query'],
        },
      },
      {
        name: 'get_tenant_info',
        description: 'Get information about a specific tenant by ID or email',
        inputSchema: {
          type: 'object',
          properties: {
            tenantId: {
              type: 'string',
              description: 'Tenant ID',
            },
            email: {
              type: 'string',
              description: 'Tenant email address',
            },
          },
        },
      },
      {
        name: 'get_license_status',
        description: 'Get license status for a tenant including license key details',
        inputSchema: {
          type: 'object',
          properties: {
            tenantId: {
              type: 'string',
              description: 'Tenant ID',
            },
          },
          required: ['tenantId'],
        },
      },
      {
        name: 'get_transaction_stats',
        description: 'Get transaction statistics for a tenant, grouped by type',
        inputSchema: {
          type: 'object',
          properties: {
            tenantId: {
              type: 'string',
              description: 'Tenant ID',
            },
            startDate: {
              type: 'string',
              description: 'Start date (YYYY-MM-DD)',
            },
            endDate: {
              type: 'string',
              description: 'End date (YYYY-MM-DD)',
            },
          },
          required: ['tenantId'],
        },
      },
      {
        name: 'get_table_schema',
        description: 'Get the schema/structure of a database table including column names, types, and constraints',
        inputSchema: {
          type: 'object',
          properties: {
            tableName: {
              type: 'string',
              description: 'Name of the table',
            },
          },
          required: ['tableName'],
        },
      },
      {
        name: 'list_tables',
        description: 'List all tables in the database',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'get_account_balances',
        description: 'Get account balances for a tenant',
        inputSchema: {
          type: 'object',
          properties: {
            tenantId: {
              type: 'string',
              description: 'Tenant ID',
            },
            accountType: {
              type: 'string',
              description: 'Filter by account type (Bank, Cash, Asset, Liability, Equity)',
            },
          },
          required: ['tenantId'],
        },
      },
      {
        name: 'get_contact_count',
        description: 'Get count of contacts by type for a tenant',
        inputSchema: {
          type: 'object',
          properties: {
            tenantId: {
              type: 'string',
              description: 'Tenant ID',
            },
          },
          required: ['tenantId'],
        },
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'query_database': {
        let query = args?.query as string;
        const limit = (args?.limit as number) || 100;

        // Safety: Only allow SELECT queries
        const trimmedQuery = query.trim().toUpperCase();
        if (!trimmedQuery.startsWith('SELECT')) {
          throw new Error('Only SELECT queries are allowed for safety. INSERT, UPDATE, DELETE operations are not permitted.');
        }

        // Add LIMIT if not present and query doesn't have aggregation that might need all rows
        if (!trimmedQuery.includes('LIMIT') && !trimmedQuery.includes('GROUP BY')) {
          query = `${query} LIMIT ${limit}`;
        }

        const result = await pool.query(query);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result.rows, null, 2),
            },
          ],
        };
      }

      case 'get_tenant_info': {
        const tenantId = args?.tenantId as string;
        const email = args?.email as string;

        if (!tenantId && !email) {
          throw new Error('Either tenantId or email must be provided');
        }

        let query = 'SELECT * FROM tenants WHERE 1=1';
        const params: any[] = [];
        let paramIndex = 1;

        if (tenantId) {
          query += ` AND id = $${paramIndex++}`;
          params.push(tenantId);
        }
        if (email) {
          query += ` AND email = $${paramIndex++}`;
          params.push(email);
        }

        const result = await pool.query(query, params);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result.rows, null, 2),
            },
          ],
        };
      }

      case 'get_license_status': {
        const tenantId = args?.tenantId as string;
        const result = await pool.query(
          `SELECT 
            t.*,
            lk.status as license_key_status,
            lk.license_type,
            lk.expires_at,
            lk.created_at as license_created_at
          FROM tenants t
          LEFT JOIN license_keys lk ON t.license_key = lk.key
          WHERE t.id = $1`,
          [tenantId]
        );
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result.rows, null, 2),
            },
          ],
        };
      }

      case 'get_transaction_stats': {
        const tenantId = args?.tenantId as string;
        const startDate = args?.startDate as string;
        const endDate = args?.endDate as string;

        let query = `
          SELECT 
            type,
            COUNT(*) as count,
            SUM(amount) as total_amount,
            AVG(amount) as avg_amount,
            MIN(amount) as min_amount,
            MAX(amount) as max_amount
          FROM transactions
          WHERE tenant_id = $1
        `;
        const params: any[] = [tenantId];
        let paramIndex = 2;

        if (startDate) {
          query += ` AND date >= $${paramIndex++}`;
          params.push(startDate);
        }
        if (endDate) {
          query += ` AND date <= $${paramIndex++}`;
          params.push(endDate);
        }

        query += ' GROUP BY type ORDER BY type';

        const result = await pool.query(query, params);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result.rows, null, 2),
            },
          ],
        };
      }

      case 'get_table_schema': {
        const tableName = args?.tableName as string;
        const result = await pool.query(
          `SELECT 
            column_name,
            data_type,
            is_nullable,
            column_default,
            character_maximum_length
          FROM information_schema.columns
          WHERE table_name = $1
          ORDER BY ordinal_position`,
          [tableName]
        );
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result.rows, null, 2),
            },
          ],
        };
      }

      case 'list_tables': {
        const result = await pool.query(
          `SELECT table_name 
          FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_type = 'BASE TABLE'
          ORDER BY table_name`
        );
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result.rows.map((r: any) => r.table_name), null, 2),
            },
          ],
        };
      }

      case 'get_account_balances': {
        const tenantId = args?.tenantId as string;
        const accountType = args?.accountType as string;

        let query = `
          SELECT 
            id,
            name,
            type,
            balance,
            currency
          FROM accounts
          WHERE tenant_id = $1
        `;
        const params: any[] = [tenantId];
        let paramIndex = 2;

        if (accountType) {
          query += ` AND type = $${paramIndex++}`;
          params.push(accountType);
        }

        query += ' ORDER BY type, name';

        const result = await pool.query(query, params);
        
        // Calculate totals
        const totalBalance = result.rows.reduce((sum: number, row: any) => sum + (parseFloat(row.balance) || 0), 0);
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                accounts: result.rows,
                totalBalance,
                count: result.rows.length,
              }, null, 2),
            },
          ],
        };
      }

      case 'get_contact_count': {
        const tenantId = args?.tenantId as string;
        const result = await pool.query(
          `SELECT 
            type,
            COUNT(*) as count
          FROM contacts
          WHERE tenant_id = $1
          GROUP BY type
          ORDER BY type`,
          [tenantId]
        );
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result.rows, null, 2),
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error: any) {
    return {
      content: [
        {
          type: 'text',
          text: `Error: ${error.message}\n${error.stack || ''}`,
        },
      ],
      isError: true,
    };
  }
});

// List available resources
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  return {
    resources: [
      {
        uri: 'pbookspro://database/schema',
        name: 'Database Schema',
        description: 'Complete database schema information with all tables and columns',
        mimeType: 'application/json',
      },
      {
        uri: 'pbookspro://api/endpoints',
        name: 'API Endpoints',
        description: 'List of available API endpoints in the PBooksPro backend',
        mimeType: 'application/json',
      },
      {
        uri: 'pbookspro://project/structure',
        name: 'Project Structure',
        description: 'Overview of the PBooksPro project structure and key directories',
        mimeType: 'text/plain',
      },
    ],
  };
});

// Handle resource reads
server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params;

  try {
    if (uri === 'pbookspro://database/schema') {
      const result = await pool.query(
        `SELECT 
          table_name,
          column_name,
          data_type,
          is_nullable,
          column_default
        FROM information_schema.columns
        WHERE table_schema = 'public'
        ORDER BY table_name, ordinal_position`
      );
      return {
        contents: [
          {
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(result.rows, null, 2),
          },
        ],
      };
    }

    if (uri === 'pbookspro://api/endpoints') {
      const endpoints = {
        auth: [
          'POST /api/auth/login',
          'POST /api/auth/register-tenant',
        ],
        tenants: [
          'GET /api/tenants/me',
          'GET /api/tenants/license-status',
          'POST /api/tenants/activate-license',
        ],
        transactions: [
          'GET /api/transactions',
          'POST /api/transactions',
          'PUT /api/transactions/:id',
          'DELETE /api/transactions/:id',
        ],
        accounts: [
          'GET /api/accounts',
          'POST /api/accounts',
          'PUT /api/accounts/:id',
          'DELETE /api/accounts/:id',
        ],
        contacts: [
          'GET /api/contacts',
          'POST /api/contacts',
          'PUT /api/contacts/:id',
          'DELETE /api/contacts/:id',
        ],
        projects: [
          'GET /api/projects',
          'POST /api/projects',
          'PUT /api/projects/:id',
          'DELETE /api/projects/:id',
        ],
        invoices: [
          'GET /api/invoices',
          'POST /api/invoices',
          'PUT /api/invoices/:id',
          'DELETE /api/invoices/:id',
        ],
        admin: [
          'POST /api/admin/auth/login',
          'GET /api/admin/tenants',
          'GET /api/admin/licenses',
          'POST /api/admin/licenses/generate',
          'GET /api/admin/stats/dashboard',
        ],
      };
      return {
        contents: [
          {
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(endpoints, null, 2),
          },
        ],
      };
    }

    if (uri === 'pbookspro://project/structure') {
      const structure = `
PBooksPro Project Structure

Root Directory:
├── admin/              - Admin portal (React + TypeScript)
├── components/         - React components
│   ├── auth/          - Authentication components
│   ├── dashboard/     - Dashboard components
│   ├── transactions/  - Transaction management
│   ├── invoices/      - Invoice management
│   └── ...
├── server/            - Backend API server (Node.js + Express)
│   ├── api/           - API routes
│   ├── services/      - Business logic services
│   ├── migrations/    - Database migrations
│   └── scripts/       - Utility scripts
├── services/          - Frontend services
├── context/           - React contexts
├── hooks/             - Custom React hooks
├── types.ts           - TypeScript type definitions
└── config/            - Configuration files

Key Features:
- Multi-tenant architecture with Row Level Security
- License management system
- Transaction management
- Invoice and billing system
- Project management
- Rental management
- Payroll system
- Inventory management
- WhatsApp integration
- Offline sync capability
      `.trim();
      return {
        contents: [
          {
            uri,
            mimeType: 'text/plain',
            text: structure,
          },
        ],
      };
    }

    throw new Error(`Unknown resource: ${uri}`);
  } catch (error: any) {
    return {
      contents: [
        {
          uri,
          mimeType: 'text/plain',
          text: `Error reading resource: ${error.message}`,
        },
      ],
    };
  }
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('✅ PBooksPro MCP Server running on stdio');
}

main().catch((error) => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
