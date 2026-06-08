import { Request, Response, NextFunction } from 'express';
import { TenantRequest } from './tenantMiddleware.js';

/**
 * Middleware to ensure only Admin role users can access the route
 * This is for organization-level admin users (users with role 'Admin' in the users table)
 * Not to be confused with admin_users table (which is for the admin portal)
 */
export function adminOnlyMiddleware() {
  return async (req: TenantRequest, res: Response, next: NextFunction) => {
    try {
      // Check if user role is available (should be set by tenantMiddleware)
      if (!req.userRole) {
        return res.status(401).json({ 
          error: 'Unauthorized',
          message: 'User role not found. Please login again.'
        });
      }

      // Only Admin role users can access this route (case-insensitive check)
      const userRole = (req.userRole || '').trim().toLowerCase();
      if (userRole !== 'admin') {
        return res.status(403).json({ 
          error: 'Forbidden',
          message: 'Only organization administrators can perform this action.'
        });
      }

      next();
    } catch (error) {
      console.error('Admin-only middleware error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  };
}

