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

// Optional log filter for debugging (e.g., focus on payment/WhatsApp logs)
// Enable with LOG_ONLY_PAYMENT=true to suppress other logs; allows payment|paddle|webhook|whatsapp
if (process.env.LOG_ONLY_PAYMENT === 'true') {
  const shouldLog = (args: unknown[]) => {
    const text = args
      .map(arg => (arg instanceof Error ? arg.message : String(arg)))
      .join(' ')
      .toLowerCase();
    return /payment|paddle|webhook|whatsapp/.test(text);
  };

  const wrap = (method: (...args: any[]) => void) => (...args: any[]) => {
    if (shouldLog(args)) {
      method(...args);
    }
  };

  console.log = wrap(console.log);
  console.warn = wrap(console.warn);
  console.error = wrap(console.error);
}

// Run migrations on startup (non-blocking - don't await)
// Set DISABLE_MIGRATIONS=true to skip (e.g. staging DB already updated)
(async () => {
  if (process.env.DISABLE_MIGRATIONS === 'true') {
    console.log('⏭️  Migrations disabled (DISABLE_MIGRATIONS=true)');
    return;
  }
  try {
    const { runMigrations } = await import('../scripts/run-migrations-on-startup.js');
    runMigrations().catch((err: any) => {
      console.error('⚠️  Background migration error:', err);
      // Log but don't block server startup
    });
    console.log('🚀 Server starting (migrations running in background)...');
  } catch (error) {
    console.warn('⚠️  Could not start migrations on startup:', error);
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
import planAmenitiesRouter from './routes/planAmenities.js';
import installmentPlansRouter from './routes/installmentPlans.js';
import rentalAgreementsRouter from './routes/rentalAgreements.js';
import rentalArRouter from './routes/rental-ar.js';
import projectAgreementsRouter from './routes/projectAgreements.js';
import contractsRouter from './routes/contracts.js';
import salesReturnsRouter from './routes/salesReturns.js';
import usersRouter from './routes/users.js';
import transactionAuditRouter from './routes/transaction-audit.js';
import paymentsRouter from './routes/payments.js';
import quotationsRouter from './routes/quotations.js';
import documentsRouter from './routes/documents.js';
import recurringInvoiceTemplatesRouter from './routes/recurring-invoice-templates.js';
import errorLogRouter from './routes/error-log.js';
import appSettingsRouter from './routes/app-settings.js';
import pmCycleAllocationsRouter from './routes/pm-cycle-allocations.js';
import dataManagementRouter from './routes/data-management.js';
import dataImportExportRouter from './routes/data-import-export.js';
import appInfoRouter from './routes/app-info.js';
import whatsappRouter from './routes/whatsapp.js';
import whatsappWebhookRouter from './routes/whatsapp-webhook.js';
import payrollRouter from './routes/payroll.js';
import stateChangesRouter from './routes/stateChanges.js';
import vendorsRouter from './routes/vendors.js';
import { tenantMiddleware } from '../middleware/tenantMiddleware.js';
import { licenseMiddleware } from '../middleware/licenseMiddleware.js';
import { trackRequestMetrics } from './routes/admin/system-metrics.js';
import timeout from 'connect-timeout';

const app = express();
const httpServer = createServer(app);
const port = Number(process.env.PORT) || 3000;

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

        // Check if it's an ENOTFOUND error (common with internal URLs)
        if (err.code === 'ENOTFOUND' || err.message?.includes('getaddrinfo ENOTFOUND')) {
          const dbUrl = process.env.DATABASE_URL || '';
          const isInternalUrl = dbUrl.includes('@dpg-') && !dbUrl.includes('.render.com');
          if (isInternalUrl) {
            console.error('   ⚠️  DETECTED: Database URL appears to be an internal URL (missing .render.com domain)');
            console.error('   💡 SOLUTION: Use the External Database URL from Render Dashboard');
            console.error('   💡 Expected format: postgresql://user:pass@dpg-xxx-a.region-postgres.render.com:5432/dbname');
            console.error('   📖 See: doc/FIX_DATABASE_CONNECTION.md for detailed instructions');
          } else {
            console.error('   💡 If using Render, ensure DATABASE_URL uses the External Database URL');
            console.error('   💡 The External URL includes the full hostname (e.g., .oregon-postgres.render.com)');
          }
        } else {
          console.error('   💡 Using External Database URL (not Internal) from Render Dashboard');
        }
      }
    }
  }
})();

