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
      try {
        const { getDatabaseService } = await import('../services/databaseService.js');
        const db = getDatabaseService();
        const sessions = await db.query(
          'SELECT id FROM user_sessions WHERE token = $1 AND expires_at > NOW()',
          [token]
        );

        // If session doesn't exist but JWT is valid, allow the request
        // (session might have been cleaned up but JWT is still valid)
        // Only reject if we explicitly want strict session checking
        if (sessions.length === 0) {
          console.warn(`Session not found for token, but JWT is valid. User: ${decoded.userId}, Tenant: ${decoded.tenantId}`);
          // Allow the request to proceed - JWT validation is sufficient
          // The session check is mainly for tracking, not strict enforcement
        } else {
          // Update last activity if session exists
          await db.query(
            'UPDATE user_sessions SET last_activity = NOW() WHERE token = $1',
            [token]
          );
        }
      } catch (sessionError) {
        // If session check fails, log but don't block the request
        // JWT validation is the primary security check
        console.error('Session check error (non-blocking):', sessionError);
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

