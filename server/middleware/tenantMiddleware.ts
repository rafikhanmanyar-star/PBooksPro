import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { Pool } from 'pg';
import { runWithTenantContext } from '../services/tenantContext.js';

export interface TenantRequest extends Record<string, any> {
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

      // NOTE: Security queries below run OUTSIDE runWithTenantContext intentionally.
      // The middleware's own queries (user check, session check) must see all data
      // regardless of RLS policy and should use plain pool.query() for efficiency.
      // Only the downstream route handler (next()) runs inside tenant context.

      // PERFORMANCE OPTIMIZATION: Combined user + session + tenant verification into
      // a SINGLE database query using JOINs. Previously this was 3-7 separate sequential
      // queries adding 100-350ms of latency to EVERY request.
      try {
        const combinedResult = await pool.query(
          `SELECT
             u.id AS user_id, u.tenant_id AS user_tenant_id, u.is_active AS user_active,
             s.user_id AS session_user_id, s.tenant_id AS session_tenant_id,
             s.expires_at, s.last_activity,
             t.id AS tenant_exists,
             t.license_type, t.license_status, t.trial_start_date, t.license_expiry_date
           FROM users u
           LEFT JOIN user_sessions s ON s.token = $2
           LEFT JOIN tenants t ON t.id = u.tenant_id
           WHERE u.id = $1`,
          [decoded.userId, token]
        );

        if (combinedResult.rows.length === 0) {
          console.error(`❌ Security: User ${decoded.userId} not found in database`);
          return res.status(401).json({
            error: 'Invalid token',
            message: 'User associated with token does not exist. Please login again.',
            code: 'USER_NOT_FOUND'
          });
        }

        const row = combinedResult.rows[0];

        // Verify user belongs to the claimed tenant
        if (row.user_tenant_id !== decoded.tenantId) {
          console.error(`❌ SECURITY VIOLATION: User ${decoded.userId} belongs to tenant ${row.user_tenant_id} but token claims tenant ${decoded.tenantId}`);
          return res.status(403).json({
            error: 'Forbidden',
            message: 'User does not belong to the organization specified in token. Please login again.',
            code: 'TENANT_MISMATCH'
          });
        }

        // Verify tenant exists
        if (!row.tenant_exists) {
          console.error(`❌ Tenant not found in database: ${req.tenantId}. Token is invalid.`);
          return res.status(401).json({
            error: 'Invalid token',
            message: 'The tenant associated with your token no longer exists. Please login again.',
            code: 'TENANT_NOT_FOUND'
          });
        }

        // Cache license info on request so licenseMiddleware can skip its duplicate query
        (req as any)._tenantLicenseData = {
          license_type: row.license_type,
          license_status: row.license_status,
          trial_start_date: row.trial_start_date,
          license_expiry_date: row.license_expiry_date,
        };

        // Session validation
        if (!row.session_user_id) {
          // Session not found -- attempt recovery
          console.warn('⚠️ Session not found in database, attempting to recover:', {
            tokenPreview,
            userId: decoded?.userId,
            tenantId: decoded?.tenantId,
            path: req.path,
            method: req.method
          });

          if (!row.user_active) {
            console.error('❌ User not found or inactive, cannot recover session');
            return res.status(401).json({
              error: 'Invalid session',
              message: 'Your session is no longer valid. Please login again.',
              code: 'SESSION_INVALID'
            });
          }

          try {
            // Check if user deliberately logged out — if so, don't recreate the session
            const loginCheck = await pool.query(
              'SELECT login_status FROM users WHERE id = $1',
              [decoded.userId]
            );
            if (loginCheck.rows.length > 0 && loginCheck.rows[0].login_status === false) {
              return res.status(401).json({
                error: 'Session ended',
                message: 'You have been logged out. Please login again.',
                code: 'SESSION_INVALID'
              });
            }

            // login_status is TRUE but session missing — race condition after login, recreate
            const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            const expiresAt = new Date();
            expiresAt.setDate(expiresAt.getDate() + 30);

            await pool.query(
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

            pool.query('UPDATE users SET login_status = TRUE WHERE id = $1', [decoded.userId])
              .catch(err => console.warn('Failed to update login_status:', err));

            console.log('✅ Session recovered successfully');
          } catch (recoveryError: any) {
            console.error('❌ Failed to recover session:', recoveryError);
            return res.status(401).json({
              error: 'Invalid session',
              message: 'Your session is no longer valid. Please login again.',
              code: 'SESSION_INVALID'
            });
          }
        } else {
          // Session exists -- validate it
          const expiresAt = new Date(row.expires_at);
          const now = new Date();

          if (expiresAt <= now) {
            // Expired -- cleanup (fire-and-forget)
            pool.query('DELETE FROM user_sessions WHERE token = $1', [token])
              .catch(err => console.warn('Failed to cleanup expired session:', err));
            pool.query('UPDATE users SET login_status = FALSE WHERE id = $1', [decoded.userId])
              .catch(err => console.warn('Failed to update login_status:', err));

            return res.status(401).json({
              error: 'Session expired',
              message: 'Your session has expired. Please login again.',
              code: 'SESSION_EXPIRED'
            });
          }

          // Extra safety: ensure the DB session matches the JWT identity
          if (row.session_user_id !== decoded.userId || row.session_tenant_id !== decoded.tenantId) {
            return res.status(401).json({
              error: 'Invalid session',
              message: 'Session does not match token. Please login again.',
              code: 'SESSION_MISMATCH'
            });
          }

          // Update last activity (fire-and-forget -- don't block the request)
          pool.query('UPDATE user_sessions SET last_activity = NOW() WHERE token = $1', [token])
            .catch(err => console.warn('Failed to update session last_activity:', err));
        }
      } catch (authError) {
        console.error('Authentication check error:', authError);
        return res.status(500).json({
          error: 'Authentication failed',
          message: 'Could not validate session. Please try again.',
          code: 'SESSION_CHECK_FAILED'
        });
      }

      // Establish request-scoped tenant context so DatabaseService can apply
      // Postgres RLS tenant settings on the correct connection for route handlers.
      // Only the downstream route handler (next()) runs inside tenant context.
      return await runWithTenantContext(
        { tenantId: req.tenantId!, userId: req.userId },
        async () => {
          next();
        }
      );
    } catch (error) {
      console.error('Tenant middleware error:', error);
      res.status(401).json({ error: 'Invalid token' });
    }
  };
}