// Create pool for tenantMiddleware (it needs direct pool access for RLS)
// But use DatabaseService for all other operations
// Enable SSL for production, staging, and any Render database URLs
const shouldUseSSL = process.env.NODE_ENV === 'production' ||
  process.env.NODE_ENV === 'staging' ||
  (process.env.DATABASE_URL && process.env.DATABASE_URL.includes('.render.com'));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: shouldUseSSL ? { rejectUnauthorized: false } : false,
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
    // Allow requests with no origin (like mobile apps, curl, or Electron file://)
    if (!origin) return callback(null, true);
    // Electron desktop app loads from file:// and sends origin "null"
    if (origin === 'null') return callback(null, true);

    // Check if origin is allowed
    const isAllowed = corsOrigins.includes('*') ||
      corsOrigins.includes(origin) ||
      origin.includes('onrender.com') || // Extra safety for staging/prod
      origin.includes('localhost');

    if (isAllowed) {
      callback(null, true);
    } else {
      console.warn(`⚠️ CORS blocked origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Tenant-ID', 'Accept', 'idempotency-key'],
  exposedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 86400 // 24 hours
}));
app.use(express.json({
  limit: '50mb',
  verify: (req, _res, buf) => {
    // Capture raw body for webhook signature verification (e.g. Paddle)
    (req as any).rawBody = buf;
  }
}));
app.use(express.urlencoded({
  extended: true,
  limit: '50mb',
  verify: (req, _res, buf) => {
    (req as any).rawBody = buf;
  }
}));

// Add request timeout middleware (30 seconds max)
// This prevents requests from hanging indefinitely
app.use(timeout('30s'));

// Timeout error handler - must be before route handlers
app.use((req, res, next) => {
  if (!(req as any).timedout) {
    next();
  }
});

// Track system metrics (request stats)
app.use(trackRequestMetrics);

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

// Schema version for client schema sync (optional; no auth required)
app.get('/api/schema/version', (req, res) => {
  res.json({ version: 1 });
});

// Public routes (no authentication required)
app.use('/api/app-info', appInfoRouter); // Version info (public)
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

// WhatsApp webhook endpoint (public, no auth required)
// Must be defined BEFORE tenantMiddleware to allow Meta callbacks
app.use('/api/whatsapp/webhook', whatsappWebhookRouter);

// Mock payment page (public route for testing)
// This serves an HTML page that simulates a payment gateway
app.get('/mock-payment', (req, res) => {
  try {
    console.log('💰 Mock payment route accessed:', {
      url: req.url,
      query: req.query,
      method: req.method
    });

    const { payment_intent, return_url } = req.query;

    if (!payment_intent || typeof payment_intent !== 'string') {
      console.error('Missing payment_intent in query:', req.query);
      return res.status(400).send(`
        <html>
          <head><title>Payment Error</title></head>
          <body style="font-family: Arial, sans-serif; padding: 40px; text-align: center;">
            <h1 style="color: #dc2626;">Payment Error</h1>
            <p>Invalid payment intent. Please try again.</p>
            <p style="font-size: 12px; color: #666;">Query: ${JSON.stringify(req.query)}</p>
          </body>
        </html>
      `);
    }

    // Get base URL for API calls
    // On Render, RENDER_EXTERNAL_URL is automatically available for the server URL
    const baseUrl = req.headers.origin || process.env.CLIENT_URL || 'http://localhost:5173';
    const apiUrl = process.env.API_URL ||
      process.env.SERVER_URL ||
      process.env.RENDER_EXTERNAL_URL ||
      'http://localhost:3000';

    // Decode return_url if it's URL encoded
    let returnUrl: string;
    if (return_url && typeof return_url === 'string') {
      try {
        returnUrl = decodeURIComponent(return_url);
      } catch (e) {
        returnUrl = return_url;
      }
    } else {
      returnUrl = `${baseUrl}/license/payment-success`;
    }

    // Serve mock payment page
    res.send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Mock Payment Gateway - PBooksPro</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
          }
          .container {
            background: white;
            border-radius: 16px;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
            max-width: 500px;
            width: 100%;
            padding: 40px;
            text-align: center;
          }
          .logo {
            font-size: 32px;
            font-weight: bold;
            color: #667eea;
            margin-bottom: 10px;
          }
          h1 {
            color: #1f2937;
            margin-bottom: 10px;
            font-size: 24px;
          }
          .subtitle {
            color: #6b7280;
            margin-bottom: 30px;
            font-size: 14px;
          }
          .payment-info {
            background: #f9fafb;
            border-radius: 8px;
            padding: 20px;
            margin-bottom: 30px;
            text-align: left;
          }
          .info-row {
            display: flex;
            justify-content: space-between;
            margin-bottom: 10px;
            font-size: 14px;
          }
          .info-label {
            color: #6b7280;
          }
          .info-value {
            color: #1f2937;
            font-weight: 600;
          }
          .card-form {
            text-align: left;
            margin-bottom: 30px;
          }
          .form-group {
            margin-bottom: 20px;
          }
          label {
            display: block;
            color: #374151;
            font-size: 14px;
            font-weight: 500;
            margin-bottom: 8px;
          }
          input {
            width: 100%;
            padding: 12px;
            border: 2px solid #e5e7eb;
            border-radius: 8px;
            font-size: 16px;
            transition: border-color 0.2s;
          }
          input:focus {
            outline: none;
            border-color: #667eea;
          }
          .card-row {
            display: grid;
            grid-template-columns: 2fr 1fr;
            gap: 15px;
          }
          .btn {
            width: 100%;
            padding: 14px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            border-radius: 8px;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            transition: transform 0.2s, box-shadow 0.2s;
            margin-bottom: 10px;
          }
          .btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 10px 20px rgba(102, 126, 234, 0.4);
          }
          .btn:active {
            transform: translateY(0);
          }
          .btn:disabled {
            opacity: 0.6;
            cursor: not-allowed;
            transform: none;
          }
          .btn-secondary {
            background: #6b7280;
          }
          .btn-secondary:hover {
            background: #4b5563;
          }
          .loading {
            display: none;
            margin-top: 20px;
          }
          .spinner {
            border: 3px solid #f3f4f6;
            border-top: 3px solid #667eea;
            border-radius: 50%;
            width: 40px;
            height: 40px;
            animation: spin 1s linear infinite;
            margin: 0 auto;
          }
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
          .success {
            display: none;
            color: #10b981;
            font-weight: 600;
            margin-top: 20px;
          }
          .error {
            display: none;
            color: #ef4444;
            background: #fef2f2;
            padding: 12px;
            border-radius: 8px;
            margin-top: 20px;
            font-size: 14px;
          }
          .note {
            background: #fef3c7;
            border-left: 4px solid #f59e0b;
            padding: 12px;
            border-radius: 4px;
            margin-top: 20px;
            font-size: 12px;
            color: #92400e;
            text-align: left;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="logo">PBooksPro</div>
          <h1>Mock Payment Gateway</h1>
          <p class="subtitle">Test payment processing (Development Only)</p>
          
          <div class="payment-info">
            <div class="info-row">
              <span class="info-label">Payment Intent:</span>
              <span class="info-value">${payment_intent}</span>
            </div>
          </div>

          <form id="paymentForm" class="card-form">
            <div class="form-group">
              <label>Card Number</label>
              <input type="text" id="cardNumber" value="4242 4242 4242 4242" placeholder="1234 5678 9012 3456" maxlength="19">
            </div>
            <div class="card-row">
              <div class="form-group">
                <label>Expiry Date</label>
                <input type="text" id="expiry" value="12/25" placeholder="MM/YY" maxlength="5">
              </div>
              <div class="form-group">
                <label>CVV</label>
                <input type="text" id="cvv" value="123" placeholder="123" maxlength="3">
              </div>
            </div>
            <div class="form-group">
              <label>Cardholder Name</label>
              <input type="text" id="cardName" value="Test User" placeholder="John Doe">
            </div>
            
            <button type="submit" class="btn" id="submitBtn">Process Payment</button>
            <button type="button" class="btn btn-secondary" onclick="window.location.href='${returnUrl}?canceled=true'">Cancel</button>
          </form>

          <div class="loading" id="loading">
            <div class="spinner"></div>
            <p style="margin-top: 10px; color: #6b7280;">Processing payment...</p>
          </div>

          <div class="success" id="success">
            ✓ Payment processed successfully! Redirecting...
          </div>

          <div class="error" id="error"></div>

          <div class="note">
            <strong>Note:</strong> This is a mock payment gateway for testing purposes only. No real payment will be processed.
          </div>
        </div>

          <script>
          const paymentIntent = '${payment_intent}';
          const returnUrl = '${returnUrl}';
          const apiUrl = '${apiUrl}';

          document.getElementById('paymentForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const submitBtn = document.getElementById('submitBtn');
            const loading = document.getElementById('loading');
            const success = document.getElementById('success');
            const error = document.getElementById('error');
            const form = document.getElementById('paymentForm');
            
            submitBtn.disabled = true;
            form.style.display = 'none';
            loading.style.display = 'block';
            success.style.display = 'none';
            error.style.display = 'none';

            try {
              // Wait for mock gateway auto-completion (default 3 seconds + 1 second processing)
              // The mock gateway automatically completes the payment after a delay
              await new Promise(resolve => setTimeout(resolve, 4000));

              // Payment should be auto-completed by mock gateway webhook
              // Just redirect to success page
              success.style.display = 'block';
              loading.style.display = 'none';
              
              // Redirect after a short delay
              setTimeout(() => {
                window.location.href = returnUrl + '?payment_intent=' + encodeURIComponent(paymentIntent) + '&status=success';
              }, 1500);
            } catch (err) {
              loading.style.display = 'none';
              error.style.display = 'block';
              error.textContent = 'Payment failed: ' + (err.message || 'Unknown error');
              form.style.display = 'block';
              submitBtn.disabled = false;
            }
          });

          // Format card number
          document.getElementById('cardNumber').addEventListener('input', (e) => {
            let value = e.target.value.replace(/\\s/g, '');
            let formatted = value.match(/.{1,4}/g)?.join(' ') || value;
            e.target.value = formatted;
          });

          // Format expiry
          document.getElementById('expiry').addEventListener('input', (e) => {
            let value = e.target.value.replace(/[^0-9]/g, '');
            if (value.length >= 2) {
              value = value.substring(0, 2) + '/' + value.substring(2, 4);
            }
            e.target.value = value;
          });

          // Only numbers for CVV
          document.getElementById('cvv').addEventListener('input', (e) => {
            e.target.value = e.target.value.replace(/[^0-9]/g, '');
          });
        </script>
      </body>
      </html>
    `);
  } catch (error: any) {
    console.error('❌ Mock payment page error:', error);
    console.error('Error stack:', error.stack);
    res.status(500).send(`
      <html>
        <head><title>Payment Error</title></head>
        <body style="font-family: Arial, sans-serif; padding: 40px; text-align: center;">
          <h1 style="color: #dc2626;">Payment Error</h1>
          <p>An error occurred while loading the payment page. Please try again.</p>
          ${process.env.NODE_ENV === 'development' ? `<pre style="text-align: left; background: #f5f5f5; padding: 10px; margin-top: 20px;">${error.message}\n${error.stack}</pre>` : ''}
        </body>
      </html>
    `);
  }
});

