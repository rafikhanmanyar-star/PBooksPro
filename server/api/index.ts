// Load environment variables FIRST, before any other imports
import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env from server directory (one level up from api/)
// Try multiple paths to ensure we find the .env file
const envPath = resolve(__dirname, '../.env');
const result = dotenv.config({ path: envPath });

if (result.error && !process.env.DATABASE_URL) {
  console.warn('⚠️  Warning: Could not load .env file from:', envPath);
  console.warn('   Error:', result.error.message);
  console.warn('   Current directory:', process.cwd());
  console.warn('   __dirname:', __dirname);
}

// Run migrations on startup (non-blocking)
(async () => {
  try {
    const { runMigrations } = await import('../scripts/run-migrations-on-startup.js');
    await runMigrations();
  } catch (error) {
    console.warn('⚠️  Could not run migrations on startup:', error);
    // Continue anyway - migrations might already be done
  }
})();

import express, { Response, NextFunction } from 'express';
import cors from 'cors';
import { Pool } from 'pg';
import { createServer } from 'http';
import { getWebSocketService } from '../services/websocketService.js';
import authRouter from './routes/auth.js';
import tenantRouter from './routes/tenants.js';
import adminRouter from './routes/admin/index.js';
import transactionsRouter from './routes/transactions.js';
import accountsRouter from './routes/accounts.js';
import contactsRouter from './routes/contacts.js';
import categoriesRouter from './routes/categories.js';
import projectsRouter from './routes/projects.js';
import buildingsRouter from './routes/buildings.js';
import propertiesRouter from './routes/properties.js';
import unitsRouter from './routes/units.js';
import invoicesRouter from './routes/invoices.js';
import billsRouter from './routes/bills.js';
import budgetsRouter from './routes/budgets.js';
import rentalAgreementsRouter from './routes/rentalAgreements.js';
import projectAgreementsRouter from './routes/projectAgreements.js';
import contractsRouter from './routes/contracts.js';
import usersRouter from './routes/users.js';
import transactionAuditRouter from './routes/transaction-audit.js';
import paymentsRouter from './routes/payments.js';
import { tenantMiddleware } from '../middleware/tenantMiddleware.js';
import { licenseMiddleware } from '../middleware/licenseMiddleware.js';

const app = express();
const httpServer = createServer(app);
const port = process.env.PORT || 3000;

// Use DatabaseService singleton instead of creating separate pool
// This ensures consistent connection management across the application
import { getDatabaseService } from '../services/databaseService.js';

// Test database connection on startup with retry
(async () => {
  let retries = 5;
  let connected = false;
  
  while (retries > 0 && !connected) {
    try {
      const db = getDatabaseService();
      await db.healthCheck();
      console.log('✅ Connected to PostgreSQL database');
      connected = true;
    } catch (err: any) {
      retries--;
      if (retries > 0) {
        console.warn(`⚠️ Database connection failed, retrying... (${retries} attempts left)`);
        await new Promise(resolve => setTimeout(resolve, 2000));
      } else {
        console.error('❌ Database connection error:', err.message);
        console.error('   Make sure PostgreSQL is running and DATABASE_URL is correct');
        console.error('   Using External Database URL (not Internal) from Render Dashboard');
      }
    }
  }
})();

// Create pool for tenantMiddleware (it needs direct pool access for RLS)
// But use DatabaseService for all other operations
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000, // Increased for Render cold starts
});

pool.on('error', (err) => {
  console.error('❌ Database pool error:', err);
  // Don't exit - let the pool handle reconnection
});

// Middleware - CORS configuration
const corsOrigins = process.env.CORS_ORIGIN 
  ? process.env.CORS_ORIGIN.split(',').map(origin => origin.trim())
  : ['*'];

console.log('🌐 CORS Origins:', corsOrigins);

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) {
      console.log('✅ CORS: Allowing request with no origin');
      return callback(null, true);
    }
    
    // Check if origin is in allowed list
    const isAllowed = corsOrigins.includes('*') || corsOrigins.includes(origin);
    
    if (isAllowed) {
      console.log(`✅ CORS: Allowing origin: ${origin}`);
      callback(null, true);
    } else {
      console.log(`❌ CORS: Blocking origin: ${origin} (allowed: ${corsOrigins.join(', ')})`);
      callback(new Error(`Not allowed by CORS: ${origin}`));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Tenant-ID'],
  exposedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 86400 // 24 hours
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Root route
app.get('/', (req, res) => {
  res.json({
    message: 'PBooksPro API Server',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      health: '/health',
      api: '/api',
      admin: '/api/admin',
      docs: 'See README.md for API documentation'
    },
    timestamp: new Date().toISOString()
  });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    database: pool.totalCount > 0 ? 'connected' : 'disconnected'
  });
});

// Public routes (no authentication required)
app.use('/api/auth', authRouter);
// Tenant registration endpoint (also accessible via auth router)
app.post('/api/tenants/register', async (req, res, next) => {
  // Forward to auth router
  req.url = '/register-tenant';
  authRouter(req, res, next);
});

// Admin routes (admin authentication required)
app.use('/api/admin', adminRouter);

// Payment webhook endpoint (public, no auth required)
// Must be defined BEFORE tenantMiddleware to allow gateway callbacks
// Note: PayFast sends form-encoded data, which is handled by urlencoded middleware
app.post('/api/payments/webhook/:gateway', async (req, res, next) => {
  try {
    const paymentsModule = await import('./routes/payments.js');
    await paymentsModule.handleWebhookRoute(req, res, next);
  } catch (error) {
    console.error('Webhook route error:', error);
    // Return 200 to prevent gateway retries
    res.status(200).send('OK');
  }
});

// Protected routes (tenant + license authentication required)
app.use('/api', tenantMiddleware(pool));

// Payment routes (require tenant context but allow expired licenses)
app.use('/api/payments', (req: any, res: Response, next: NextFunction) => {
  // Skip license check for payment routes - allow expired tenants to pay
  next();
}, paymentsRouter);

// Payment test routes (for mock gateway testing - only in development)
if (process.env.NODE_ENV !== 'production') {
  import('./routes/payments-test.js').then(module => {
    app.use('/api/payments/test', module.default);
    console.log('🧪 Payment test routes enabled (mock gateway testing)');
  });
}

app.use('/api', licenseMiddleware());

// Data routes (require tenant context and valid license)
app.use('/api/transactions', transactionsRouter);
app.use('/api/accounts', accountsRouter);
app.use('/api/contacts', contactsRouter);
app.use('/api/categories', categoriesRouter);
app.use('/api/projects', projectsRouter);
app.use('/api/buildings', buildingsRouter);
app.use('/api/properties', propertiesRouter);
app.use('/api/units', unitsRouter);
app.use('/api/invoices', invoicesRouter);
app.use('/api/bills', billsRouter);
app.use('/api/budgets', budgetsRouter);
app.use('/api/rental-agreements', rentalAgreementsRouter);
app.use('/api/project-agreements', projectAgreementsRouter);
app.use('/api/contracts', contractsRouter);
app.use('/api/users', usersRouter); // User management (for authenticated tenants)
app.use('/api/tenants', tenantRouter); // Tenant management (for authenticated tenants)
app.use('/api/transaction-audit', transactionAuditRouter); // Transaction audit logs

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// Initialize WebSocket service
const wsService = getWebSocketService();
wsService.initialize(httpServer, corsOrigins);

// Export WebSocket service for use in routes
export { wsService };

// Start server
httpServer.listen(port, () => {
  console.log(`🚀 API server running on port ${port}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔌 WebSocket server initialized`);
});

export default app;

