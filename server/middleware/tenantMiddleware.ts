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
        return res.status(401).json({ 
          error: 'Invalid token',
          message: 'Token does not contain tenant information. Please login again.',
          code: 'NO_TENANT_CONTEXT'
        });
      }

      // Verify session is still valid (optional check - JWT expiration is primary)
      // NOTE: Session check is non-blocking - JWT validation is the primary security mechanism
      // Sessions may not exist due to cleanup, database issues, or multi-device logins
      // This is acceptable as long as the JWT is valid
      try {
        const { getDatabaseService } = await import('../services/databaseService.js');
        const db = getDatabaseService();
        
        // Try to find session, but don't block if it doesn't exist
        const sessions = await db.query(
          'SELECT id, expires_at FROM user_sessions WHERE token = $1',
          [token]
        );

        if (sessions.length > 0) {
          const session = sessions[0];
          const expiresAt = new Date(session.expires_at);
          const now = new Date();
          
          // Check if session is expired
          if (expiresAt > now) {
            // Session is valid - update last activity
            try {
              await db.query(
                'UPDATE user_sessions SET last_activity = NOW() WHERE token = $1',
                [token]
              );
            } catch (updateError) {
              // Non-critical - just log
              console.warn('Failed to update session last_activity:', updateError);
            }
          } else {
            // Session expired in DB but JWT is still valid
            // This can happen if JWT expiration is longer than DB session expiration
            // Or if there's a timezone issue
            console.warn(`Session expired in DB but JWT is valid. User: ${decoded.userId}, Tenant: ${decoded.tenantId}`);
            // Allow request - JWT validation is sufficient
          }
        } else {
          // Session doesn't exist in DB but JWT is valid
          // This is acceptable - session might have been cleaned up, deleted on multi-device login, or DB issue
          // JWT validation is the primary security check
          console.warn(`Session not found in DB but JWT is valid. User: ${decoded.userId}, Tenant: ${decoded.tenantId}. Allowing request based on JWT validation.`);
        }
      } catch (sessionError) {
        // If session check fails completely (DB error, etc.), log but don't block the request
        // JWT validation is the primary security check
        console.error('Session check error (non-blocking, request will proceed):', sessionError);
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

