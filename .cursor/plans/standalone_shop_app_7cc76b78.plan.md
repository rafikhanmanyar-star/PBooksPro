---
name: Standalone Shop App
overview: Extract the shop module from PBooksPro into a standalone application with its own React frontend, Express API server, SQLite local database, and cloud PostgreSQL on Render -- all with independent authentication and multi-tenancy.
todos:
  - id: scaffold
    content: Create project structure with client/ and server/ directories, initialize npm, install dependencies
    status: completed
  - id: db-service
    content: Set up DatabaseService with dual PostgreSQL (cloud) + SQLite (local 'My Shop.db') support, copy tenant context
    status: completed
  - id: schema
    content: Create PostgreSQL migration with shop tables + RLS policies, and equivalent SQLite schema
    status: completed
  - id: auth
    content: Build independent auth system (register, login, JWT, tenant middleware)
    status: completed
  - id: shop-api
    content: Copy and adapt shop routes + shopService from PBooksPro, remove PBooksPro-specific dependencies
    status: completed
  - id: express-server
    content: Create Express entry point with CORS, middleware, auto-migrations, health check
    status: completed
  - id: frontend-components
    content: Copy shop components, contexts, API client, and types from PBooksPro; adapt imports
    status: completed
  - id: app-shell
    content: Build App.tsx with login/register pages, sidebar navigation, protected routes
    status: completed
  - id: render-deploy
    content: Create render.yaml, set up PostgreSQL DB and Web Service on Render
    status: completed
  - id: local-dev
    content: Set up local development with SQLite fallback, .env.example, README
    status: completed
isProject: false
---

# Standalone Shop Application - Step-by-Step Plan

## Architecture Overview

```mermaid
graph TB
    subgraph NewApp ["MyShop (New Standalone App)"]
        FE["React + Vite + Tailwind Frontend"]
        API["Express API Server"]
        SQLite["SQLite Local DB (My Shop.db)"]
        CloudDB["PostgreSQL on Render (new DB)"]
    end
    subgraph Existing ["PBooksPro (Existing)"]
        PBFrontend["PBooksPro Frontend"]
        PBAPI["PBooksPro API"]
        PBCloudDB["PBooksPro PostgreSQL on Render"]
    end
    FE --> API
    API --> SQLite
    API --> CloudDB
    PBFrontend --> PBAPI
    PBAPI --> PBCloudDB
```



Both apps share the **same Render PostgreSQL server** (same Render account) but use **separate databases**. The new Shop app has its own auth system, its own API server, and its own frontend.

---

## Phase 1: Project Scaffolding

### Step 1 - Create the new project repository

Create a new folder/repo (e.g. `MyShop`) with this structure:

```
MyShop/
  ├── client/                  # React frontend
  │   ├── src/
  │   │   ├── components/      # Shop UI components (from PBooksPro)
  │   │   ├── context/         # React contexts
  │   │   ├── services/        # API client
  │   │   ├── hooks/           # Custom hooks
  │   │   ├── types/           # TypeScript types
  │   │   ├── App.tsx
  │   │   └── main.tsx
  │   ├── index.html
  │   ├── vite.config.ts
  │   ├── tailwind.config.js
  │   ├── tsconfig.json
  │   └── package.json
  ├── server/
  │   ├── api/
  │   │   ├── index.ts         # Express entry point
  │   │   └── routes/
  │   │       ├── auth.ts      # Independent auth routes
  │   │       └── shop.ts      # Shop routes (from PBooksPro)
  │   ├── services/
  │   │   ├── databaseService.ts  # PostgreSQL + SQLite dual support
  │   │   ├── shopService.ts      # Shop business logic (from PBooksPro)
  │   │   ├── authService.ts      # Independent auth service
  │   │   └── tenantContext.ts    # Multi-tenant context
  │   ├── middleware/
  │   │   └── tenantMiddleware.ts # JWT + tenant middleware
  │   ├── migrations/
  │   │   └── 001-initial-schema.sql  # Shop tables only
  │   ├── tsconfig.json
  │   └── package.json
  ├── render.yaml              # Render deployment config
  ├── .env.example
  └── README.md
```

### Step 2 - Initialize the project