// Protected routes (tenant + license authentication required)
app.use('/api', tenantMiddleware(pool));

// Idempotency middleware: prevent duplicate processing of sync push operations (durable via PostgreSQL)
import { idempotencyMiddleware } from '../middleware/idempotencyMiddleware.js';
app.use('/api', idempotencyMiddleware(pool));

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

// License middleware - skip for license-status so the client can always load status (including expired)
app.use('/api', (req: any, res: Response, next: NextFunction) => {
  if (req.method === 'GET' && req.path === '/tenants/license-status') {
    return next();
  }
  return licenseMiddleware(pool)(req, res, next);
});

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
app.use('/api/plan-amenities', planAmenitiesRouter);
app.use('/api/installment-plans', installmentPlansRouter);
app.use('/api/rental-agreements', rentalAgreementsRouter);
app.use('/api/rental', rentalArRouter);
app.use('/api/project-agreements', projectAgreementsRouter);
app.use('/api/contracts', contractsRouter);
app.use('/api/sales-returns', salesReturnsRouter);
app.use('/api/users', usersRouter); // User management (for authenticated tenants)
app.use('/api/tenants', tenantRouter); // Tenant management (for authenticated tenants)
app.use('/api/transaction-audit', transactionAuditRouter); // Transaction audit logs
app.use('/api/quotations', quotationsRouter); // Quotations
app.use('/api/vendors', vendorsRouter); // Vendors
app.use('/api/documents', documentsRouter); // Documents
app.use('/api/recurring-invoice-templates', recurringInvoiceTemplatesRouter); // Recurring Invoice Templates
app.use('/api/error-log', errorLogRouter); // Error Log
app.use('/api/app-settings', appSettingsRouter); // App Settings
app.use('/api/pm-cycle-allocations', pmCycleAllocationsRouter); // PM Cycle Allocations
app.use('/api/data-management', dataManagementRouter); // Data Management (Admin only)
app.use('/api/data-import-export', dataImportExportRouter); // Data Import/Export
app.use('/api/whatsapp', whatsappRouter); // WhatsApp API (requires authentication)

app.use('/api/payroll', payrollRouter); // Payroll Management (requires authentication)
app.use('/api/state', stateChangesRouter); // Incremental sync: GET /api/state/changes?since=ISO8601 

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  // Log error with context
  console.error('❌ Unhandled error:', {
    error: err.message,
    code: err.code,
    path: req.path,
    method: req.method,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });

  // Handle specific error types
  if (err.code === 'ETIMEDOUT' || (req as any).timedout) {
    return res.status(504).json({
      error: 'Request timeout',
      message: 'The server took too long to process your request. Please try again.'
    });
  }

  // Don't send response if headers already sent
  if (res.headersSent) {
    return next(err);
  }

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

// Start session cleanup service
(async () => {
  try {
    const { startSessionCleanupService } = await import('../services/sessionCleanupService.js');
    startSessionCleanupService();
  } catch (error) {
    console.error('❌ Failed to start session cleanup service:', error);
    // Continue anyway - cleanup will still work on request basis
  }
})();

// Start server - listen on 0.0.0.0 so other PCs on the network can reach the API
const host = process.env.SERVER_HOST || '0.0.0.0';
httpServer.listen(port, host, () => {
  console.log(`🚀 API server running on http://${host}:${port}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔌 WebSocket server initialized`);
});

export default app;
