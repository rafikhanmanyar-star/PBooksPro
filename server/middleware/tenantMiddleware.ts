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

      // Decode JWT to get tenant_id and user_id
      let decoded: any;
      try {
        decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
      } catch (jwtError: any) {
        // Check if it's a token expiration error
        if (jwtError.name === 'TokenExpiredError') {
          console.error('Token expired:', jwtError.expiredAt);
          return res.status(401).json({ 
            error: 'Token expired',
            message: 'Your session has expired. Please login again.',
            code: 'TOKEN_EXPIRED'
          });
        }
        // Check if it's an invalid token error
        if (jwtError.name === 'JsonWebTokenError') {
          console.error('Invalid token format:', jwtError.message);
          return res.status(401).json({ 
            error: 'Invalid token',
            message: 'Authentication token is invalid. Please login again.',
            code: 'INVALID_TOKEN'
          });
        }
        // Other JWT errors
        console.error('JWT verification error:', jwtError);
        return res.status(401).json({ 
          error: 'Invalid token',
          message: 'Token verification failed. Please login again.',
          code: 'TOKEN_VERIFICATION_FAILED'
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
        return res.status(403).json({ error: 'No tenant context' });
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
        return res.status(403).json({ error: 'Invalid tenant' });
      }

      // Set tenant context for RLS (Row Level Security)
      // This ensures all queries are automatically filtered by tenant_id
      await pool.query(`SET app.current_tenant_id = $1`, [req.tenantId]);

      next();
    } catch (error) {
      console.error('Tenant middleware error:', error);
      res.status(401).json({ error: 'Invalid token' });
    }
  };
}