```bash
mkdir MyShop && cd MyShop
git init

# Server
mkdir -p server && cd server
npm init -y
npm install express pg cors jsonwebtoken bcryptjs dotenv connect-timeout better-sqlite3 sql.js
npm install -D typescript @types/express @types/pg @types/cors @types/jsonwebtoken @types/bcryptjs @types/better-sqlite3 tsx

# Client
cd .. && npm create vite@latest client -- --template react-ts
cd client
npm install tailwindcss @tailwindcss/vite lucide-react recharts date-fns axios socket.io-client
```

---

## Phase 2: Backend - API Server

### Step 3 - Database Service (dual mode)

Copy and adapt `[server/services/databaseService.ts](server/services/databaseService.ts)` from PBooksPro:

- **Cloud mode**: Connect to the new PostgreSQL DB on Render using `DATABASE_URL`
- **Local mode**: Use SQLite (`My Shop.db`) when `USE_LOCAL_DB=true` or no `DATABASE_URL` is set
- Keep the RLS / tenant context pattern from PBooksPro (`SET LOCAL app.current_tenant_id`)
- Copy `[server/services/tenantContext.ts](server/services/tenantContext.ts)` (AsyncLocalStorage pattern) as-is

### Step 4 - Database Schema (shop tables only)

Create `server/migrations/001-initial-schema.sql` with only the 10 shop-related tables extracted from PBooksPro:

- `users` (new - for independent auth)
- `tenants` (new - for multi-tenancy)
- `shop_policies`
- `shop_branches`
- `shop_terminals`
- `shop_warehouses`
- `shop_products`
- `shop_inventory`
- `shop_loyalty_members`
- `shop_sales`
- `shop_sale_items`
- `shop_inventory_movements`
- `shop_categories` (if exists as separate table)

