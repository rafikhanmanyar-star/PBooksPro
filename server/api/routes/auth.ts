import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { getDatabaseService } from '../../services/databaseService.js';

const router = Router();
// Lazy initialization - get database service when needed, not at module load
const getDb = () => getDatabaseService();

// Simple rate limiting map (in production, use Redis or proper rate limiting middleware)
const lookupRateLimit = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 5;

// Lookup tenants by organization email (Step 1 of login flow)
router.post('/lookup-tenants', async (req, res) => {
  try {
    // Check database connection first
    let db;
    try {
      db = getDb();
    } catch (dbError: any) {
      console.error('❌ [API] Failed to get database service:', {
        message: dbError?.message || String(dbError),
        code: dbError?.code,
        stack: dbError?.stack
      });
      return res.status(500).json({ 
        error: 'Database connection failed',
        message: 'Unable to connect to database. Please check server configuration.',
        code: 'DATABASE_CONNECTION_ERROR'
      });
    }

    const { organizationEmail } = req.body;
    
    if (!organizationEmail) {
      return res.status(400).json({ error: 'Organization email is required' });
    }

    // Basic email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(organizationEmail)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    // Rate limiting - prevent email enumeration attacks
    const clientIp = req.ip || req.headers['x-forwarded-for'] || 'unknown';
    const now = Date.now();
    const rateLimitKey = `lookup_${clientIp}`;
    const rateLimit = lookupRateLimit.get(rateLimitKey);

    if (rateLimit && rateLimit.resetAt > now) {
      if (rateLimit.count >= RATE_LIMIT_MAX_REQUESTS) {
        return res.status(429).json({ 
          error: 'Too many requests', 
          message: 'Please wait a moment before trying again.' 
        });
      }
      rateLimit.count++;
    } else {
      lookupRateLimit.set(rateLimitKey, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    }

    // Clean up old rate limit entries periodically
    if (Math.random() < 0.1) { // 10% chance to cleanup
      for (const [key, value] of lookupRateLimit.entries()) {
        if (value.resetAt <= now) {
          lookupRateLimit.delete(key);
        }
      }
    }

    // Lookup tenants by email (case-insensitive)
    let tenants;
    try {
      tenants = await db.query(
        'SELECT id, name, company_name, email FROM tenants WHERE LOWER(email) = LOWER($1)',
        [organizationEmail]
      );
    } catch (queryError: any) {
      console.error('❌ [API] Database query error in lookup-tenants:', {
        message: queryError?.message || String(queryError),
        code: queryError?.code,
        detail: queryError?.detail,
        hint: queryError?.hint,
        stack: queryError?.stack
      });
      return res.status(500).json({ 
        error: 'Database query failed',
        message: 'An error occurred while querying the database. Please try again.',
        code: 'DATABASE_QUERY_ERROR'
      });
    }

    // Return empty array if no match (don't reveal if email exists for security)
    // Only return safe fields (no license info, settings, etc.)
    res.json({
      tenants: tenants.map(t => ({
        id: t.id,
        name: t.name,
        company_name: t.company_name,
        email: t.email
      }))
    });
  } catch (error: any) {
    // Log detailed error information
    console.error('❌ [API] Error response for /auth/lookup-tenants:', {
      message: error?.message || String(error),
      code: error?.code,
      name: error?.name,
      stack: error?.stack,
      detail: error?.detail,
      hint: error?.hint
    });
    
    // Return properly formatted error response
    res.status(500).json({ 
      error: 'Lookup failed',
      message: error?.message || 'An error occurred while looking up organizations. Please try again.',
      code: error?.code || 'UNKNOWN_ERROR'
    });
  }
});

// Smart login - requires tenantId (Step 2 of login flow)
router.post('/smart-login', async (req, res) => {
  try {
    const db = getDb();
    const { username, password, tenantId } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant ID is required. Please select an organization first.' });
    }

    console.log('🔐 Smart login attempt:', { username: username.substring(0, 10) + '...', hasPassword: !!password, tenantId });

    // Verify tenant exists
    const tenants = await db.query(
      'SELECT * FROM tenants WHERE id = $1',
      [tenantId]
    );
    
    if (tenants.length === 0) {
      return res.status(401).json({ 
        error: 'Invalid tenant',
        message: 'The selected organization does not exist. Please try again.'
      });
    }

    const tenant = tenants[0];
    
    // Find user within tenant (case-insensitive username comparison)
    const allUsers = await db.query(
      'SELECT * FROM users WHERE LOWER(username) = LOWER($1) AND tenant_id = $2',
      [username, tenantId]
    );
    
    if (allUsers.length === 0) {
      console.log('❌ Smart login: User not found:', { username, tenantId });
      return res.status(401).json({ error: 'Invalid credentials', message: 'User not found' });
    }
    
    // Check if user is active
    const users = allUsers.filter(u => u.is_active === true || u.is_active === null);
    
    if (users.length === 0) {
      console.log('❌ Smart login: User is inactive:', { username, tenantId, is_active: allUsers[0]?.is_active });
      return res.status(403).json({ error: 'Account disabled', message: 'Your account has been disabled. Please contact your administrator.' });
    }

    const user = users[0];

    // Verify password
    if (!user.password || !await bcrypt.compare(password, user.password)) {
      return res.status(401).json({ error: 'Invalid credentials', message: 'Incorrect password' });
    }

    // Check login_status flag - primary check for duplicate logins
    const userStatus = await db.query(
      'SELECT login_status FROM users WHERE id = $1',
      [user.id]
    );

    if (userStatus.length > 0 && userStatus[0].login_status === true) {
      // User is already logged in - check if session is stale
      const STALE_SESSION_THRESHOLD_MINUTES = 5;
      const activeSessions = await db.query(
        `SELECT id, last_activity FROM user_sessions
         WHERE user_id = $1 AND tenant_id = $2 AND expires_at > NOW()
         LIMIT 1`,
        [user.id, user.tenant_id]
      );

      if (activeSessions.length > 0) {
        const session = activeSessions[0] as any;
        const lastActivity = new Date(session.last_activity);
        const thresholdDate = new Date();
        thresholdDate.setMinutes(thresholdDate.getMinutes() - STALE_SESSION_THRESHOLD_MINUTES);

        // If session is stale (likely from improper app closure), cleanup and allow login
        if (lastActivity < thresholdDate) {
          console.log(`🧹 Cleaning up stale session (last activity: ${lastActivity.toISOString()})`);
          await db.query(
            'DELETE FROM user_sessions WHERE user_id = $1 AND tenant_id = $2',
            [user.id, user.tenant_id]
          );
          // Reset login_status flag since session was stale
          await db.query(
            'UPDATE users SET login_status = FALSE WHERE id = $1',
            [user.id]
          );
          // Continue with login - session was cleaned up
        } else {
          // Session is still active (recent activity) - user is truly logged in
          return res.status(409).json({
            error: 'User is already logged in. Please logout first.',
            message: 'This account is already logged in for this organization. Please logout from the other session/device and try again.',
            code: 'ALREADY_LOGGED_IN'
          });
        }
      } else {
        // login_status is true but no active session - reset flag (orphaned state)
        console.log(`🧹 Resetting orphaned login_status for user ${user.id}`);
        await db.query(
          'UPDATE users SET login_status = FALSE WHERE id = $1',
          [user.id]
        );
        // Continue with login
      }
    }

    // Update last login and set login_status = true
    await db.query(
      'UPDATE users SET last_login = NOW(), login_status = TRUE WHERE id = $1',
      [user.id]
    );

    // Generate JWT with tenant context
    // Increased expiration to 30 days to prevent premature expiration
    const expiresIn = '30d';
    const token = jwt.sign(
      { 
        userId: user.id, 
        username: user.username,
        tenantId: user.tenant_id,
        role: user.role
      },
      process.env.JWT_SECRET!,
      { expiresIn }
    );

    // Create session record (1 row per user+tenant). We use UPSERT to handle stale/expired rows.
    // Session expiration matches JWT expiration (30 days).
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30); // 30 days to match JWT expiration

    await db.query(
      `INSERT INTO user_sessions (id, user_id, tenant_id, token, ip_address, user_agent, expires_at, last_activity)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       ON CONFLICT (user_id, tenant_id)
       DO UPDATE SET
         token = EXCLUDED.token,
         ip_address = EXCLUDED.ip_address,
         user_agent = EXCLUDED.user_agent,
         expires_at = EXCLUDED.expires_at,
         last_activity = NOW()`,
      [
        sessionId,
        user.id,
        user.tenant_id,
        token,
        req.ip || req.headers['x-forwarded-for'] || 'unknown',
        req.headers['user-agent'] || 'unknown',
        expiresAt
      ]
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
  } catch (error: any) {
    console.error('❌ Smart login error:', {
      error: error,
      message: error?.message,
      stack: error?.stack,
      code: error?.code,
      detail: error?.detail
    });

    // Check for database connection errors
    const isDatabaseError = error?.code === 'ENOTFOUND' || 
                            error?.code === 'ECONNREFUSED' || 
                            error?.code === 'ETIMEDOUT' ||
                            error?.message?.includes('getaddrinfo') ||
                            error?.message?.includes('ENOTFOUND');

    if (isDatabaseError) {
      const dbUrl = process.env.DATABASE_URL || '';
      const isInternalUrl = dbUrl.includes('@dpg-') && !dbUrl.includes('.render.com');
      
      let errorMessage = 'Database connection failed. ';
      if (isInternalUrl) {
        errorMessage += 'The database URL appears to be an internal URL. Please use the External Database URL from Render Dashboard.';
      } else {
        errorMessage += 'Please check your database connection settings.';
      }
      
      return res.status(500).json({ 
        error: 'Login failed',
        message: errorMessage,
        hint: 'If using Render, ensure DATABASE_URL uses the External Database URL (with full hostname like dpg-xxx-a.region-postgres.render.com)'
      });
    }

    res.status(500).json({ 
      error: 'Login failed',
      message: error?.message || 'An error occurred during login. Please try again.'
    });
  }
});

