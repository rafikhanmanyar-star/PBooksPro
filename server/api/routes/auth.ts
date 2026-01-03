import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { getDatabaseService } from '../../services/databaseService.js';

const router = Router();
// Lazy initialization - get database service when needed, not at module load
const getDb = () => getDatabaseService();

// Login with tenant context
router.post('/login', async (req, res) => {
  try {
    const db = getDb();
    const { username, password, tenantId } = req.body;
    
    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant ID required' });
    }

    // Verify tenant exists and is active
    const tenants = await db.query(
      'SELECT * FROM tenants WHERE id = $1',
      [tenantId]
    );
    
    if (tenants.length === 0) {
      return res.status(403).json({ error: 'Invalid tenant' });
    }

    const tenant = tenants[0];

    // Find user within tenant
    const users = await db.query(
      'SELECT * FROM users WHERE username = $1 AND tenant_id = $2 AND is_active = TRUE',
      [username, tenantId]
    );
    
    if (users.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = users[0];
    
    // Verify password
    if (!user.password || !await bcrypt.compare(password, user.password)) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Update last login
    await getDb().query(
      'UPDATE users SET last_login = NOW() WHERE id = $1',
      [user.id]
    );

    // Generate JWT with tenant context
    const token = jwt.sign(
      { 
        userId: user.id, 
        username: user.username,
        tenantId: user.tenant_id,
        role: user.role
      },
      process.env.JWT_SECRET!,
      { expiresIn: '7d' }
    );

    res.json({ 
      token, 
      user: { 
        id: user.id, 
        username: user.username, 
        name: user.name, 
        role: user.role,
        tenantId: user.tenant_id
      },
      tenant: {
        id: tenant.id,
        name: tenant.name,
        companyName: tenant.company_name
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Public endpoint to lookup tenant by email or company name (for login)
router.post('/lookup-tenant', async (req, res) => {
  try {
    const { email, companyName } = req.body;
    
    if (!email && !companyName) {
      return res.status(400).json({ error: 'Email or company name required' });
    }

    const db = getDb();
    let query = 'SELECT id, name, company_name, email FROM tenants WHERE 1=1';
    const params: any[] = [];
    
    if (email) {
      query += ' AND email = $1';
      params.push(email);
    } else if (companyName) {
      query += ' AND (company_name ILIKE $1 OR name ILIKE $1)';
      params.push(`%${companyName}%`);
    }
    
    query += ' LIMIT 5';
    
    const tenants = await db.query(query, params);
    
    if (tenants.length === 0) {
      return res.status(404).json({ error: 'Tenant not found' });
    }
    
    res.json({ tenants });
  } catch (error) {
    console.error('Tenant lookup error:', error);
    res.status(500).json({ error: 'Lookup failed' });
  }
});

// Register new tenant (self-signup with free trial)
router.post('/register-tenant', async (req, res) => {
  try {
    const { 
      companyName, 
      email, 
      phone, 
      address,
      adminUsername, 
      adminPassword, 
      adminName 
    } = req.body;

    console.log('Registration request received:', {
      companyName,
      email,
      adminUsername,
      hasPassword: !!adminPassword,
      adminName
    });

    // Validate input
    if (!companyName || !email || !adminUsername || !adminPassword) {
      console.error('Missing required fields:', { companyName: !!companyName, email: !!email, adminUsername: !!adminUsername, adminPassword: !!adminPassword });
      return res.status(400).json({ 
        error: 'Missing required fields',
        message: 'Please provide company name, email, admin username, and admin password'
      });
    }

    const db = getDb();
    
    // Check if email already exists
    const existing = await db.query(
      'SELECT id FROM tenants WHERE email = $1',
      [email]
    );
    
    if (existing.length > 0) {
      return res.status(409).json({ 
        error: 'Email already registered',
        message: 'An account with this email already exists. Please use a different email or login.'
      });
    }

    // Import LicenseService
    const { LicenseService } = await import('../../services/licenseService.js');
    const licenseService = new LicenseService(db);

    // Create tenant with free trial
    let tenantId: string;
    let daysRemaining: number;
    try {
      const result = await licenseService.createTenantWithTrial({
        name: companyName,
        companyName,
        email,
        phone,
        address
      });
      tenantId = result.tenantId;
      daysRemaining = result.daysRemaining;
      console.log('Tenant created:', tenantId);
    } catch (licenseError: any) {
      console.error('Error creating tenant:', licenseError);
      return res.status(500).json({ 
        error: 'Failed to create tenant',
        message: licenseError.message || 'An error occurred while creating your account'
      });
    }

    // Create admin user
    try {
      const hashedPassword = await bcrypt.hash(adminPassword, 10);
      const userId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      await db.query(
        `INSERT INTO users (id, tenant_id, username, name, role, password, email)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [userId, tenantId, adminUsername, adminName || 'Administrator', 'Admin', hashedPassword, email]
      );
      console.log('Admin user created:', userId);
    } catch (userError: any) {
      console.error('Error creating admin user:', userError);
      // Try to clean up tenant if user creation fails
      try {
        await db.query('DELETE FROM tenants WHERE id = $1', [tenantId]);
      } catch (cleanupError) {
        console.error('Error cleaning up tenant:', cleanupError);
      }
      return res.status(500).json({ 
        error: 'Failed to create admin user',
        message: userError.message || 'An error occurred while creating your admin account'
      });
    }

    res.json({
      success: true,
      tenantId,
      message: 'Tenant registered successfully. Free 30-day trial started.',
      trialDaysRemaining: daysRemaining
    });
  } catch (error: any) {
    console.error('Tenant registration error:', error);
    res.status(500).json({ 
      error: 'Registration failed',
      message: error.message || 'An unexpected error occurred. Please try again.'
    });
  }
});

export default router;

