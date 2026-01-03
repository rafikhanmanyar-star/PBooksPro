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

import express from 'express';
import cors from 'cors';
import { Pool } from 'pg';
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
import { tenantMiddleware } from '../middleware/tenantMiddleware.js';
import { licenseMiddleware } from '../middleware/licenseMiddleware.js';

const app = express();
const port = process.env.PORT || 3000;

// PostgreSQL connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

// Test database connection on startup
pool.query('SELECT NOW()')
  .then(() => {
    console.log('✅ Connected to PostgreSQL database');
  })
  .catch((err) => {
    console.error('❌ Database connection error:', err.message);
    console.error('   Make sure PostgreSQL is running and DATABASE_URL is correct');
  });

pool.on('error', (err) => {
  console.error('❌ Database connection error:', err);
});

// Middleware
app.use(cors({
  origin: process.env.CORS_ORIGIN?.split(',') || '*',
  credentials: true
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

// Protected routes (tenant + license authentication required)
app.use('/api', tenantMiddleware(pool));
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
app.use('/api/tenants', tenantRouter); // Tenant management (for authenticated tenants)

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// Start server
app.listen(port, () => {
  console.log(`🚀 API server running on port ${port}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
});

export default app;