// Login with tenant context (legacy - kept for backward compatibility)
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
      // Tenant doesn't exist - return 401 to indicate authentication failure
      return res.status(401).json({ 
        error: 'Invalid tenant',
        message: 'The specified tenant does not exist. Please check your tenant ID and try again.'
      });
    }

    const tenant = tenants[0];

    // Find user within tenant (check all users first, then filter active)
    // Use case-insensitive comparison for username
    const allUsers = await db.query(
      'SELECT * FROM users WHERE LOWER(username) = LOWER($1) AND tenant_id = $2',
      [username, tenantId]
    );
    
    if (allUsers.length === 0) {
      console.log('❌ Login: User not found:', { username, tenantId });
      return res.status(401).json({ error: 'Invalid credentials', message: 'User not found' });
    }
    
    // Filter for active users (is_active = TRUE or NULL)
    const users = allUsers.filter((u: any) => u.is_active === true || u.is_active === null);
    
    if (users.length === 0) {
      console.log('❌ Login: User is inactive:', { username, tenantId, is_active: allUsers[0]?.is_active });
      return res.status(403).json({ error: 'Account disabled', message: 'Your account has been disabled. Please contact your administrator.' });
    }

    const user = users[0];
    
    // Verify password
    if (!user.password) {
      console.log('❌ Login: User has no password set:', { userId: user.id, username: user.username });
      return res.status(401).json({ error: 'Invalid credentials', message: 'Password not set for this user' });
    }
    
    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      console.log('❌ Login: Password mismatch:', { userId: user.id, username: user.username });
      return res.status(401).json({ error: 'Invalid credentials', message: 'Incorrect password' });
    }
    
    console.log('✅ Login: Password verified for user:', { userId: user.id, username: user.username, role: user.role });

    // Check login_status flag - primary check for duplicate logins
    const userStatus = await db.query(
      'SELECT login_status FROM users WHERE id = $1',
      [user.id]
    );

    if (userStatus.length > 0 && userStatus[0].login_status === true) {
      // User is already logged in - check if session is stale
      const STALE_SESSION_THRESHOLD_MINUTES = 5;
      const activeSessions = await db.query(
        `SELECT id, last_activity FROM user_sessions
         WHERE user_id = $1 AND tenant_id = $2 AND expires_at > NOW()
         LIMIT 1`,
        [user.id, user.tenant_id]
      );

      if (activeSessions.length > 0) {
        const session = activeSessions[0] as any;
        const lastActivity = new Date(session.last_activity);
        const thresholdDate = new Date();
        thresholdDate.setMinutes(thresholdDate.getMinutes() - STALE_SESSION_THRESHOLD_MINUTES);

        // If session is stale (likely from improper app closure), cleanup and allow login
        if (lastActivity < thresholdDate) {
          console.log(`🧹 Cleaning up stale session (last activity: ${lastActivity.toISOString()})`);
          await db.query(
            'DELETE FROM user_sessions WHERE user_id = $1 AND tenant_id = $2',
            [user.id, user.tenant_id]
          );
          // Reset login_status flag since session was stale
          await db.query(
            'UPDATE users SET login_status = FALSE WHERE id = $1',
            [user.id]
          );
          // Continue with login - session was cleaned up
        } else {
          // Session is still active (recent activity) - user is truly logged in
          return res.status(409).json({
            error: 'User is already logged in. Please logout first.',
            message: 'This account is already logged in for this organization. Please logout from the other session/device and try again.',
            code: 'ALREADY_LOGGED_IN'
          });
        }
      } else {
        // login_status is true but no active session - reset flag (orphaned state)
        console.log(`🧹 Resetting orphaned login_status for user ${user.id}`);
        await db.query(
          'UPDATE users SET login_status = FALSE WHERE id = $1',
          [user.id]
        );
        // Continue with login
      }
    }

    // Update last login and set login_status = true
    await db.query(
      'UPDATE users SET last_login = NOW(), login_status = TRUE WHERE id = $1',
      [user.id]
    );

    // Generate JWT with tenant context
    // Increased expiration to 30 days to prevent premature expiration
    const expiresIn = '30d';
    const token = jwt.sign(
      { 
        userId: user.id, 
        username: user.username,
        tenantId: user.tenant_id,
        role: user.role
      },
      process.env.JWT_SECRET!,
      { expiresIn }
    );

    // Create session record (1 row per user+tenant). We use UPSERT to handle stale/expired rows.
    // Session expiration matches JWT expiration (30 days).
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30); // 30 days to match JWT expiration

    await db.query(
      `INSERT INTO user_sessions (id, user_id, tenant_id, token, ip_address, user_agent, expires_at, last_activity)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       ON CONFLICT (user_id, tenant_id)
       DO UPDATE SET
         token = EXCLUDED.token,
         ip_address = EXCLUDED.ip_address,
         user_agent = EXCLUDED.user_agent,
         expires_at = EXCLUDED.expires_at,
         last_activity = NOW()`,
      [
        sessionId,
        user.id,
        user.tenant_id,
        token,
        req.ip || req.headers['x-forwarded-for'] || 'unknown',
        req.headers['user-agent'] || 'unknown',
        expiresAt
      ]
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

// Refresh token endpoint
router.post('/refresh-token', async (req, res) => {
  try {
    const db = getDb();
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No authentication token' });
    }
    
    const oldToken = authHeader.substring(7);
    
    try {
      // Session must exist and be unexpired (blocking).
      // This keeps refresh aligned with tenantMiddleware which requires user_sessions.
      const sessions = await db.query(
        'SELECT user_id, tenant_id, expires_at FROM user_sessions WHERE token = $1',
        [oldToken]
      );

      if (sessions.length === 0) {
        return res.status(401).json({
          error: 'Invalid session',
          message: 'Your session is no longer valid. Please login again.',
          code: 'SESSION_INVALID'
        });
      }

      const session = sessions[0] as any;
      const sessionExpiresAt = new Date(session.expires_at);
      if (sessionExpiresAt <= new Date()) {
        // Best-effort cleanup
        try {
          await db.query('DELETE FROM user_sessions WHERE token = $1', [oldToken]);
        } catch (cleanupError) {
          console.warn('Failed to cleanup expired session during refresh:', cleanupError);
        }

        return res.status(401).json({
          error: 'Session expired',
          message: 'Your session has expired. Please login again.',
          code: 'SESSION_EXPIRED'
        });
      }

      // Verify old token (allow expired tokens for refresh)
      let decoded: any;
      try {
        decoded = jwt.verify(oldToken, process.env.JWT_SECRET!) as any;
      } catch (jwtError: any) {
        // If token is expired, try to decode without verification to get user info
        if (jwtError.name === 'TokenExpiredError') {
          decoded = jwt.decode(oldToken) as any;
          if (!decoded) {
            return res.status(401).json({ error: 'Invalid token' });
          }
        } else {
          return res.status(401).json({ error: 'Invalid token' });
        }
      }

      // Extra safety: session must match token identity
      if (session.user_id !== decoded.userId || session.tenant_id !== decoded.tenantId) {
        return res.status(401).json({
          error: 'Invalid session',
          message: 'Session does not match token. Please login again.',
          code: 'SESSION_MISMATCH'
        });
      }
      
      // Verify user still exists and is active
      const users = await db.query(
        'SELECT * FROM users WHERE id = $1 AND tenant_id = $2 AND is_active = TRUE',
        [decoded.userId, decoded.tenantId]
      );
      
      if (users.length === 0) {
        return res.status(401).json({ error: 'User not found or inactive' });
      }
      
      const user = users[0];
      
      // Verify tenant exists
      const tenants = await db.query(
        'SELECT * FROM tenants WHERE id = $1',
        [decoded.tenantId]
      );
      
      if (tenants.length === 0) {
        // Tenant doesn't exist - token is invalid, user needs to re-login
        // Return 401 instead of 403 to indicate authentication failure
        return res.status(401).json({ 
          error: 'Invalid token', 
          message: 'The tenant associated with your token no longer exists. Please login again.' 
        });
      }
      
      // Generate new token with same expiration (30 days)
      const expiresIn = '30d';
      const newToken = jwt.sign(
        { 
          userId: user.id, 
          username: user.username,
          tenantId: user.tenant_id,
          role: user.role
        },
        process.env.JWT_SECRET!,
        { expiresIn }
      );
      
      // Update session with new token
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);
      
      const updated = await db.query(
        `UPDATE user_sessions 
         SET token = $1, expires_at = $2, last_activity = NOW() 
         WHERE token = $3
         RETURNING id`,
        [newToken, expiresAt, oldToken]
      );

      if (updated.length === 0) {
        return res.status(401).json({
          error: 'Invalid session',
          message: 'Your session is no longer valid. Please login again.',
          code: 'SESSION_INVALID'
        });
      }
      
      res.json({ 
        token: newToken,
        expiresIn: expiresIn
      });
    } catch (error: any) {
      console.error('Token refresh error:', error);
      res.status(401).json({ error: 'Token refresh failed', message: error.message });
    }
  } catch (error: any) {
    console.error('Refresh token error:', error);
    res.status(500).json({ error: 'Token refresh failed' });
  }
});

