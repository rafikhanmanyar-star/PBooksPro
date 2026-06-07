// @ts-nocheck — legacy admin portal middleware (ported from pre-v1.2.180 server/).
import { Response, NextFunction } from 'express';

/**
 * Middleware to ensure only Admin role users can access the route
 * (organization-level users table — not admin_users portal accounts).
 */
export function adminOnlyMiddleware() {
  return async (req: { userRole?: string }, res: Response, next: NextFunction) => {
    try {
      if (!req.userRole) {
        return res.status(401).json({
          error: 'Unauthorized',
          message: 'User role not found. Please login again.',
        });
      }

      const userRole = (req.userRole || '').trim().toLowerCase();
      if (userRole !== 'admin') {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'Only organization administrators can perform this action.',
        });
      }

      next();
    } catch (error) {
      console.error('Admin-only middleware error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  };
}
