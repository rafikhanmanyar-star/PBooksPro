import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { getDatabaseService } from '../../../services/databaseService.js';

const router = Router();
const getDb = () => getDatabaseService();

// Admin login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    // Validate required environment variables
    if (!process.env.JWT_SECRET) {
      console.error('❌ JWT_SECRET environment variable is not set');
      return res.status(500).json({ 
        error: 'Server configuration error',
        message: 'JWT_SECRET is not configured'
      });
    }

    // Check database connection
    let db;
    try {
      db = getDb();
    } catch (dbError: any) {
      console.error('❌ Database service initialization failed:', dbError);
      return res.status(500).json({ 
        error: 'Database connection error',
        message: dbError?.message || 'Failed to connect to database'
      });
    }

    // Find admin user
    let admins;
    try {
      admins = await db.query(
        'SELECT * FROM admin_users WHERE username = $1 AND is_active = TRUE',
        [username]
      );
    } catch (queryError: any) {
      console.error('❌ Database query error:', queryError);
      // Check if table doesn't exist
      if (queryError?.message?.includes('relation "admin_users" does not exist') || 
          queryError?.code === '42P01') {
        return res.status(500).json({ 
          error: 'Database schema error',
          message: 'admin_users table does not exist. Please run database migrations.'
        });
      }
      throw queryError;
    }

    if (admins.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const admin = admins[0];

    // Check if admin has a password
    if (!admin.password) {
      console.error('❌ Admin user has no password set:', { username, id: admin.id });
      return res.status(500).json({ 
        error: 'Admin account error',
        message: 'Admin account is not properly configured'
      });
    }

    // Verify password
    let passwordValid;
    try {
      passwordValid = await bcrypt.compare(password, admin.password);
    } catch (bcryptError: any) {
      console.error('❌ Password comparison error:', bcryptError);
      return res.status(500).json({ 
        error: 'Authentication error',
        message: 'Failed to verify password'
      });
    }

    if (!passwordValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Update last login
    try {
      await db.query(
        'UPDATE admin_users SET last_login = NOW() WHERE id = $1',
        [admin.id]
      );
    } catch (updateError: any) {
      console.error('⚠️ Failed to update last_login (non-critical):', updateError);
      // Continue even if update fails
    }

    // Generate JWT
    let token;
    try {
      token = jwt.sign(
        {
          adminId: admin.id,
          username: admin.username,
          role: admin.role
        },
        process.env.JWT_SECRET,
        { expiresIn: '24h' }
      );
    } catch (jwtError: any) {
      console.error('❌ JWT generation error:', jwtError);
      return res.status(500).json({ 
        error: 'Token generation error',
        message: 'Failed to generate authentication token'
      });
    }

    res.json({
      token,
      admin: {
        id: admin.id,
        username: admin.username,
        name: admin.name,
        email: admin.email,
        role: admin.role
      }
    });
  } catch (error: any) {
    console.error('❌ Admin login error:', error);
    console.error('Error details:', {
      message: error?.message,
      stack: error?.stack,
      code: error?.code,
      detail: error?.detail,
      name: error?.name
    });
    
    // Provide more helpful error messages
    let errorMessage = error?.message || 'Unknown error';
    let errorCode = 'INTERNAL_ERROR';
    
    if (error?.code === 'ENOTFOUND' || error?.message?.includes('getaddrinfo')) {
      errorMessage = 'Database connection failed. Please check DATABASE_URL configuration.';
      errorCode = 'DATABASE_CONNECTION_ERROR';
    } else if (error?.code === '42P01' || error?.message?.includes('does not exist')) {
      errorMessage = 'Database table does not exist. Please run migrations.';
      errorCode = 'SCHEMA_ERROR';
    } else if (error?.message?.includes('JWT_SECRET')) {
      errorMessage = 'Server configuration error: JWT_SECRET is not set';
      errorCode = 'CONFIG_ERROR';
    }
    
    res.status(500).json({ 
      error: 'Login failed',
      message: errorMessage,
      code: errorCode,
      // Include stack trace in non-production for debugging
      ...(process.env.NODE_ENV !== 'production' && { 
        details: error?.stack,
        fullError: {
          name: error?.name,
          code: error?.code,
          detail: error?.detail
        }
      })
    });
  }
});

// Get current admin (requires authentication - handled by middleware in index.ts)
router.get('/me', async (req, res) => {
  try {
    const adminId = (req as any).adminId;
    const admins = await getDb().query(
      'SELECT id, username, name, email, role, last_login FROM admin_users WHERE id = $1',
      [adminId]
    );

    if (admins.length === 0) {
      return res.status(404).json({ error: 'Admin not found' });
    }

    res.json(admins[0]);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch admin info' });
  }
});

export default router;