// Logout endpoint
router.post('/logout', async (req, res) => {
  try {
    const db = getDb();
    const authHeader = req.headers.authorization;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
        
        // Delete session by token or by user_id + tenant_id (more reliable)
        await db.query(
          'DELETE FROM user_sessions WHERE token = $1 OR (user_id = $2 AND tenant_id = $3)',
          [token, decoded.userId, decoded.tenantId]
        );
        
        // Set login_status = false
        await db.query(
          'UPDATE users SET login_status = FALSE WHERE id = $1',
          [decoded.userId]
        );
        
        res.json({ success: true, message: 'Logged out successfully' });
      } catch (jwtError) {
        // Token invalid, but still return success
        res.json({ success: true, message: 'Logged out successfully' });
      }
    } else {
      res.json({ success: true, message: 'Logged out successfully' });
    }
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Logout failed' });
  }
});

// Heartbeat endpoint - updates session last_activity to keep session alive
router.post('/heartbeat', async (req, res) => {
  try {
    const db = getDb();
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No authentication token' });
    }
    
    const token = authHeader.substring(7);
    
    try {
      // Verify token is valid
      const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
      
      // Check if session exists first
      const sessionCheck = await db.query(
        'SELECT id FROM user_sessions WHERE token = $1 AND user_id = $2 AND tenant_id = $3',
        [token, decoded.userId, decoded.tenantId]
      );
      
      // If session doesn't exist, try to create it (might be a race condition after login)
      if (!sessionCheck || sessionCheck.length === 0) {
        // Try to create the session if it doesn't exist (handles race condition after login)
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 30); // 30 days to match JWT expiration
        
        const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        try {
          await db.query(
            `INSERT INTO user_sessions (id, user_id, tenant_id, token, ip_address, user_agent, expires_at, last_activity)
             VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
             ON CONFLICT (user_id, tenant_id)
             DO UPDATE SET
               token = EXCLUDED.token,
               expires_at = EXCLUDED.expires_at,
               last_activity = NOW()`,
            [
              sessionId,
              decoded.userId,
              decoded.tenantId,
              token,
              req.ip || req.headers['x-forwarded-for'] || 'unknown',
              req.headers['user-agent'] || 'unknown',
              expiresAt
            ]
          );
        } catch (insertError) {
          // If insert fails, session might have been created by another request
          // Try to update it one more time
          const retryCheck = await db.query(
            'SELECT id FROM user_sessions WHERE token = $1 AND user_id = $2 AND tenant_id = $3',
            [token, decoded.userId, decoded.tenantId]
          );
          
          if (!retryCheck || retryCheck.length === 0) {
            // Session truly doesn't exist - return error
            return res.status(401).json({ 
              error: 'Session not found',
              code: 'SESSION_NOT_FOUND'
            });
          }
        }
      } else {
        // Session exists - update last_activity
        await db.query(
          'UPDATE user_sessions SET last_activity = NOW() WHERE token = $1 AND user_id = $2 AND tenant_id = $3',
          [token, decoded.userId, decoded.tenantId]
        );
      }
      
      // Ensure login_status is true (maintain login status during heartbeat)
      await db.query(
        'UPDATE users SET login_status = TRUE WHERE id = $1',
        [decoded.userId]
      );
      
      res.json({ success: true, message: 'Heartbeat received' });
    } catch (jwtError) {
      return res.status(401).json({ 
        error: 'Invalid token',
        code: 'INVALID_TOKEN'
      });
    }
  } catch (error) {
    console.error('Heartbeat error:', error);
    res.status(500).json({ error: 'Heartbeat failed' });
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
    
    // Check if organization already exists (by email OR company_name)
    // Prevent re-registration of organizations
    const existingByEmail = await db.query(
      'SELECT id, company_name FROM tenants WHERE email = $1',
      [email]
    );
    
    if (existingByEmail.length > 0) {
      return res.status(409).json({ 
        error: 'Organization already registered',
        message: 'An organization with this email already exists. This organization has already been registered. Please login instead.'
      });
    }
    
    // Check if company name already exists
    const existingByCompany = await db.query(
      'SELECT id, email FROM tenants WHERE LOWER(company_name) = LOWER($1) OR LOWER(name) = LOWER($1)',
      [companyName]
    );
    
    if (existingByCompany.length > 0) {
      return res.status(409).json({ 
        error: 'Organization already registered',
        message: 'An organization with this company name already exists. This organization has already been registered. Please login instead.'
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
      // Safety check: Ensure no admin user already exists for this tenant
      // (This shouldn't happen since we prevent re-registration, but check for safety)
      const existingAdmin = await db.query(
        'SELECT id FROM users WHERE tenant_id = $1 AND role = $2',
        [tenantId, 'Admin']
      );
      
      if (existingAdmin.length > 0) {
        // Admin already exists - this shouldn't happen, but if it does, clean up tenant and reject
        await db.query('DELETE FROM tenants WHERE id = $1', [tenantId]);
        return res.status(409).json({
          error: 'Admin user already exists',
          message: 'This organization already has an admin user. Registration cannot be completed.'
        });
      }
      
      // Check user limit (skip for first user during registration)
      const tenantInfo = await db.query(
        'SELECT max_users FROM tenants WHERE id = $1',
        [tenantId]
      );
      const maxUsers = tenantInfo[0]?.max_users || 5;
      
      const userCountResult = await db.query(
        'SELECT COUNT(*) as count FROM users WHERE tenant_id = $1',
        [tenantId]
      );
      const currentUserCount = parseInt(userCountResult[0]?.count || '0');
      
      // During registration, we're creating the first user, so this should always pass
      // But we check anyway for safety
      if (currentUserCount >= maxUsers) {
        return res.status(403).json({
          error: 'User limit reached',
          message: `This organization has reached its maximum user limit of ${maxUsers}. Please contact support to increase the limit.`
        });
      }
      
      const hashedPassword = await bcrypt.hash(adminPassword, 10);
      const userId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Create the admin user (only one admin per organization)
      // Explicitly set is_active = TRUE to ensure user can login
      await db.query(
        `INSERT INTO users (id, tenant_id, username, name, role, password, email, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [userId, tenantId, adminUsername, adminName || 'Administrator', 'Admin', hashedPassword, email, true]
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

    // Initialize system accounts and categories for the new tenant
    try {
      const { TenantInitializationService } = await import('../../services/tenantInitializationService.js');
      const initService = new TenantInitializationService(db);
      const initResult = await initService.initializeSystemData(tenantId);
      console.log(`✅ System data initialized for tenant ${tenantId}: ${initResult.accountsCreated} accounts, ${initResult.categoriesCreated} categories`);
    } catch (initError: any) {
      console.error('Error initializing system data:', initError);
      // Don't fail registration if initialization fails - it can be retried later
      // The ensure methods in accounts/categories routes will create them on-demand
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