Include RLS policies for tenant isolation (same pattern as PBooksPro's `postgresql-schema.sql` lines 421-570).

Also create an equivalent SQLite schema in `server/schema/sqlite-schema.sql` (no RLS, but `tenant_id` columns for filtering).

### Step 5 - Independent Authentication

Create `server/services/authService.ts` and `server/api/routes/auth.ts`:

- **Register**: Create tenant + admin user (bcrypt password hashing)
- **Login**: Verify credentials, return JWT with `{ tenantId, userId }` 
- **Middleware**: Adapt PBooksPro's `tenantMiddleware.ts` (remove license checks, keep JWT + tenant context)

### Step 6 - Shop API Routes & Service

Copy from PBooksPro and adapt:

- `[server/api/routes/shop.ts](server/api/routes/shop.ts)` -> `server/api/routes/shop.ts`
- `[server/services/shopService.ts](server/services/shopService.ts)` -> `server/services/shopService.ts`

Changes needed:

- Remove any imports referencing PBooksPro-specific modules (license, payroll, etc.)
- Update `getDatabaseService()` import path
- Keep all existing endpoints (branches, warehouses, terminals, categories, products, inventory, sales, loyalty, policies)

### Step 7 - Express Server Entry Point

Create `server/api/index.ts`:

- Port 3000, host `0.0.0.0`
- CORS with configurable origins
- JSON body parser
- Tenant middleware on all `/api/shop/*` routes
- Auth routes at `/api/auth` (public)
- Shop routes at `/api/shop`
- Auto-run migrations on startup
- Health check endpoint at `/api/health`

---

## Phase 3: Frontend - React App

### Step 8 - Copy and adapt shop components

Copy these directories from PBooksPro into `client/src/components/`:

- `components/shop/` (all ~40 component files)
  - `pos/`, `inventory/`, `multistore/`, `loyalty/`, `bi/`, `accounting/`

### Step 9 - Copy and adapt contexts

Copy and adapt these contexts into `client/src/context/`:

- `POSContext.tsx` - Cart, checkout, payment
- `InventoryContext.tsx` - Stock management  
- `LoyaltyContext.tsx` - Loyalty program
- `MultiStoreContext.tsx` - Branch/terminal management
- Create new `AuthContext.tsx` - Login state, JWT storage, user info

### Step 10 - API Client

Copy and adapt `[services/api/shopApi.ts](services/api/shopApi.ts)` -> `client/src/services/shopApi.ts`:

- Update base URL to point to the new API server (`VITE_API_URL` env var)
- Add auth API methods (login, register, logout)
- Keep all existing shop API methods

### Step 11 - App Shell & Routing

Create `client/src/App.tsx` with:

- Login/Register pages (since auth is independent)
- Sidebar navigation for shop sections (POS, Inventory, Procurement, Loyalty, Multi-Store, BI, Accounting)
- Protected routes (redirect to login if not authenticated)
- Use the same Tailwind styling patterns from PBooksPro

### Step 12 - Types

Extract shop-related types from PBooksPro's `[types.ts](types.ts)` into `client/src/types/`:

- Shop product, category, branch, terminal, warehouse types
- Sale, sale item types
- Loyalty member types
- Inventory, movement types

---

## Phase 4: Deployment on Render

### Step 13 - Create PostgreSQL Database on Render

1. Go to Render Dashboard -> **New** -> **PostgreSQL**
2. Name: `myshop-db` (or `myshop-db-staging` for staging)
3. Database name: `myshop`
4. Region: Same as PBooksPro for low latency
5. Plan: Starter (or Free for testing)
6. Copy the **External Database URL**

### Step 14 - Create Web Service on Render

1. Go to Render Dashboard -> **New** -> **Web Service**
2. Connect your MyShop Git repo
3. Name: `myshop-api`
4. Build command: `cd server && npm install && npm run build`
5. Start command: `cd server && npm start`
6. Environment variables:
  - `DATABASE_URL` = (External PostgreSQL URL from Step 13)
  - `JWT_SECRET` = (auto-generate)
  - `NODE_ENV` = `production`
  - `PORT` = `3000`
  - `CORS_ORIGIN` = your frontend URLs

### Step 15 - Deploy Frontend

Option A: **Render Static Site**

- Build command: `cd client && npm install && npm run build`
- Publish directory: `client/dist`
- Env: `VITE_API_URL` = `https://myshop-api.onrender.com`

Option B: **Same Web Service** (serve static files from Express)

- Build client during server build, serve from Express

### Step 16 - Create `render.yaml`

```yaml
databases:
  - name: myshop-db
    databaseName: myshop
    user: myshop_user

services:
  - type: web
    name: myshop-api
    env: node
    plan: starter
    buildCommand: cd server && npm install && npm run build
    startCommand: cd server && npm start
    envVars:
      - key: JWT_SECRET
        generateValue: true
      - key: NODE_ENV
        value: production
      - key: PORT
        value: 3000
```

---

## Phase 5: Local Development Setup

### Step 17 - Local SQLite Mode

When running locally without `DATABASE_URL`:

- The database service auto-creates `My Shop.db` (SQLite file) in the project root
- Apply SQLite schema on first run
- No RLS (use `WHERE tenant_id = ?` in queries instead)

### Step 18 - Environment files

Create `.env.example`:

```
# Cloud mode (Render PostgreSQL)
DATABASE_URL=postgresql://user:pass@host:5432/myshop

# Local mode (leave DATABASE_URL empty, uses SQLite)
# USE_LOCAL_DB=true

JWT_SECRET=your-secret-here
PORT=3000
CORS_ORIGIN=http://localhost:5173
```

---

## Key Files to Copy from PBooksPro


| Source (PBooksPro)                   | Destination (MyShop)                       |
| ------------------------------------ | ------------------------------------------ |
| `components/shop/*`                  | `client/src/components/shop/*`             |
| `context/POSContext.tsx`             | `client/src/context/POSContext.tsx`        |
| `context/InventoryContext.tsx`       | `client/src/context/InventoryContext.tsx`  |
| `context/LoyaltyContext.tsx`         | `client/src/context/LoyaltyContext.tsx`    |
| `context/MultiStoreContext.tsx`      | `client/src/context/MultiStoreContext.tsx` |
| `services/api/shopApi.ts`            | `client/src/services/shopApi.ts`           |
| `server/api/routes/shop.ts`          | `server/api/routes/shop.ts`                |
| `server/services/shopService.ts`     | `server/services/shopService.ts`           |
| `server/services/databaseService.ts` | `server/services/databaseService.ts`       |
| `server/services/tenantContext.ts`   | `server/services/tenantContext.ts`         |


---

## What Stays in PBooksPro

After extracting, you can optionally remove shop components from PBooksPro, or keep them and deprecate. The two apps will be fully independent -- separate databases, separate auth, separate deployments.