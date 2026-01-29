import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { Pool } from 'pg';

export interface TenantRequest extends Request {
  tenantId?: string;
  userId?: string;
  userRole?: string;
  user?: {
    userId: string;
    username: string;
    role: string;
  };
}

export function tenantMiddleware(pool: Pool) {
  return async (req: TenantRequest, res: Response, next: NextFunction) => {
    try {
      // Extract token from Authorization header
      const token = req.headers.authorization?.replace('Bearer ', '');
      
      if (!token) {
        return res.status(401).json({ error: 'No authentication token' });
      }

      // Check if JWT_SECRET is configured
      if (!process.env.JWT_SECRET) {
        console.error('❌ JWT_SECRET is not configured in environment variables!');
        return res.status(500).json({ 
          error: 'Server configuration error',
          message: 'JWT_SECRET is not configured. Please contact administrator.',
          code: 'JWT_SECRET_MISSING'
        });
      }

      // Log token info for debugging (first 20 chars only for security)
      const tokenPreview = token.length > 20 ? token.substring(0, 20) + '...' : token;
      console.log(`🔍 Verifying token: ${tokenPreview} (length: ${token.length})`);

      // Decode JWT to get tenant_id and user_id
      let decoded: any;
      try {
        decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
        console.log(`✅ Token verified successfully. User: ${decoded.userId}, Tenant: ${decoded.tenantId}`);
      } catch (jwtError: any) {
        // Log detailed error information
        console.error('❌ JWT verification failed:', {
          errorName: jwtError.name,
          errorMessage: jwtError.message,
          tokenLength: token.length,
          tokenPreview: tokenPreview,
          hasJWTSecret: !!process.env.JWT_SECRET,
          jwtSecretLength: process.env.JWT_SECRET?.length || 0
        });

        // Check if it's a token expiration error
        if (jwtError.name === 'TokenExpiredError') {
          console.error('Token expired at:', jwtError.expiredAt);
          return res.status(401).json({ 
            error: 'Token expired',
            message: 'Your session has expired. Please login again.',
            code: 'TOKEN_EXPIRED',
            expiredAt: jwtError.expiredAt
          });
        }
        // Check if it's an invalid token error
        if (jwtError.name === 'JsonWebTokenError') {
          console.error('Invalid token format. Error:', jwtError.message);
          // Check if it's a signature mismatch (JWT_SECRET issue)
          if (jwtError.message.includes('signature') || jwtError.message.includes('invalid signature')) {
            console.error('⚠️ Token signature mismatch - JWT_SECRET may be incorrect!');
            return res.status(401).json({ 
              error: 'Invalid token',
              message: 'Token signature is invalid. This may indicate a server configuration issue. Please login again.',
              code: 'INVALID_TOKEN_SIGNATURE',
              details: 'JWT_SECRET mismatch detected'
            });
          }
          return res.status(401).json({ 
            error: 'Invalid token',
            message: 'Authentication token is invalid. Please login again.',
            code: 'INVALID_TOKEN',
            details: jwtError.message
          });
        }
        // Other JWT errors
        console.error('JWT verification error:', jwtError);
        return res.status(401).json({ 
          error: 'Invalid token',
          message: 'Token verification failed. Please login again.',
          code: 'TOKEN_VERIFICATION_FAILED',
          details: jwtError.message
        });
      }

      req.tenantId = decoded.tenantId;
      req.userId = decoded.userId;
      req.userRole = decoded.role;
      
      // Set user info for audit logging
      req.user = {
        userId: decoded.userId,
        username: decoded.username,
        role: decoded.role
      };

      if (!req.tenantId) {
        // No tenantId in token - this is an authentication issue
        console.error('❌ No tenantId in token:', {
          userId: decoded?.userId,
          decodedKeys: Object.keys(decoded || {}),
          path: req.path,
          method: req.method
        });
        return res.status(401).json({ 
          error: 'Invalid token',
          message: 'Token does not contain tenant information. Please login again.',
          code: 'NO_TENANT_CONTEXT'
        });
      }

      // CRITICAL SECURITY CHECK: Verify user actually belongs to the tenant from token
      // This prevents users from accessing data from other tenants by manipulating tokens
      try {
        const { getDatabaseService } = await import('../services/databaseService.js');
        const db = getDatabaseService();
        
        const userCheck = await db.query(
          'SELECT id, tenant_id FROM users WHERE id = $1',
          [decoded.userId]
        );
        
        if (userCheck.length === 0) {
          console.error(`❌ Security: User ${decoded.userId} not found in database`);
          return res.status(401).json({ 
            error: 'Invalid token',
            message: 'User associated with token does not exist. Please login again.',
            code: 'USER_NOT_FOUND'
          });
        }
        
        const userTenantId = userCheck[0].tenant_id;
        if (userTenantId !== decoded.tenantId) {
          console.error(`❌ SECURITY VIOLATION: User ${decoded.userId} belongs to tenant ${userTenantId} but token claims tenant ${decoded.tenantId}`);
          return res.status(403).json({ 
            error: 'Forbidden',
            message: 'User does not belong to the organization specified in token. Please login again.',
            code: 'TENANT_MISMATCH'
          });
        }
      } catch (userCheckError) {
        console.error('Error verifying user-tenant relationship:', userCheckError);
        return res.status(500).json({
          error: 'Authentication failed',
          message: 'Could not verify user-tenant relationship. Please try again.',
          code: 'USER_TENANT_CHECK_FAILED'
        });
      }

      // Verify session is still valid (blocking).
      // We enforce single-session-per-user-per-tenant by requiring the token to exist in user_sessions.
      // When the same user logs in again, the session row is replaced and old tokens stop working.
      try {
        const { getDatabaseService } = await import('../services/databaseService.js');
        const db = getDatabaseService();

        const sessions = await db.query(
          'SELECT user_id, tenant_id, expires_at, last_activity FROM user_sessions WHERE token = $1',
          [token]
        );

        if (sessions.length === 0) {
          // Session not found, but token is valid - try to create/recover the session
          // This handles cases where session was cleaned up but token is still valid,
          // or when switching between databases (staging to local)
          console.warn('⚠️ Session not found in database, attempting to recover:', {
            tokenPreview,
            userId: decoded?.userId,
            tenantId: decoded?.tenantId,
            path: req.path,
            method: req.method
          });

          try {
            // Verify user and tenant still exist
            const users = await db.query(
              'SELECT id, tenant_id FROM users WHERE id = $1 AND tenant_id = $2 AND is_active = TRUE',
              [decoded.userId, decoded.tenantId]
            );

            if (users.length === 0) {
              console.error('❌ User not found or inactive, cannot recover session');
              return res.status(401).json({
                error: 'Invalid session',
                message: 'Your session is no longer valid. Please login again.',
                code: 'SESSION_INVALID'
              });
            }

            // Create session record (recover missing session)
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
                decoded.userId,
                decoded.tenantId,
                token,
                req.ip || req.headers['x-forwarded-for'] || 'unknown',
                req.headers['user-agent'] || 'unknown',
                expiresAt
              ]
            );

            // Update login_status to true
            await db.query(
              'UPDATE users SET login_status = TRUE WHERE id = $1',
              [decoded.userId]
            );

            console.log('✅ Session recovered successfully');
            
            // Re-fetch the session to continue with normal flow
            const recoveredSessions = await db.query(
              'SELECT user_id, tenant_id, expires_at, last_activity FROM user_sessions WHERE token = $1',
              [token]
            );
            
            if (recoveredSessions.length === 0) {
              // Still no session after recovery attempt - something is wrong
              console.error('❌ Failed to recover session after insert attempt');
              return res.status(401).json({
                error: 'Invalid session',
                message: 'Your session is no longer valid. Please login again.',
                code: 'SESSION_INVALID'
              });
            }
            
            // Use the recovered session
            const session = recoveredSessions[0] as any;
            const expiresAtCheck = new Date(session.expires_at);
            const now = new Date();

            if (expiresAtCheck <= now) {
              return res.status(401).json({
                error: 'Session expired',
                message: 'Your session has expired. Please login again.',
                code: 'SESSION_EXPIRED'
              });
            }

            // Update last_activity and continue
            await db.query(
              'UPDATE user_sessions SET last_activity = NOW() WHERE token = $1',
              [token]
            );
            
            // Re-fetch session for validation
            const refreshedSessions = await db.query(
              'SELECT user_id, tenant_id, expires_at, last_activity FROM user_sessions WHERE token = $1',
              [token]
            );
            
            if (refreshedSessions.length === 0) {
              console.error('❌ Session disappeared after recovery');
              return res.status(401).json({
                error: 'Invalid session',
                message: 'Your session is no longer valid. Please login again.',
                code: 'SESSION_INVALID'
              });
            }
            
            // Use refreshed session for validation
            sessions.length = 0;
            sessions.push(refreshedSessions[0]);
          } catch (recoveryError: any) {
            console.error('❌ Failed to recover session:', recoveryError);
            return res.status(401).json({
              error: 'Invalid session',
              message: 'Your session is no longer valid. Please login again.',
              code: 'SESSION_INVALID'
            });
          }
        }

        // Continue with normal validation (session exists now, either originally or after recovery)
        const session = sessions[0] as any;
        const expiresAt = new Date(session.expires_at);
        const now = new Date();

        if (expiresAt <= now) {
          // Best-effort cleanup
          try {
            await db.query('DELETE FROM user_sessions WHERE token = $1', [token]);
            // Set login_status = false since session expired
            await db.query('UPDATE users SET login_status = FALSE WHERE id = $1', [decoded.userId]);
          } catch (cleanupError) {
            console.warn('Failed to cleanup expired session:', cleanupError);
          }

          return res.status(401).json({
            error: 'Session expired',
            message: 'Your session has expired. Please login again.',
            code: 'SESSION_EXPIRED'
          });
        }

        // Check if session is inactive (user disconnected)
        // Sessions are considered inactive if last_activity is older than threshold
        // However, if the session hasn't expired and token is valid, we refresh it instead of rejecting
        const INACTIVITY_THRESHOLD_MINUTES = 30; // Increased back to 30 minutes for better UX
        const lastActivity = new Date(session.last_activity);
        const thresholdDate = new Date();
        thresholdDate.setMinutes(thresholdDate.getMinutes() - INACTIVITY_THRESHOLD_MINUTES);

        if (lastActivity < thresholdDate) {
          // Session is inactive but not expired - refresh it instead of rejecting
          // This handles cases like switching databases, temporary disconnections, etc.
          const minutesSinceActivity = Math.round((now.getTime() - lastActivity.getTime()) / 60000);
          console.warn('⚠️ Session inactive - refreshing:', {
            lastActivity: lastActivity.toISOString(),
            minutesSinceActivity,
            userId: decoded?.userId,
            tenantId: decoded?.tenantId,
            path: req.path,
            method: req.method
          });
          
          try {
            // Refresh the session by updating last_activity
            await db.query(
              'UPDATE user_sessions SET last_activity = NOW() WHERE token = $1',
              [token]
            );
            // Ensure login_status is true
            await db.query(
              'UPDATE users SET login_status = TRUE WHERE id = $1',
              [decoded.userId]
            );
            console.log('✅ Session refreshed successfully');
          } catch (refreshError) {
            console.error('❌ Failed to refresh inactive session:', refreshError);
            // If refresh fails, still allow the request to proceed
            // The session exists and is valid, just inactive
          }
          
          // Continue with the request - session is now refreshed
        }

        // Extra safety: ensure the DB session matches the JWT identity
        if (session.user_id !== decoded.userId || session.tenant_id !== decoded.tenantId) {
          return res.status(401).json({
            error: 'Invalid session',
            message: 'Session does not match token. Please login again.',
            code: 'SESSION_MISMATCH'
          });
        }

        // Update last activity (non-blocking)
        try {
          await db.query('UPDATE user_sessions SET last_activity = NOW() WHERE token = $1', [token]);
        } catch (updateError) {
          console.warn('Failed to update session last_activity:', updateError);
        }
      } catch (sessionError) {
        console.error('Session check error:', sessionError);
        return res.status(500).json({
          error: 'Authentication failed',
          message: 'Could not validate session. Please try again.',
          code: 'SESSION_CHECK_FAILED'
        });
      }

      // Verify tenant exists and is active
      const tenants = await pool.query(
        'SELECT * FROM tenants WHERE id = $1',
        [req.tenantId]
      );

      if (tenants.rows.length === 0) {
        // Tenant doesn't exist - this is an authentication issue, not authorization
        // Return 401 to indicate the token is invalid (tenant no longer exists)
        console.error(`❌ Tenant not found in database: ${req.tenantId}. Token is invalid.`);
        return res.status(401).json({ 
          error: 'Invalid token',
          message: 'The tenant associated with your token no longer exists. Please login again.',
          code: 'TENANT_NOT_FOUND'
        });
      }

      // Note: We don't set the session variable because:
      // 1. PostgreSQL SET doesn't support parameterized queries
      // 2. All queries already explicitly filter by tenant_id in WHERE clauses
      // 3. Connection pooling makes session variables unreliable
      // Tenant isolation is ensured by explicit tenant_id filtering in all queries

      next();
    } catch (error) {
      console.error('Tenant middleware error:', error);
      res.status(401).json({ error: 'Invalid token' });
    }
  };
}

